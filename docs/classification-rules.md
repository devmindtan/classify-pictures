# Quy tắc phân loại Localens

Phương pháp hiện tại: `ranked-english-tags-v1`. Hệ thống không dùng taxonomy cố định.

## 1. Luồng chấm điểm

1. Qwen3-VL quan sát ảnh và đề xuất 6-10 tag ứng viên.
2. Mỗi tag phải là tiếng Anh viết thường, dài 1-3 từ và đủ rõ để dùng làm tên album.
3. SigLIP nhìn lại chính ảnh, chấm điểm độc lập cho từng tag ứng viên.
4. Server chuẩn hóa điểm để tổng bằng 100%, sắp xếp giảm dần và lấy tag có điểm cao nhất làm album/type.
5. Bảng điểm đầy đủ được hiển thị trên web và ghi vào `phan-loai.json`.

## 2. Nhất quán trong cùng một lô

- Trình duyệt tạo dHash 64-bit cho khung hình phân tích. Nếu khoảng cách Hamming không quá 6/64, ảnh được xem là trùng hoặc gần trùng và tái sử dụng nguyên album/bảng điểm trước đó.
- Với ảnh không đủ gần để tái sử dụng, các tag đã thắng trước đó trong lô được thêm vào tập ứng viên. Vì vậy ảnh tương tự được chấm lại với cùng tên album thay vì mỗi ảnh tạo một từ đồng nghĩa mới.
- Server chuẩn hóa các synonym phổ biến, ví dụ `app interface`, `software UI` → `application interface`; `web page` → `website interface`; `phone screenshot` → `mobile screenshot`.
- Tag cũ chỉ là ứng viên, không bị ép thắng: SigLIP vẫn chấm trực tiếp theo ảnh và có thể chọn tag mới cho nội dung khác.

Qwen không được tự chọn album và điểm do Qwen tự khai không được sử dụng. Kết quả cuối đến từ bộ so khớp ảnh-văn bản SigLIP.

## 3. Quy tắc ngôn ngữ

- Album, tag, filename, caption, object, evidence và classification reason đều phải là tiếng Anh.
- `ocrText` giữ nguyên ngôn ngữ nhìn thấy trong ảnh vì đây là bản chép nội dung gốc.
- Tag không được dùng các từ vô nghĩa như `image`, `photo`, `content`, `media`, `miscellaneous`, `other`, `unknown`.
- Tag ưu tiên chủ thể, cảnh, loại tài liệu hoặc loại nội dung số chiếm ưu thế; không lấy vật thể nhỏ tình cờ xuất hiện.

## 4. Cổng kiểm tra

Kết quả được đánh dấu `Needs review` khi:

- JSON metadata ban đầu bị cắt và phải phục hồi;
- tag đứng đầu có điểm chuẩn hóa dưới 20%;
- chênh lệch giữa tag hạng nhất và hạng hai dưới 4%.

Điểm là độ phù hợp tương đối trong tập tag ứng viên của ảnh đó, không phải xác suất tuyệt đối và không dùng để so sánh trực tiếp giữa hai ảnh khác nhau.

## 5. Đầu ra

- `scoredTags`: danh sách `{name, score, rawScore}` đã xếp hạng.
- `album`: tag hạng nhất viết dạng tiêu đề.
- `confidence`: điểm chuẩn hóa của tag hạng nhất.
- `filename`: 3-8 từ tiếng Anh, sau đó app nối ngày, số thứ tự và phần mở rộng gốc.
- `caption`, `objects`, `evidence`: tiếng Anh; `ocrText`: nguyên văn.
- ZIP xuất kèm phương pháp, toàn bộ bảng điểm, lý do và trạng thái review trong `phan-loai.json`.
- ZIP cũng ghi `visualFingerprint` để truy vết những kết quả được tái sử dụng vì ảnh gần trùng.

Chiến lược tag mở tham khảo repo `xinyu1205/recognize-anything`; model chấm điểm runtime là `google/siglip-base-patch16-224`. Cả hai model đều chạy local trên GPU riêng.
