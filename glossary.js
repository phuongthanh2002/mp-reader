// glossary.js — plain-Vietnamese explanations for MicroProfiler scope (timer) names.
// "certain: false" marks explanations inferred from profiling this game, not from Roblox docs.
(function (root) {
  'use strict';
  const S = (text, certain = true) => ({ text, certain });
  const SCOPES = {
    // --- one frame of rendering on RBX Main ---
    'Perform': S('Toàn bộ công việc render một frame trên luồng Main (gồm cả các mục con bên dưới).'),
    'Scene': S('Dựng cảnh 3D: chuẩn bị ánh sáng, bóng và danh sách vật cần vẽ.'),
    'UpdateView': S('Cập nhật góc nhìn của camera và mọi thứ phụ thuộc vào nó.'),
    'updateRenderQueue': S('Xây danh sách các vật cần vẽ trong frame này. Tăng theo số part/mesh nằm trong tầm nhìn; gộp part hoặc giảm vật trong tầm nhìn sẽ giảm mục này.'),
    'sortObjects': S('Sắp xếp các vật cần vẽ (theo vật liệu, khoảng cách) để GPU vẽ hiệu quả hơn.'),
    'updatePlaneEffect': S('Hiệu ứng dạng mặt phẳng; tài liệu Roblox chưa mô tả. Thay đổi theo khu vực trong map, không phải do vật liệu Glass.', false),
    'updateEffectBoundings': S('Cập nhật vùng bao của các hiệu ứng (particle, beam...).', false),
    'RenderView': S('Bước vẽ thật: gửi các lệnh vẽ cho GPU.'),
    'DefaultPass': S('Lượt vẽ chính của cảnh 3D.'),
    'DepthPrePass': S('Vẽ trước độ sâu để các lượt sau bỏ qua phần bị che.'),
    'Id_Opaque': S('Vẽ các vật không trong suốt.'),
    'Id_Transparent': S('Vẽ các vật trong suốt (Transparency > 0, kính...). Đắt hơn vật đặc.'),
    'Id_OpaqueCasters': S('Vẽ các vật đặc vào shadow map.'),
    'uploadBufferData': S('Gửi dữ liệu hình học/hằng số lên bộ nhớ GPU.'),
    'Present': S('Đưa frame đã vẽ lên màn hình. Thường bao gồm thời gian chờ driver/GPU; khó giảm trực tiếp.'),
    'PrepareBound': S('Chuẩn bị các phần vẽ kèm theo cảnh (adornment, beam, cập nhật part động).', false),
    'Prepare': S('Chuẩn bị dữ liệu trước khi vẽ cảnh.'),
    'PreRender': S('Các việc chạy ngay trước khi render (camera, cập nhật trạng thái).'),
    'SceneUpdater::UpdatePrepare': S('Cập nhật vị trí/trạng thái các vật trong cảnh trước khi vẽ.'),
    'SceneUpdater::updateDynamicParts': S('Cập nhật các part đang di chuyển.'),
    'updateTerrainPerform': S('Cập nhật Terrain (địa hình) cho frame này.'),
    'updateLod': S('Chọn mức chi tiết (LOD) cho Terrain/mesh theo khoảng cách.'),
    'updateUsedChunkMaterials': S('Cập nhật vật liệu của các khối Terrain đang dùng.'),
    'Beams': S('Cập nhật và vẽ các Beam (dây, tia sáng...).'),
    'TextureManager2::processPendingRequests': S('Xử lý texture đang chờ tải/giải nén. Cao lúc mới vào map hoặc khi có texture mới.'),
    'StandardAdorns': S('Vẽ khung chọn, handle kéo thả của Studio. Chỉ có trong Studio, người chơi thật không tốn.'),
    'Pass3dAdorn': S('Vẽ các adornment 3D (SelectionBox, Handles...).'),
    'RenderWorkspaceAdorns': S('Vẽ adornment trong workspace.'),
    'queryFrustum': S('Tìm các vật nằm trong một vùng nhìn (của camera hoặc của một đèn có bóng). Mỗi đèn có bóng gọi một lần.'),
    'queryFrustumOrdered': S('Như queryFrustum nhưng trả kết quả theo thứ tự khoảng cách.'),
    'VisibleQuery': S('Kiểm tra vật nào thật sự nhìn thấy được (để bỏ qua vật bị che).'),
    'queryOcclusion': S('Kiểm tra vật có bị vật khác che khuất không.'),
    'CullJob': S('Việc loại bỏ vật không nhìn thấy, chạy song song trên luồng Worker.'),

    // --- shadows & lighting ---
    'SceneUpdater::computeLightingPerform': S('Cập nhật ánh sáng cho frame này, gồm toàn bộ hệ thống bóng.'),
    'SceneUpdater::computeLightingPrepare': S('Chuẩn bị dữ liệu ánh sáng.'),
    'ShadowMapSystem::updatePerform': S('Toàn bộ hệ thống bóng đổ trong frame.'),
    'buildFrustums': S('Tính vùng bóng cho từng nguồn sáng có bóng (mặt trời + đèn Shadows = true).'),
    'drawFrustums': S('Vẽ lại các shadow map. Chỉ xảy ra khi trong vùng bóng có vật đang chuyển động (nhân vật, NPC đang animate). Đứng yên trong Edit mode thì gần 0; khi chơi thì luôn có vì nhân vật của người chơi chuyển động.'),
    'depthPass': S('Vẽ độ sâu vào shadow map (một phần của drawFrustums).'),
    'renderShadowQueue': S('Vẽ danh sách vật vào một shadow map. Số lần/frame = số shadow map phải vẽ lại.'),
    'updateFrustumRenderQueue': S('Xây danh sách vật cho mỗi shadow map cần vẽ lại.'),
    'ShadowObjectSpot': S('Xử lý bóng của một SpotLight/SurfaceLight có Shadows = true. Số lần/frame ≈ số đèn đó đang được xử lý; nhiều đèn có bóng là rất tốn.'),
    'ShadowObjectPoint': S('Xử lý bóng của một PointLight có Shadows = true (PointLight bóng tốn hơn Spot vì chiếu mọi hướng).'),
    'ShadowObjectDirectional': S('Bóng của mặt trời/mặt trăng (Lighting.GlobalShadows). Chi phí gần như cố định, ít phụ thuộc số part.'),
    'Fill tiled casters': S('Gom các part đổ bóng vào từng ô shadow map của mặt trời.'),
    'Get shadow casters': S('Tìm các part có thể đổ bóng.'),
    'getPotentialShadowCasters': S('Tìm các part có thể đổ bóng.'),
    'Perform culling': S('Loại bỏ part đổ bóng nằm ngoài vùng cần tính.'),
    'Precise culling': S('Loại bỏ part đổ bóng (bước kiểm tra chính xác).'),
    'Priority sort throttling': S('Engine xếp ưu tiên và giới hạn số bóng được cập nhật mỗi frame.'),
    'Filter cascade casters': S('Lọc part đổ bóng cho từng tầng bóng mặt trời.'),
    'Sort cascade casters': S('Sắp xếp part đổ bóng cho từng tầng bóng mặt trời.'),
    'allocateAndBuildViewports': S('Cấp chỗ trong atlas shadow map cho các bóng cần vẽ.'),
    'LightGridCPU::updatePerform': S('Cập nhật lưới ánh sáng (đèn ảnh hưởng ô nào trong không gian).'),

    // --- GUI ---
    'Prepare2dWindow': S('Chuẩn bị toàn bộ GUI 2D (ScreenGui, BillboardGui, SurfaceGui) để vẽ.'),
    'fillGuiVertices': S('Tạo hình học cho các phần tử GUI.'),
    'TextRender::render': S('Vẽ chữ của TextLabel/TextButton. Số lần/frame ≈ số khối chữ đang hiển thị.'),
    'Process GuiEffect': S('Xử lý hiệu ứng GUI (UIGradient, UIStroke...).'),
    'updateGenericTweens': S('Chạy các Tween đang hoạt động.'),
    'UITextureRenderer::compositeUITextures': S('Ghép texture của GUI.'),

    // --- MicroProfiler itself ---
    'FrameCheck': S('MicroProfiler tự kiểm tra mỗi frame. Chỉ tốn khi đang mở MicroProfiler (Ctrl+F6).'),
    'ProfilerAdorn': S('Vẽ giao diện MicroProfiler trên màn hình. Chỉ tốn khi đang mở MicroProfiler.'),
    'Detailed View': S('Chế độ xem chi tiết của MicroProfiler. Chỉ tốn khi đang mở.'),
    'Draw': S('Vẽ giao diện MicroProfiler.'),
    'Profiler': S('Phần vẽ của MicroProfiler.'),
    'ThreadLoop': S('Luồng nền của MicroProfiler thu thập dữ liệu.'),
    'Accumulate': S('MicroProfiler cộng dồn số liệu.'),

    // --- runtime / scheduler ---
    'Sleep': S('Luồng đang ngủ, không có việc. Không phải chi phí thật.'),
    'Thread (FG)': S('Một tác vụ đang chạy trên luồng Worker (ưu tiên cao).'),
    'Thread (BG)': S('Một tác vụ nền đang chạy trên luồng Worker.'),
    'Sched': S('Bộ lập lịch chọn tác vụ tiếp theo.'),
    'TS::Step': S('Task Scheduler chạy một bước công việc.'),
    'TS::Reschedule': S('Task Scheduler xếp lịch lại công việc.'),
    'TS::ArbiterStep': S('Task Scheduler phân xử thứ tự chạy.'),
    '$Event': S('Xử lý sự kiện của giao diện Studio (Qt). Chỉ có trong Studio.'),
    '$Script': S('Script Luau (tên script không có trong dump).'),
    'LightLOD': S('Script LightLOD của game (bật/tắt đèn và bóng theo khoảng cách).'),
    'AnimationLOD': S('Script AnimationLOD của game (dừng animation NPC ở xa).'),
    'Heartbeat': S('Các hàm nối vào RunService.Heartbeat chạy mỗi frame.'),
  };
  const GROUPS = {
    Render: 'Render (vẽ hình)', Shadows: 'Bóng đổ', ShadowMap: 'Bóng đổ', UI: 'Giao diện', Script: 'Script Luau',
    Physics: 'Vật lý', Network: 'Mạng', Sound: 'Âm thanh', MicroProfiler: 'MicroProfiler (chỉ khi đang mở)',
    Runtime: 'Hệ thống chạy', Jobs: 'Task Scheduler', Qt: 'Giao diện Studio', QtUIThread: 'Giao diện Studio',
    GPU: 'GPU', Animation: 'Animation', LuaBridge: 'Gọi giữa Luau và engine', Humanoid: 'Humanoid',
  };

  function explain(name, group) {
    const hit = SCOPES[name];
    if (hit) return hit;
    if (name.startsWith('Script_')) return S(`Script "${name.slice(7)}" đang chạy.`);
    if (name.startsWith('$')) return S('Mục tổng hợp của engine (tràn bộ đếm hoặc gọi chung).', false);
    if (group && GROUPS[group]) return S(`Thuộc nhóm ${GROUPS[group]}. Chưa có giải thích riêng cho mục này.`, false);
    return null;
  }
  const api = { explain, SCOPES, GROUPS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MPGlossary = api;
})(typeof window !== 'undefined' ? window : globalThis);
