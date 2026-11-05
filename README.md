# Localens

Ứng dụng web local để phân tích, đổi tên và gom ảnh/video vào album. Media không được tải lên cloud. App ưu tiên Qwen3-VL trên máy GPU riêng qua SSH/Tailscale và tự chuyển sang CLIP trong trình duyệt khi GPU không sẵn sàng.

## Chạy local

```bash
npm install
npm run dev
```

Mở `http://127.0.0.1:4173`. `npm run dev` đồng thời mở tunnel loopback tới máy GPU; khi dừng dev server, service GPU và tunnel cũng được đóng để trả VRAM.

## GPU local

```bash
npm run gpu:deploy  # chép service lên desktop-kndgm60, chỉ cần khi source GPU thay đổi
npm run gpu:start   # mở Qwen3-VL + tunnel 127.0.0.1:3911
npm run gpu:status
npm run gpu:stop
```

- Máy GPU: `desktop-kndgm60`, GTX 1660 SUPER 6 GB.
- Model: `qwen3-vl:2b-instruct` qua Ollama (Apache-2.0, lượng tử hóa khoảng 1,9 GB).
- Service chỉ bind `127.0.0.1:3910` trong WSL và chỉ được đưa về `127.0.0.1:3911` bằng SSH.
- Không mở cổng Tailscale/LAN, không có dịch vụ cloud và không có API trả phí.
- Nếu VoiceStudio hoặc Ollama đang giữ GPU 6 GB, Localens không giành VRAM và dùng model trình duyệt.

## Luồng sử dụng

1. Chọn nhiều ảnh/video, một thư mục, hoặc tệp ZIP.
2. Nhấn **Phân tích bằng GPU**. Qwen3-VL chọn trong taxonomy phân cấp 17 nhóm lớn/136 nhóm con, đồng thời tạo tên file, caption, tag, danh sách vật thể và OCR. Validator kiểm tra quan hệ cha-con, loại nội dung, ngưỡng tin cậy và bằng chứng; kết quả mơ hồ được đánh dấu **Cần kiểm tra**. Nếu GPU tắt/bận, app tự dùng CLIP miễn phí trong browser cache.
3. Kiểm tra tên file và album, chỉnh sửa nếu cần.
4. Tải ZIP đã sắp xếp. Mỗi album là một thư mục và có thêm `phan-loai.json`.

## Quyền riêng tư và giới hạn

- Media chỉ đi từ laptop tới máy GPU riêng qua tunnel Tailscale/SSH; không đi tới cloud. Khi fallback, media chỉ ở trong trình duyệt.
- ZIP tối đa 750 MB, 5.000 mục; mỗi mục sau giải nén tối đa 250 MB.
- Khả năng đọc HEIC/MOV/MKV phụ thuộc codec mà trình duyệt đang dùng hỗ trợ.
- Model cache thuộc trình duyệt; xóa dữ liệu trang có thể khiến model phải tải lại.

## Tài nguyên tham chiếu đã tải

- `references/repos/transformers.js`
- `references/repos/jszip`
- `references/repos/ffmpeg.wasm`
- `references/repos/qwen3-vl`
- `references/repos/moondream`
- `references/repos/immich`
- `references/repos/places365`
- `references/repos/recognize-anything`
- `references/repos/lvis-api`
- `.agents/skills/playwright`
- `.agents/skills/screenshot`
- `.agents/skills/security-best-practices`

Quy tắc chi tiết nằm tại [`docs/classification-rules.md`](docs/classification-rules.md); taxonomy runtime nằm tại [`gpu/taxonomy.json`](gpu/taxonomy.json).
