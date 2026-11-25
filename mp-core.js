// mp-core.js — decodes a Roblox MicroProfiler dump (.x.html, LibMP/GPRX format) and summarizes it.
// Runs in the browser (window.MPCore) and in Node (module.exports) so it can be tested on real dumps.
(function (root) {
  'use strict';
  const TWO32 = 4294967296;
  const TWO48 = 281474976710656;

  // ---------- LZ4 frame ----------
  function lz4Frame(src, sizeHint) {
    if (src[0] !== 0x04 || src[1] !== 0x22 || src[2] !== 0x4d || src[3] !== 0x18) throw new Error('not an LZ4 frame');
    const flg = src[4];
    let i = 6;
    if (flg & 8) i += 8;
    if (flg & 1) i += 4;
    i += 1; // header checksum
    let out = new Uint8Array(Math.max(sizeHint || 0, 1024));
    let o = 0;
    const ensure = (n) => {
      if (o + n <= out.length) return;
      let cap = out.length * 2;
      while (cap < o + n) cap *= 2;
      const next = new Uint8Array(cap);
      next.set(out.subarray(0, o));
      out = next;
    };
    for (;;) {
      let size = (src[i] | (src[i + 1] << 8) | (src[i + 2] << 16) | (src[i + 3] << 24)) >>> 0;
      i += 4;
      if (size === 0) break;
      const raw = size & 0x80000000;
      size &= 0x7fffffff;
      if (raw) {
        ensure(size);
        out.set(src.subarray(i, i + size), o);
        o += size;
      } else {
        const end = i + size;
        let p = i;
        while (p < end) {
          const tok = src[p++];
          let lit = tok >> 4;
          if (lit === 15) { let b; do { b = src[p++]; lit += b; } while (b === 255); }
          ensure(lit);
          out.set(src.subarray(p, p + lit), o);
          o += lit; p += lit;
          if (p >= end) break;
          const off = src[p] | (src[p + 1] << 8);
          p += 2;
          let ml = tok & 15;
          if (ml === 15) { let b; do { b = src[p++]; ml += b; } while (b === 255); }
          ml += 4;
          ensure(ml);
          let from = o - off;
          for (let k = 0; k < ml; k++) out[o++] = out[from++]; // byte-wise: matches may overlap
        }
      }
      i += size;
      if (flg & 0x10) i += 4;
    }
    return out.subarray(0, o);
  }

  function base64ToBytes(s) {
    s = s.replace(/=+$/, '');
    if (s.length % 4 === 1) s = s.slice(0, -1);
    while (s.length % 4) s += '=';
    if (typeof atob === 'function') {
      const bin = atob(s);
      const b = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) b[k] = bin.charCodeAt(k);
      return b;
    }
    return new Uint8Array(Buffer.from(s, 'base64'));
  }

  function hexLE32(h) { // 8 hex chars, little-endian
    return parseInt(h.slice(6, 8) + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2), 16);
  }

  // ---------- binary readers ----------
  function reader(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      bytes, len: bytes.length,
      u8: (p) => bytes[p],
      u16: (p) => dv.getUint16(p, true),
      u32: (p) => dv.getUint32(p, true),
      i32: (p) => dv.getInt32(p, true),
      f32: (p) => dv.getFloat32(p, true),
      u48: (p) => (dv.getUint32(p + 4, true) & 0xffff) * TWO32 + dv.getUint32(p, true), // low 48 bits of a u64
    };
  }
  const td = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
  const utf8 = (bytes) => (td ? td.decode(bytes) : Buffer.from(bytes).toString('utf8'));

  // Size-prefixed flatbuffers laid back to back, 8-byte aligned, zero padding between groups.
  function records(r, lo = 0, hi = r.len) {
    const out = [];
    let i = lo;
    while (i + 4 <= hi) {
      const n = r.u32(i);
      if (n === 0) { i += 8; continue; }
      if (i + 4 + n > r.len) break;
      out.push(i + 4);
      i += 4 + n;
      i += (8 - (i % 8)) % 8;
    }
    return out;
  }
  function table(r, base) {
    const pos = base + r.u32(base);
    const vt = pos - r.i32(pos);
    const vlen = r.u16(vt);
    const f = {};
    for (let k = 0; k < (vlen - 4) / 2; k++) {
      const o = r.u16(vt + 4 + 2 * k);
      if (o) f[k] = pos + o;
    }
    return f;
  }
  function str(r, p) { const q = p + r.u32(p); const n = r.u32(q); return utf8(r.bytes.subarray(q + 4, q + 4 + n)); }
  function vec(r, p) { const q = p + r.u32(p); return [q + 4, r.u32(q)]; }

  // ---------- container ----------
  function decodeBlocks(text) {
    const re = /BCJNG[A-Za-z0-9+/=]*/g;
    const blocks = [];
    let m;
    while ((m = re.exec(text))) {
      const hdr = text.slice(m.index - 64, m.index); // 32-byte block header, hex
      const id = hexLE32(hdr.slice(40, 48));
      const size = hexLE32(hdr.slice(48, 56));
      blocks.push({ id, data: lz4Frame(base64ToBytes(m[0]), size) });
    }
    if (blocks.length < 4) throw new Error('Không tìm thấy dữ liệu MicroProfiler trong file này. Hãy dùng file microprofile-*.x.html được tạo bằng nút Dump.');
    return blocks;
  }

  function parseDump(text) {
    const blocks = decodeBlocks(text);
    const byId = new Map(blocks.map((b) => [b.id, b.data]));
    // Blocks 0..3 in order: general info, descriptors, thread logs, frames.
    const metaBytes = blocks[0].data;
    const metaR = reader(metaBytes);
    const tickCpu = metaR.f32(0x18), tickGpu = metaR.f32(0x1c);
    let meta = {};
    const s = utf8(metaBytes);
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) { try { meta = JSON.parse(s.slice(a, b + 1)); } catch (e) { /* keep empty */ } }

    // Descriptor block: groups, timers, counters, threads; each table starts where the id drops.
    const d = reader(blocks[1].data);
    const sections = [[]];
    let prev = 0;
    for (const base of records(d)) {
      const f = table(d, base);
      const id = d.u32(f[0]);
      if (id < prev && sections.length < 4) sections.push([]);
      sections[sections.length - 1].push(f);
      prev = id;
    }
    if (sections.length < 4) throw new Error('Không đọc được bảng mô tả (timer/thread) trong dump.');
    const groups = new Map(), timers = new Map(), threads = new Map();
    for (const f of sections[0]) groups.set(d.u32(f[0]), str(d, f[1]));
    for (const f of sections[1]) timers.set(d.u32(f[0]), { name: str(d, f[1]), group: groups.get(f[2] ? d.u32(f[2]) : 0) || '' });
    for (const f of sections[3]) threads.set(d.u32(f[0]), { name: str(d, f[1]).trim(), gpu: f[3] ? d.u8(f[3]) !== 0 : false });

    const fr = reader(blocks[3].data);
    const frames = records(fr).map((base) => {
      const f = table(fr, base);
      const [q, n] = vec(fr, f[10]);
      const logs = [];
      for (let t = 0; t < n; t++) {
        const o = q + 24 * t;
        const cnt = fr.u32(o + 4);
        if (cnt) logs.push({ tid: fr.u32(o), cnt, block: fr.u32(o + 12), index: fr.u32(o + 8) });
      }
      return { start: fr.u48(f[2]), end: fr.u48(f[3]), logs };
    });
    return { meta, tickCpu, tickGpu, timers, threads, frames, byId };
  }

  // ---------- analysis ----------
  // Where Main-thread time goes, per frame. A scope inherits shadow/present/studio from its parent subtree.
  const CATS = ['render', 'shadow', 'gui', 'script', 'physics', 'present', 'studio', 'other'];
  const STUDIO_NAMES = new Set(['StandardAdorns', 'Pass3dAdorn', 'RenderWorkspaceAdorns', 'FrameCheck', 'ProfilerAdorn', 'Profiler']);
  const GUI_NAMES = new Set(['Prepare2dWindow', 'fillGuiVertices', 'TextRender::render', 'UITextureRenderer::compositeUITextures', 'Process GuiEffect']);
  function catOf(name, group) {
    if (STUDIO_NAMES.has(name) || group === 'MicroProfiler' || group === 'Qt' || group === 'QtUIThread') return 6;
    if (name === 'ShadowMapSystem::updatePerform' || group === 'Shadows' || group === 'ShadowMap') return 1;
    if (name === 'Present') return 5;
    if (GUI_NAMES.has(name) || name.startsWith('Pass2d') || group === 'UI') return 2;
    if (group === 'Script' || group === 'LuaBridge') return 3;
    if (group === 'Physics') return 4;
    if (group === 'Render' || group === 'GPU' || group === 'FroxelGrid') return 0;
    return 7;
  }
  const INHERIT = new Set([1, 5, 6]);

  // Summary (per-frame averages, ms) over frames [from, to] (inclusive, 0-based). Serializable.
  function summarize(dump, opts = {}) {
    const minRow = opts.minRowMs ?? 0.002, minNode = opts.minNodeMs ?? 0.01, maxDepth = opts.maxDepth ?? 14;
    const { timers, threads, byId, tickCpu, tickGpu } = dump;
    const from = Math.max(0, opts.from ?? 0), to = Math.min(dump.frames.length - 1, opts.to ?? dump.frames.length - 1);
    const frames = dump.frames.slice(from, to + 1);
    const readers = new Map();
    for (const [id, bytes] of byId) readers.set(id, new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    const tInfo = (t) => timers.get(t) || { name: `timer${t}`, group: '' };
    const sleepIds = new Set([...timers].filter(([, v]) => v.name === 'Sleep').map(([k]) => k));
    let mainTid = null;
    for (const [id, t] of threads) if (t.name === 'RBX Main') mainTid = id;

    const flat = new Map(); // tid*8192+tim -> [incl, excl, calls]
    const busy = new Map(), sleep = new Map();
    const nodes = []; // {tim, incl, excl, calls, kids:[]}
    const nodeIdx = new Map();
    const rootKids = new Map(); // tid -> [node indexes]
    let unmatched = 0;
    function nodeFor(tid, parent, tim) {
      const key = parent < 0 ? -(tid * 8192 + tim) - 1 : parent * 8192 + tim;
      let n = nodeIdx.get(key);
      if (n === undefined) {
        n = nodes.length;
        nodes.push({ tim, incl: 0, excl: 0, calls: 0, kids: [] });
        nodeIdx.set(key, n);
        if (parent < 0) { if (!rootKids.has(tid)) rootKids.set(tid, []); rootKids.get(tid).push(n); }
        else nodes[parent].kids.push(n);
      }
      return n;
    }

    const frameMs = [], cats = [];
    for (const fr of frames) {
      frameMs.push(((fr.end - fr.start + TWO48) % TWO48) * tickCpu);
      const cat = new Float64Array(CATS.length);
      for (const lg of fr.logs) {
        const dv = readers.get(lg.block);
        if (!dv) continue;
        const isMain = lg.tid === mainTid;
        const k = (threads.get(lg.tid) || {}).gpu ? tickGpu : tickCpu;
        const stack = []; // {tim, tick, child, node, cat}
        const off = lg.index * 8;
        let e = 0;
        while (e < lg.cnt) {
          const lo = dv.getUint32(off + 8 * e, true), hi = dv.getUint32(off + 8 * e + 4, true);
          const typ = hi >>> 29, tim = (hi >>> 16) & 0x1fff;
          if (typ === 6) { // event: header + 2 words per size step + optional label word
            e += 1 + 2 * Math.min((hi >>> 26) & 3, 2) + ((hi >>> 28) & 1);
            continue;
          }
          e++;
          const tick = (hi & 0xffff) * TWO32 + lo;
          if (typ === 1) {
            const top = stack.length ? stack[stack.length - 1] : null;
            let c = 7, inh = false;
            if (isMain) {
              if (top && top.inh) { c = top.cat; inh = true; }
              else {
                const t = tInfo(tim);
                c = catOf(t.name, t.group);
                // Studio's Qt event scopes wrap real render work, so they do not pass their category down.
                inh = INHERIT.has(c) && t.group !== 'Qt' && t.group !== 'QtUIThread';
              }
            }
            stack.push({ tim, tick, child: 0, cat: c, inh, node: stack.length < maxDepth ? nodeFor(lg.tid, top ? top.node : -1, tim) : -1 });
          } else if (typ === 0) {
            let idx = -1;
            for (let s = stack.length - 1; s >= 0; s--) if (stack[s].tim === tim) { idx = s; break; }
            if (idx < 0) { unmatched++; continue; }
            stack.length = idx + 1;
            const top = stack.pop();
            const dt = (tick - top.tick + TWO48) % TWO48;
            const ms = dt * k, self = (dt - top.child) * k;
            const key = lg.tid * 8192 + tim;
            let row = flat.get(key);
            if (!row) { row = [0, 0, 0]; flat.set(key, row); }
            row[0] += ms; row[1] += self; row[2]++;
            if (top.node >= 0) { const nd = nodes[top.node]; nd.incl += ms; nd.excl += self; nd.calls++; }
            if (isMain) cat[top.cat] += self;
            if (stack.length) stack[stack.length - 1].child += dt;
            else {
              busy.set(lg.tid, (busy.get(lg.tid) || 0) + ms);
              if (sleepIds.has(tim)) sleep.set(lg.tid, (sleep.get(lg.tid) || 0) + ms);
            }
          }
        }
      }
      cats.push(Array.from(cat, (v) => Math.round(v * 1000) / 1000));
    }

    const nf = frames.length || 1;
    const threadList = [...threads].map(([id, t]) => ({ id, name: t.name, gpu: t.gpu, busy: (busy.get(id) || 0) / nf, sleep: (sleep.get(id) || 0) / nf }))
      .filter((t) => t.busy > 0).sort((a, b) => (b.busy - b.sleep) - (a.busy - a.sleep));
    const rows = [];
    for (const [key, [incl, excl, calls]] of flat) {
      if (incl / nf < minRow) continue;
      const t = tInfo(key % 8192);
      rows.push({ tid: Math.floor(key / 8192), name: t.name, group: t.group || '', incl: incl / nf, self: excl / nf, calls: calls / nf });
    }
    function build(n) {
      const nd = nodes[n];
      if (nd.incl / nf < minNode) return null;
      const t = tInfo(nd.tim);
      const kids = nd.kids.map(build).filter(Boolean).sort((a, b) => b.incl - a.incl);
      return { name: t.name, group: t.group || '', incl: nd.incl / nf, self: nd.excl / nf, calls: nd.calls / nf, kids };
    }
    const trees = {};
    for (const t of threadList) {
      const kids = (rootKids.get(t.id) || []).map(build).filter(Boolean).sort((a, b) => b.incl - a.incl);
      if (kids.length) trees[t.id] = kids;
    }
    return {
      meta: dump.meta, from, to, frames: frames.length, mainTid,
      frameMs: frameMs.map((v) => Math.round(v * 1000) / 1000), cats, catNames: CATS,
      threads: threadList, rows, trees, unmatched,
    };
  }

  function analyzeText(text, opts) { return summarize(parseDump(text), opts); }

  const api = { parseDump, summarize, analyzeText, lz4Frame, CATS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MPCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
