// app.js — UI for MicroProfiler Reader. Needs MPCore (mp-core.js) and MPGlossary (glossary.js).
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f2 = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
  const f1 = (v) => v.toFixed(1);
  const CAT_LABEL = ['Render', 'Bóng đổ', 'GUI', 'Script', 'Vật lý', 'Present', 'Studio/Profiler', 'Khác'];
  const CAT_HELP = ['vẽ cảnh 3D', 'bóng đổ', 'giao diện 2D', 'Luau', 'physics', 'đưa frame lên màn hình, chờ driver/GPU', 'chỉ có trong Studio hoặc khi mở MicroProfiler', 'còn lại'];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  };

  // slot: { name, sample, dump (parsed, or null when restored from history), sum, fsum }
  const S = { A: null, B: null, view: 'A', frame: null, threadName: 'RBX Main', sort: 'self', showAll: false };
  $('tAvg').value = store.get('mpr.tAvg', '10');
  $('tMax').value = store.get('mpr.tMax', '12');
  const targets = () => ({ avg: parseFloat($('tAvg').value) || 10, max: parseFloat($('tMax').value) || 12 });

  const viewSlot = () => S[S.view] || S.A || S.B;
  const otherSlot = () => { const v = viewSlot(); const o = v === S.A ? S.B : S.A; return o && v ? o : null; };
  const cur = () => { const v = viewSlot(); return v ? (S.frame !== null && v.fsum ? v.fsum : v.sum) : null; };

  function stats(sum) {
    const ms = sum.frameMs.slice().sort((a, b) => a - b), n = ms.length;
    const avg = ms.reduce((a, b) => a + b, 0) / n;
    const q = (p) => ms[Math.min(n - 1, Math.floor(n * p))];
    const t = targets();
    let slow = 0;
    sum.frameMs.forEach((v, i) => { if (v > sum.frameMs[slow]) slow = i; });
    const catAvg = sum.catNames.map((_, i) => sum.cats.reduce((a, r) => a + r[i], 0) / n);
    const mainWork = catAvg.reduce((a, b) => a + b, 0);
    const gpu = sum.threads.find((x) => x.gpu);
    return { n, avg, p50: q(0.5), p95: q(0.95), max: ms[n - 1], fps: 1000 / avg, over: sum.frameMs.filter((v) => v > t.max).length,
      slow, catAvg, mainWork, idle: Math.max(0, avg - mainWork), gpu: gpu ? gpu.busy - gpu.sleep : 0 };
  }
  const mainRows = (sum) => { const m = new Map(); for (const r of sum.rows) if (r.tid === sum.mainTid) m.set(r.name, r); return m; };
  const meterHtml = (v, max, hot) => `<div class="meter${hot ? ' hot' : ''}"><span style="width:${Math.min(100, (v / (max || 1)) * 100).toFixed(1)}%"></span></div>`;
  function deltaHtml(b, a, unit = '', lowerIsBetter = true) {
    if (a === undefined || a === null) return '<span class="d-zero">—</span>';
    const d = b - a;
    if (Math.abs(d) < 0.005) return '<span class="d-zero">±0</span>';
    const good = lowerIsBetter ? d < 0 : d > 0;
    const pct = a ? ` (${d > 0 ? '+' : ''}${Math.round((d / a) * 100)}%)` : '';
    return `<span class="${good ? 'd-good' : 'd-bad'}">${d > 0 ? '+' : '−'}${f2(Math.abs(d))}${unit}${pct}</span>`;
  }
  function whyHtml(name, group) {
    const g = MPGlossary.explain(name, group);
    return g ? `<div class="why${g.certain ? '' : ' guess'}">${esc(g.text)}</div>` : '';
  }

  // ---------- findings ----------
  function findings(sum, meta) {
    const out = [], t = targets(), s = stats(sum), m = mainRows(sum);
    const add = (lvl, text) => out.push([lvl, text]);
    const r = (n) => m.get(n);
    const single = sum.frames === 1;
    if (s.avg < t.avg) add('ok', `${single ? 'Frame này' : 'Frame trung bình'} ${f2(s.avg)} ms, đạt mục tiêu < ${t.avg} ms (~${Math.round(s.fps)} FPS).`);
    else add('err', `${single ? 'Frame này' : 'Frame trung bình'} ${f2(s.avg)} ms, vượt mục tiêu ${t.avg} ms.`);
    if (!single) {
      if (s.over) add(s.over > s.n * 0.05 ? 'err' : 'warn', `${s.over}/${s.n} frame vượt trần ${t.max} ms. Chậm nhất là frame ${s.slow + 1} (${f2(sum.frameMs[s.slow])} ms): bấm vào nó trong biểu đồ để xem.`);
      else add('ok', `Không frame nào vượt trần ${t.max} ms (chậm nhất ${f2(s.max)} ms).`);
    }
    const share = s.mainWork / s.avg;
    if (share > 0.85) add('info', `RBX Main bận ${Math.round(share * 100)}% thời gian frame: luồng Main đang quyết định FPS, tối ưu nên nhắm vào Main.`);
    if (s.gpu > s.avg * 0.85) add('warn', `GPU bận ${f2(s.gpu)} ms/frame, gần bằng cả frame: có thể đang nghẽn GPU.`);
    const spot = r('ShadowObjectSpot');
    if (spot && spot.calls > 8) add(spot.calls > 20 ? 'err' : 'warn', `ShadowObjectSpot chạy ${f1(spot.calls)} lần/frame (${f2(spot.incl)} ms): nhiều SpotLight/SurfaceLight có Shadows = true đang được tính bóng. Tắt Shadows cho đèn nhỏ hoặc ở xa, hoặc dùng LOD đèn.`);
    const point = r('ShadowObjectPoint');
    if (point && point.calls > 4) add('warn', `ShadowObjectPoint chạy ${f1(point.calls)} lần/frame (${f2(point.incl)} ms): nhiều PointLight có bóng. Bóng PointLight đắt hơn SpotLight.`);
    const draw = r('drawFrustums');
    if (draw && draw.incl > 1) add('warn', `drawFrustums ${f2(draw.incl)} ms: shadow map bị vẽ lại mỗi frame vì có vật đang chuyển động (nhân vật, NPC animate). Bớt đèn có bóng ở gần, hoặc dừng animation NPC ở xa.`);
    const rq = r('updateRenderQueue');
    if (rq && rq.self > 1.5) add('warn', `updateRenderQueue ${f2(rq.self)} ms: nhiều vật trong tầm nhìn. Gộp part thành mesh, giảm StreamingTargetRadius hoặc bớt chi tiết nhỏ.`);
    if (s.catAvg[2] > 0.8) add('warn', `GUI tốn ${f2(s.catAvg[2])} ms/frame trên Main. Kiểm tra ScreenGui đang bật, SurfaceGui (MaxDistance) và chữ cập nhật liên tục.`);
    const text = r('TextRender::render');
    if (text && text.calls > 80) add('info', `TextRender::render chạy ${Math.round(text.calls)} lần/frame: có nhiều khối chữ đang hiển thị.`);
    const tex = r('TextureManager2::processPendingRequests');
    if (tex && tex.self > 0.5) add('info', `Đang tải texture (${f2(tex.self)} ms/frame). Thường chỉ cao lúc mới vào map.`);
    const scripts = sum.rows.filter((x) => x.group === 'Script' && x.name.startsWith('Script_'));
    const scriptTotal = sum.rows.filter((x) => x.group === 'Script').reduce((a, x) => a + x.self, 0);
    if (scriptTotal > 1.5) {
      const top = scripts.sort((a, b) => b.self - a.self).slice(0, 3).map((x) => `${x.name.slice(7)} ${f2(x.self)} ms`).join(', ');
      add('warn', `Script Luau tốn ${f2(scriptTotal)} ms/frame trên mọi luồng.${top ? ' Nặng nhất: ' + top + '.' : ''}`);
    }
    const phys = sum.rows.filter((x) => x.group === 'Physics').reduce((a, x) => a + x.self, 0);
    if (phys > 2) add('warn', `Vật lý tốn ${f2(phys)} ms/frame. Anchor các part không cần physics.`);
    const mp = ['FrameCheck', 'ProfilerAdorn', 'Detailed View', 'Draw', 'Profiler'].reduce((a, n) => a + (r(n) ? r(n).self : 0), 0);
    if (mp > 0.15) add('info', `MicroProfiler đang mở tự tốn khoảng ${f2(mp)} ms/frame. Khi đóng profiler, game nhanh hơn số đo một chút.`);
    if (meta && meta.Build === 'Studio') add('info', `Dump từ Studio: khoảng ${f2(s.catAvg[6])} ms là của Studio/profiler, Present và khoảng trống cuối frame cũng cao hơn client thật. Đo trên Roblox Client để có số chính xác.`);
    return out;
  }

  // ---------- render ----------
  function renderStatus() {
    const chips = [];
    for (const k of ['A', 'B']) {
      const sl = S[k];
      if (!sl) { if (k === 'B' && S.A) chips.push('<span class="chip slotB"><b>B</b> <span class="muted">trống</span> <button type="button" data-open="B">mở dump để so sánh</button></span>'); continue; }
      const st = stats(sl.sum);
      chips.push(`<span class="chip slot${k}${sl.sample ? ' sample' : ''}"><b>${k}${S.A && S.B ? (k === 'A' ? ' · trước' : ' · sau') : ''}</b> ${esc(sl.name)} · ${f2(st.avg)} ms${sl.dump ? '' : ' · từ lịch sử'}</span>`);
    }
    if (S.A && S.B) chips.push(`<span class="seg" role="group" aria-label="Đang xem"><button type="button" data-view="A" aria-pressed="${S.view === 'A'}">Xem A</button><button type="button" data-view="B" aria-pressed="${S.view === 'B'}">Xem B</button></span>`);
    const m = viewSlot().sum.meta || {};
    const add = (k, label) => m[k] && chips.push(`<span class="chip"><b>${label}</b> ${esc(m[k])}</span>`);
    add('Build', 'Bản'); add('Version', 'Phiên bản'); add('CpuMake', 'CPU'); add('GpuName', 'GPU'); add('DisplaySize', 'Màn hình'); add('QualityLevel', 'Đồ họa');
    $('status').innerHTML = chips.join('');
  }

  function renderFindings() {
    const items = findings(cur(), viewSlot().sum.meta);
    const lv = { ok: 'Ổn', info: 'Thông tin', warn: 'Lưu ý', err: 'Vượt mục tiêu' };
    $('findings').innerHTML = (S.frame !== null ? `<li><span class="pill frm">Frame ${S.frame + 1}</span><span class="muted">Đang xem riêng frame này. Bấm Esc hoặc "Bỏ chọn" để quay về toàn bộ dump.</span></li>` : '') +
      items.map(([l, t]) => `<li><span class="pill ${l}">${lv[l]}</span><span>${esc(t)}</span></li>`).join('');
  }

  function renderStats() {
    const t = targets(), both = S.A && S.B;
    const V = stats(viewSlot().sum), O = both ? stats(otherSlot().sum) : null;
    const isB = viewSlot() === S.B;
    $('statsHint').textContent = both ? `Đang xem ${isB ? 'B (sau)' : 'A (trước)'}. Dòng nhỏ là số của ${isB ? 'A' : 'B'} và mức thay đổi; xanh là nhanh hơn.` : 'Mở thêm một dump (nút "Mở dump để so sánh") để xem trước/sau.';
    const tiles = [
      ['Frame trung bình', 'avg', 'ms', (v) => (v < t.avg ? 'good' : 'bad')],
      ['p50', 'p50', 'ms', null], ['p95', 'p95', 'ms', (v) => (v <= t.max ? 'good' : 'warn')],
      ['Chậm nhất', 'max', 'ms', (v) => (v <= t.max ? 'good' : 'bad')],
      ['FPS ước tính', 'fps', '', null, false],
      ['Frame vượt trần', 'over', '', (v) => (v ? 'warn' : 'good')],
      ['RBX Main làm việc', 'mainWork', 'ms', null], ['GPU bận', 'gpu', 'ms', null],
    ];
    const txt = (key, v) => (key === 'over' ? String(v) : key === 'fps' ? String(Math.round(v)) : f2(v));
    $('stats').innerHTML = tiles.map(([label, key, unit, cls, lower]) => {
      // deltas always read "after − before" so green means the later dump is faster
      const cmp = O ? `<div class="cmp">${isB ? 'A' : 'B'}: ${txt(key, O[key])}${unit ? ' ' + unit : ''} · ${isB ? deltaHtml(V[key], O[key], '', lower !== false) : deltaHtml(O[key], V[key], '', lower !== false)}</div>` : '';
      return `<div class="kpi ${cls ? cls(V[key]) : 'plain'}"><div class="label">${label}</div><div class="value">${txt(key, V[key])} <small>${unit}</small></div>${cmp}</div>`;
    }).join('');
  }

  function renderBudget() {
    const st = stats(cur()), t = targets();
    const segs = st.catAvg.map((v, i) => [i, v]).filter(([, v]) => v > 0.005);
    const total = Math.max(t.avg, st.avg);
    let html = segs.map(([i, v]) => `<span class="b${i}" style="width:${(v / total) * 100}%" title="${CAT_LABEL[i]}: ${f2(v)} ms"></span>`).join('');
    html += `<span class="bidle" style="width:${(st.idle / total) * 100}%" title="Main rảnh/chờ: ${f2(st.idle)} ms"></span>`;
    if (st.avg > t.avg) html += `<span class="over" style="left:${(t.avg / total) * 100}%"></span>`;
    $('budget').innerHTML = html;
    $('budget').setAttribute('aria-label', `Main dùng ${f2(st.avg)} trên ${t.avg} ms mục tiêu`);
    $('budgetScale').innerHTML = `<span>0 ms</span><span class="num">${f2(st.avg)} / ${t.avg} ms${st.avg <= t.avg ? ` · còn dư ${f2(t.avg - st.avg)} ms` : ` · vượt ${f2(st.avg - t.avg)} ms`}</span>`;
    $('budgetLegend').innerHTML = segs.map(([i, v]) => `<span title="${CAT_HELP[i]}"><i class="sw b${i}"></i>${CAT_LABEL[i]} <span class="num">${f2(v)}</span></span>`).join('') +
      `<span title="Main không chạy scope nào: đang chờ hoặc việc engine không ghi lại"><i class="sw bidle"></i>Rảnh <span class="num">${f2(st.idle)}</span></span>`;
  }

  function renderChart() {
    const sl = viewSlot(), sum = sl.sum, svg = $('chart');
    const W = Math.max(svg.clientWidth || 800, 320), H = 230, pad = { l: 36, r: 6, t: 8, b: 20 };
    const t = targets(), f = sum.frameMs, n = f.length;
    const top = Math.max(...f, t.max) * 1.08;
    const step = top > 40 ? 10 : top > 20 ? 5 : 2;
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
    const bw = (W - pad.l - pad.r) / n;
    let s = '';
    for (let v = 0; v <= top; v += step) s += `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 5}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    for (let i = 0; i < n; i++) {
      const x = pad.l + i * bw + bw * 0.1, w = Math.max(bw * 0.8, 1);
      let acc = 0;
      sum.cats[i].forEach((v, k) => { if (v <= 0) return; s += `<rect class="f${k}" x="${x}" y="${y(acc + v)}" width="${w}" height="${Math.max(y(acc) - y(acc + v), 0)}"/>`; acc += v; });
      if (f[i] > acc) s += `<rect class="fidle" x="${x}" y="${y(f[i])}" width="${w}" height="${Math.max(y(acc) - y(f[i]), 0)}"/>`;
      s += `<rect class="hit" data-i="${i}" x="${pad.l + i * bw}" y="${pad.t}" width="${bw}" height="${H - pad.t - pad.b}"><title>Frame ${i + 1}: ${f[i].toFixed(2)} ms</title></rect>`;
    }
    s += `<line class="t-avg" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t.avg)}" y2="${y(t.avg)}"/><line class="t-max" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t.max)}" y2="${y(t.max)}"/>`;
    if (S.frame !== null) s += `<rect class="selbox" x="${pad.l + S.frame * bw}" y="${pad.t}" width="${bw}" height="${H - pad.t - pad.b}"/>`;
    s += `<text x="${pad.l}" y="${H - 5}">frame 1</text><text x="${W - pad.r}" y="${H - 5}" text-anchor="end">frame ${n} · ms</text>`;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = s;
    $('chartLegend').innerHTML = CAT_LABEL.map((l, i) => `<span><i class="sw b${i}"></i>${l}</span>`).join('') +
      '<span><i class="sw bidle"></i>Rảnh</span><span style="color:var(--good)">- - mục tiêu</span><span style="color:var(--bad)">- - trần</span>';
    if (S.frame === null) {
      $('framebar').innerHTML = `<span class="muted">${sl.dump ? 'Chưa chọn frame. Bấm vào một cột để xem chi tiết.' : 'Dump lấy từ lịch sử chỉ có số tổng. Mở lại file gốc để xem từng frame.'}</span>`;
    } else {
      const c = sum.cats[S.frame];
      $('framebar').innerHTML = `<button type="button" data-step="-1" aria-label="Frame trước">←</button><b>Frame ${S.frame + 1}/${n}</b><span class="num">${f2(sum.frameMs[S.frame])} ms</span>` +
        c.map((x, k) => (x > 0.01 ? `<span><i class="sw b${k}"></i> ${CAT_LABEL[k]} <span class="num">${f2(x)}</span></span>` : '')).join('') +
        '<button type="button" data-step="1" aria-label="Frame sau">→</button><button type="button" data-step="0">Bỏ chọn (Esc)</button>';
    }
  }

  function renderThreads() {
    const sum = cur(), st = stats(sum), o = otherSlot();
    const other = o && S.frame === null ? new Map(o.sum.threads.map((x) => [x.name, x.busy - x.sleep])) : null;
    const rows = sum.threads.map((x) => ({ ...x, work: Math.max(x.busy - x.sleep, 0) })).filter((x) => x.work >= 0.01).slice(0, 14);
    $('threads').innerHTML = `<thead><tr><th>Luồng</th><th class="r">Bận (ms/frame)</th><th>So với frame (${f2(st.avg)} ms)</th>${other ? `<th class="r">Δ so với ${viewSlot() === S.A ? 'B' : 'A'}</th>` : ''}</tr></thead><tbody>` +
      rows.map((x) => `<tr><td class="name">${esc(x.name)}${x.gpu ? ' <span class="tag">GPU</span>' : ''}</td><td class="r num">${f2(x.work)}</td><td>${meterHtml(x.work, st.avg, x.work / st.avg > 0.85)}</td>${other ? `<td class="r num">${deltaHtml(x.work, other.get(x.name))}</td>` : ''}</tr>`).join('') + '</tbody>';
  }

  function threadOptions() {
    const sum = cur();
    const list = sum.threads.filter((x) => sum.rows.some((r) => r.tid === x.id));
    $('thread').innerHTML = list.map((x) => `<option value="${esc(x.name)}">${esc(x.name)}${x.gpu ? ' (GPU)' : ''}</option>`).join('');
    if (!list.some((x) => x.name === S.threadName)) S.threadName = (list.find((x) => x.name === 'RBX Main') || list[0] || {}).name;
    $('thread').value = S.threadName;
  }
  const tidOf = (sum, name) => (sum.threads.find((x) => x.name === name) || {}).id;

  function renderScopes() {
    const sum = cur(), tid = tidOf(sum, S.threadName), q = $('search').value.trim().toLowerCase();
    const o = otherSlot();
    let other = null;
    if (o && S.frame === null) {
      const otid = tidOf(o.sum, S.threadName);
      other = new Map(o.sum.rows.filter((r) => r.tid === otid).map((r) => [r.name, r.self]));
    }
    let rows = sum.rows.filter((r) => r.tid === tid && (!q || r.name.toLowerCase().includes(q)));
    rows.sort((a, b) => b[S.sort] - a[S.sort]);
    const total = rows.length;
    if (!S.showAll && !q) rows = rows.slice(0, 30);
    $('topCmd').textContent = `Scope tốn thời gian${S.frame !== null ? ` · frame ${S.frame + 1}` : ''}`;
    const head = (k, label) => `<th class="r"><button type="button" data-sort="${k}" aria-sort="${S.sort === k ? 'descending' : 'none'}">${label}</button></th>`;
    $('scopes').innerHTML = `<thead><tr><th>Scope</th>${head('self', 'Self ms')}${head('incl', 'Gồm con ms')}${head('calls', 'Lần/frame')}${other ? '<th class="r">Δ self</th>' : ''}</tr></thead><tbody>` +
      (rows.length ? rows.map((r) => `<tr><td><div class="name">${esc(r.name)} ${r.group ? `<span class="tag">${esc(r.group)}</span>` : ''}</div>${whyHtml(r.name, r.group)}</td><td class="r num">${f2(r.self)}</td><td class="r num">${f2(r.incl)}</td><td class="r num">${f1(r.calls)}</td>${other ? `<td class="r num">${deltaHtml(r.self, other.get(r.name))}</td>` : ''}</tr>`).join('')
        : `<tr><td colspan="5" class="muted">Không có scope nào khớp "${esc(q)}".</td></tr>`) + '</tbody>';
    $('more').innerHTML = !q && total > 30 ? `<button type="button" class="linkbtn" id="toggleAll">${S.showAll ? 'Chỉ hiện 30 mục đầu' : `Hiện tất cả ${total} scope`}</button>` : '';
  }

  function renderTree() {
    const sl = viewSlot(), sum = cur(), tid = tidOf(sum, S.threadName);
    $('treeCmd').textContent = `Cây lời gọi · ${S.threadName}${S.frame !== null ? ` · frame ${S.frame + 1}` : ''}`;
    const roots = sum.trees && sum.trees[tid];
    if (!roots || !roots.length) {
      $('tree').innerHTML = `<p class="muted">${sl.dump ? 'Luồng này không có scope nào đủ lớn để hiện.' : 'Dump lấy từ lịch sử không lưu cây lời gọi. Mở lại file gốc để xem.'}</p>`;
      return;
    }
    const avg = sum.frameMs.reduce((a, b) => a + b, 0) / sum.frameMs.length;
    const node = (n, depth) => {
      const row = `<span class="row"><span class="name">${esc(n.name)}</span><span class="num">${f2(n.incl)} ms</span><span class="num muted">self ${f2(n.self)} · ×${f1(n.calls)}</span></span><div class="meter" style="max-width:240px"><span style="width:${Math.min(100, (n.incl / avg) * 100).toFixed(1)}%"></span></div>${whyHtml(n.name, n.group)}`;
      if (!n.kids || !n.kids.length) return `<div class="leaf">${row}</div>`;
      return `<details${depth < 2 ? ' open' : ''}><summary>${row}</summary>${n.kids.map((k) => node(k, depth + 1)).join('')}</details>`;
    };
    $('tree').innerHTML = roots.map((r) => node(r, 0)).join('');
  }

  // ---------- history ----------
  const HKEY = 'mpr.history.v1';
  const readHist = () => { try { return JSON.parse(store.get(HKEY, '[]')) || []; } catch (e) { return []; } };
  function remember(slot) {
    const s = slot.sum;
    const keepTids = new Set(s.threads.slice(0, 12).map((x) => x.id));
    const rows = [];
    for (const tid of keepTids) rows.push(...s.rows.filter((r) => r.tid === tid).sort((a, b) => b.self - a.self).slice(0, tid === s.mainTid ? 150 : 25));
    const item = { id: Date.now(), name: slot.name, savedAt: new Date().toISOString(),
      sum: { meta: s.meta, frames: s.frames, mainTid: s.mainTid, frameMs: s.frameMs, cats: s.cats, catNames: s.catNames, threads: s.threads.slice(0, 12), rows, trees: null } };
    let list = readHist().filter((h) => h.name !== slot.name);
    list.unshift(item);
    list = list.slice(0, 8);
    while (list.length && !store.set(HKEY, JSON.stringify(list))) list.pop(); // drop oldest until it fits
    renderHistory();
  }
  function renderHistory() {
    const list = readHist();
    $('history').innerHTML = list.length ? list.map((h) => {
      const st = stats(h.sum), d = new Date(h.savedAt);
      return `<li><span class="muted num">${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span><span class="name">${esc(h.name)}</span><span class="muted">${esc((h.sum.meta || {}).Build || '?')} · trung bình ${f2(st.avg)} ms · chậm nhất ${f2(st.max)} ms</span><span><button type="button" data-hist="${h.id}" data-to="A">Nạp vào A</button> <button type="button" data-hist="${h.id}" data-to="B">Nạp vào B</button> <button type="button" data-hist="${h.id}" data-to="del">Xóa</button></span></li>`;
    }).join('') : '<li class="muted">Chưa có. Mỗi file bạn mở sẽ được ghi lại ở đây, chỉ trong trình duyệt này.</li>';
  }

  function renderMan() {
    const order = ['Perform', 'Scene', 'updateRenderQueue', 'sortObjects', 'RenderView', 'Present', 'SceneUpdater::computeLightingPerform', 'buildFrustums', 'drawFrustums', 'renderShadowQueue', 'ShadowObjectSpot', 'ShadowObjectPoint', 'ShadowObjectDirectional', 'Fill tiled casters', 'queryFrustum', 'VisibleQuery', 'uploadBufferData', 'Prepare2dWindow', 'TextRender::render', 'TextureManager2::processPendingRequests', 'updatePlaneEffect', 'StandardAdorns', 'FrameCheck', 'ProfilerAdorn', 'Sleep'];
    $('man').innerHTML = order.map((k) => { const g = MPGlossary.SCOPES[k]; return `<dt>${esc(k)}</dt><dd>${g.certain ? '' : '<em>Phỏng đoán · </em>'}${esc(g.text)}</dd>`; }).join('') +
      `<dt>Nhóm việc trên Main</dt><dd>${CAT_LABEL.map((l, i) => `${l}: ${CAT_HELP[i]}`).join(' · ')} · Rảnh: Main không chạy scope nào (đang chờ, hoặc việc engine không ghi lại).</dd>`;
  }

  function renderAll() {
    if (!viewSlot()) return;
    renderStatus(); renderFindings(); renderStats(); renderBudget(); renderChart(); renderThreads(); threadOptions(); renderScopes(); renderTree();
  }

  // ---------- actions ----------
  function say(text, err) { const m = $('msg'); m.textContent = text; m.className = 'status' + (err ? ' err' : ''); }

  function setSlot(k, slot) {
    S[k] = slot;
    S.view = k; S.frame = null; S.showAll = false;
    $('empty').hidden = true;
    $('data').hidden = false; // show panels before rendering so the chart can measure its width
    renderAll();
  }
  function loadFile(file, k) {
    say(`Đang đọc ${file.name}…`);
    const reader = new FileReader();
    reader.onerror = () => say('Không đọc được file này. Thử mở lại.', true);
    reader.onload = () => setTimeout(() => {
      try {
        const t0 = performance.now();
        const dump = MPCore.parseDump(reader.result);
        const slot = { name: file.name, sample: false, dump, sum: MPCore.summarize(dump), fsum: null };
        if (k === 'B' && !S.A) k = 'A';
        setSlot(k, slot);
        remember(slot);
        say(`Đã mở ${file.name} vào ${k} (${((performance.now() - t0) / 1000).toFixed(1)} giây).`);
      } catch (e) { say(e && e.message ? e.message : 'File này không phải dump MicroProfiler hợp lệ.', true); }
    }, 20);
    reader.readAsText(file);
  }
  function selectFrame(i) {
    const sl = viewSlot();
    if (!sl || !sl.dump) return;
    if (i === null) { S.frame = null; sl.fsum = null; }
    else {
      S.frame = Math.max(0, Math.min(sl.sum.frameMs.length - 1, i));
      sl.fsum = MPCore.summarize(sl.dump, { from: S.frame, to: S.frame });
    }
    S.showAll = false;
    renderFindings(); renderBudget(); renderChart(); renderThreads(); threadOptions(); renderScopes(); renderTree();
  }
  function summaryText() {
    const sl = viewSlot(), sum = cur(), st = stats(sum), m = sum.meta || {}, t = targets();
    const lines = [`MicroProfiler Reader · ${sl.name} (${m.Build || '?'} ${m.Version || ''}, ${m.GpuName || ''}, ${m.DisplaySize || ''})${S.frame !== null ? ` · frame ${S.frame + 1}` : ''}`];
    lines.push(`${st.n} frame | trung bình ${f2(st.avg)} ms | p95 ${f2(st.p95)} | chậm nhất ${f2(st.max)} | ~${Math.round(st.fps)} FPS | mục tiêu < ${t.avg} / ≤ ${t.max} ms`);
    lines.push('RBX Main: ' + st.catAvg.map((v, i) => (v > 0.01 ? `${CAT_LABEL[i]} ${f2(v)}` : '')).filter(Boolean).join(' · ') + ` · Rảnh ${f2(st.idle)} ms`);
    const top = sum.rows.filter((r) => r.tid === sum.mainTid).sort((a, b) => b.self - a.self).slice(0, 8);
    lines.push('Top self (RBX Main): ' + top.map((r) => `${r.name} ${f2(r.self)}`).join(' · '));
    const o = otherSlot();
    if (o && S.frame === null) { const os = stats(o.sum); lines.push(`So với ${o.name}: trung bình ${f2(os.avg)} → ${f2(st.avg)} ms, chậm nhất ${f2(os.max)} → ${f2(st.max)} ms`); }
    const lv = { ok: 'Ổn', info: 'Thông tin', warn: 'Lưu ý', err: 'Vượt mục tiêu' };
    for (const [lvl, txt] of findings(sum, sl.sum.meta)) lines.push(`[${lv[lvl]}] ${txt}`);
    return lines.join('\n');
  }
  function copySummary() {
    if (!viewSlot()) return;
    const text = summaryText(), box = $('copybox');
    const fallback = () => { box.hidden = false; box.value = text; box.focus(); box.select(); say('Trình duyệt không cho chép tự động: đoạn tóm tắt đã được bôi đen bên dưới, bấm Ctrl+C.'); };
    try { navigator.clipboard.writeText(text).then(() => { box.hidden = true; say('Đã chép tóm tắt vào clipboard.'); }, fallback); }
    catch (e) { fallback(); }
  }

  // ---------- events ----------
  $('kOpen').addEventListener('click', () => $('fileA').click());
  $('kOpenEmpty').addEventListener('click', () => $('fileA').click());
  $('kCompare').addEventListener('click', () => $('fileB').click());
  $('kCopy').addEventListener('click', copySummary);
  $('fileA').addEventListener('change', (e) => { if (e.target.files[0]) loadFile(e.target.files[0], 'A'); e.target.value = ''; });
  $('fileB').addEventListener('change', (e) => { if (e.target.files[0]) loadFile(e.target.files[0], 'B'); e.target.value = ''; });
  ['tAvg', 'tMax'].forEach((id) => $(id).addEventListener('input', () => { store.set('mpr.' + id, $(id).value); renderAll(); renderHistory(); }));
  $('status').addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]'); if (v) { S.view = v.dataset.view; S.frame = null; renderAll(); return; }
    if (e.target.closest('[data-open]')) $('fileB').click();
  });
  $('chart').addEventListener('click', (e) => { const r = e.target.closest('[data-i]'); if (r) selectFrame(Number(r.dataset.i)); });
  $('framebar').addEventListener('click', (e) => { const b = e.target.closest('[data-step]'); if (!b) return; const d = Number(b.dataset.step); selectFrame(d === 0 ? null : S.frame + d); });
  $('thread').addEventListener('change', (e) => { S.threadName = e.target.value; S.showAll = false; renderScopes(); renderTree(); });
  $('search').addEventListener('input', renderScopes);
  $('scopes').addEventListener('click', (e) => { const b = e.target.closest('[data-sort]'); if (b) { S.sort = b.dataset.sort; renderScopes(); } });
  $('more').addEventListener('click', (e) => { if (e.target.id === 'toggleAll') { S.showAll = !S.showAll; renderScopes(); } });
  $('history').addEventListener('click', (e) => {
    const b = e.target.closest('[data-hist]'); if (!b) return;
    const list = readHist(), h = list.find((x) => String(x.id) === b.dataset.hist); if (!h) return;
    if (b.dataset.to === 'del') { store.set(HKEY, JSON.stringify(list.filter((x) => x !== h))); renderHistory(); return; }
    setSlot(b.dataset.to, { name: h.name, sample: false, dump: null, sum: h.sum, fsum: null });
    say(`Đã nạp ${h.name} từ lịch sử vào ${b.dataset.to}.`);
  });
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
    if (e.key === 'Escape') { if (typing) e.target.blur(); if (S.frame !== null) selectFrame(null); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'o') $('fileA').click();
    else if (e.key === 'b') $('fileB').click();
    else if (e.key === 'c') copySummary();
    else if (e.key === '/') { e.preventDefault(); $('search').focus(); }
    else if (e.key === 'ArrowRight' && viewSlot()) selectFrame(S.frame === null ? 0 : S.frame + 1);
    else if (e.key === 'ArrowLeft' && viewSlot() && S.frame !== null) selectFrame(S.frame - 1);
  });
  document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dragging'); });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
  document.addEventListener('drop', (e) => {
    e.preventDefault(); document.body.classList.remove('dragging');
    const files = [...e.dataTransfer.files];
    if (files.length >= 2) { loadFile(files[0], 'A'); setTimeout(() => loadFile(files[1], 'B'), 50); return; }
    if (files[0]) loadFile(files[0], !S.A || S.A.sample ? 'A' : 'B');
  });
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => viewSlot() && renderChart(), 150); });

  // ---------- start: empty screen until the user opens a dump ----------
  renderMan(); renderHistory();
})();
