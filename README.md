# MicroProfiler Reader

Đọc file dump MicroProfiler của Roblox ngay trong trình duyệt, kèm giải thích tiếng Việt cho từng scope.

**Dùng ngay:** https://phuongthanh2002.github.io/mp-reader/

Không cần cài đặt gì. File dump được đọc trên máy bạn, không tải lên bất kỳ đâu.

## Làm được gì

- **Phát hiện tự động:** chỉ ra vấn đề hay gặp, ví dụ quá nhiều đèn có `Shadows = true` (`ShadowObjectSpot` chạy hàng chục lần mỗi frame), shadow map bị vẽ lại vì nhân vật/NPC animate (`drawFrustums`), quá nhiều vật trong tầm nhìn (`updateRenderQueue`), GUI nặng, chi phí riêng của Studio hoặc của chính MicroProfiler.
- **Tổng quan frame:** trung bình, p50, p95, chậm nhất, FPS ước tính, tô màu theo mục tiêu bạn đặt (mặc định trung bình < 10 ms, trần ≤ 12 ms).
- **So sánh trước/sau:** mở 2 dump, mọi con số hiện mức thay đổi.
- **Ngân sách frame của RBX Main:** một frame chia theo nhóm việc (Render, Bóng đổ, GUI, Script, Vật lý, Present, Studio/Profiler) so với mục tiêu.
- **Biểu đồ từng frame** dạng cột chồng màu; bấm vào một cột để xem riêng frame đó.
- **Bảng luồng, bảng scope** (self, gồm con, số lần mỗi frame) và **cây lời gọi** của từng luồng.
- **Lịch sử:** nhớ 8 dump gần nhất trong trình duyệt để so sánh nhanh.
- **Chép tóm tắt:** một đoạn chữ ngắn với các số chính, để dán vào ghi chú hoặc gửi người khác.

Phím tắt: `O` mở dump · `B` mở dump để so sánh · `C` chép tóm tắt · `/` tìm scope · `←` `→` chuyển frame · `Esc` bỏ chọn frame.

## Lấy file dump

1. Trong Roblox (Client hoặc Studio) bấm **Ctrl+F6** để mở MicroProfiler.
2. Đứng ở chỗ muốn đo vài giây, bấm **Dump** trên thanh menu của MicroProfiler.
3. File nằm ở `%LOCALAPPDATA%\Roblox\logs\microprofile-*.x.html`. Kéo nó vào trang.

Nên đo trên **Roblox Client** thay vì Studio: Studio tự cộng thêm khoảng 2 ms mỗi frame (handle chọn đối tượng, giao diện editor), nên số đo trong Studio luôn chậm hơn khi chơi thật.

## Cấu trúc

| File | Nội dung |
|---|---|
| `index.html` | Giao diện |
| `app.js` | Hiển thị, so sánh, lịch sử, phát hiện tự động |
| `mp-core.js` | Bộ giải mã dump (định dạng LibMP: header hex, payload LZ4 + Base64, bảng FlatBuffers) và phép tính thời gian |
| `glossary.js` | Giải thích tiếng Việt cho các scope |

Không dùng thư viện ngoài hay bước build nào. Mở `index.html` qua một web server bất kỳ là chạy (ví dụ `python -m http.server`).

## Giới hạn

- Chỉ đọc file `.x.html` (nút Dump thông thường). Chưa đọc file `.gprx` (dump dạng binary).
- Thời gian GPU chỉ để tham khảo: timestamp GPU trong dump không ổn định giữa các lần đo.
- Scope kéo dài qua ranh giới hai frame chỉ được tính ở frame nó kết thúc.
- Một số giải thích được ghi "Phỏng đoán": đó là rút ra khi đo thực tế, tài liệu Roblox chưa mô tả.

Đây là công cụ cộng đồng, không phải sản phẩm chính thức của Roblox. Định dạng dump được tìm hiểu từ mã nguồn [Roblox/libmp](https://github.com/Roblox/libmp).

## Giấy phép

[MIT](LICENSE)
