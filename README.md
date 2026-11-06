# Localens

Ứng dụng web local để phân tích, đổi tên và gom ảnh/video vào album. Media không được tải lên cloud. Qwen3-VL đề xuất tag tiếng Anh và SigLIP chấm điểm trực tiếp từng tag trên máy GPU riêng; app tự chuyển sang CLIP trong trình duyệt khi GPU không sẵn sàng.

## Chạy local

```bash
npm install
npm run dev
```

Mở `http://127.0.0.1:4173`. `npm run dev` đồng thời mở tunnel loopback tới máy GPU; khi dừng dev server, service GPU và tunnel cũng được đóng để trả VRAM.

## GPU local

```bash
npm run gpu:deploy  # chép service lên desktop-kndgm60, chỉ cần khi source GPU thay đổi
npm run gpu:start   # mở Qwen3-VL + SigLIP và tunnel 127.0.0.1:3911
npm run gpu:status
npm run gpu:stop
```

- Máy GPU: `desktop-kndgm60`, GTX 1660 SUPER 6 GB.
- Model đề xuất tag/metadata: `qwen3-vl:2b-instruct` qua Ollama.
- Model chấm điểm tag: `google/siglip-base-patch16-224` qua Transformers/CUDA.
- Service chỉ bind `127.0.0.1:3910` trong WSL và chỉ được đưa về `127.0.0.1:3911` bằng SSH.
- Không mở cổng Tailscale/LAN, không có dịch vụ cloud và không có API trả phí.
- Nếu VoiceStudio hoặc Ollama đang giữ GPU 6 GB, Localens không giành VRAM và dùng model trình duyệt.

## Luồng sử dụng

1. Chọn nhiều ảnh/video, một thư mục, hoặc tệp ZIP.
2. Nhấn **Phân tích bằng GPU**. Qwen3-VL đề xuất 6-10 tag tiếng Anh; SigLIP chấm điểm và tag cao nhất trở thành album. Ảnh trùng/gần trùng tái sử dụng kết quả bằng perceptual hash; các ảnh còn lại luôn được chấm thêm với những album đã thắng trước đó để giữ tên nhất quán. Web hiển thị bảng xếp hạng để kiểm tra. Nếu GPU tắt/bận, app dùng CLIP miễn phí trong browser cache với tên album tiếng Anh.
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

Quy tắc chấm điểm chi tiết nằm tại [`docs/classification-rules.md`](docs/classification-rules.md).
