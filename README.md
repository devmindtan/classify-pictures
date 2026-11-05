# Localens

Ứng dụng web local để phân tích, đổi tên và gom ảnh/video vào album. Toàn bộ tệp được xử lý trong trình duyệt; không có backend và không tải media của người dùng lên cloud.

## Chạy local

```bash
npm install
npm run dev
```

Mở `http://127.0.0.1:4173`.

## Luồng sử dụng

1. Chọn nhiều ảnh/video, một thư mục, hoặc tệp ZIP.
2. Nhấn **Phân tích bằng AI**. Lần đầu cần mạng để tải mô hình CLIP miễn phí; mô hình được lưu trong browser cache cho các lần sau.
3. Kiểm tra tên file và album, chỉnh sửa nếu cần.
4. Tải ZIP đã sắp xếp. Mỗi album là một thư mục và có thêm `phan-loai.json`.

## Quyền riêng tư và giới hạn

- Media không rời khỏi thiết bị.
- ZIP tối đa 750 MB, 5.000 mục; mỗi mục sau giải nén tối đa 250 MB.
- Khả năng đọc HEIC/MOV/MKV phụ thuộc codec mà trình duyệt đang dùng hỗ trợ.
- Model cache thuộc trình duyệt; xóa dữ liệu trang có thể khiến model phải tải lại.

## Tài nguyên tham chiếu đã tải

- `references/repos/transformers.js`
- `references/repos/jszip`
- `references/repos/ffmpeg.wasm`
- `.agents/skills/playwright`
- `.agents/skills/screenshot`
- `.agents/skills/security-best-practices`
