# Kiểm tra lỗi phân tích PDF (29/09/2026)

Cập nhật 08/10/2026: PDF nguồn cho luồng quản trị web tối đa **50 MiB**, dùng chung policy cho kiểm tra trên client, cấp upload intent và worker đọc R2. Giới hạn bốn trang/lượt, 30.000 ký tự và 5 MiB OCR sau tách trang giữ nguyên. Mobile mới dùng Kho bài, quản trị viên chuẩn bị file trên web; hướng dẫn hiện hành tại `ADMIN_LISTENING_WORKFLOW_2026-10-08.md`.

## Chẩn đoán

- Luồng upload R2 và luồng phân tích AI là hai bước khác nhau. Truy vấn chỉ đọc các job gần đây cho thấy lỗi `DOCUMENT_PARSE_FAILED` và `DOCUMENT_TEXT_EMPTY`; không có bằng chứng từ truy vấn này rằng PUT lên R2 bị lỗi.
- PDF scan 4 trang mẫu không có text layer; `pdf-parse` trả 0 ký tự. Trước đây job luôn thất bại với `DOCUMENT_TEXT_EMPTY`.
- PDF 72 trang mẫu có khoảng 130.000 ký tự. Trước đây luồng AI âm thầm lấy 30.000 ký tự đầu, bỏ toàn bộ phần còn lại.

## Cách xử lý mới

- Mỗi job chỉ xử lý tối đa 4 trang liên tiếp. Web đọc số trang trước khi upload, cho chọn khoảng hợp lệ và dùng lại asset đã upload nếu tiếp tục chọn trang khác. Mobile cho nhập trang bắt đầu; API tự lấy tối đa 4 trang từ đó.
- Server tách đúng các trang đã chọn trước khi đọc chữ. Nếu phần này vẫn quá 30.000 ký tự, job dừng với lỗi rõ ràng và không gọi AI; người dùng chọn ít trang hơn.
- Chỉ khi không có chữ trong các trang đã chọn, server gửi bản PDF tách trang cho Gemini để đọc ảnh. Giới hạn phần PDF này ở 5 MB để khống chế chi phí và thời gian. Nội dung AI trả về vẫn phải qua schema và người dùng tự kiểm tra đáp án trước khi lưu.
- Các mã lỗi OCR, khoảng trang, phản hồi AI và lỗi provider được phân biệt. Web có nút tiếp tục kiểm tra job hiện tại sau khi mất kết nối, tránh tự tạo lượt AI mới.

## Triển khai an toàn

1. Sao lưu/đánh dấu branch Neon trước thay đổi schema. Migration mới `20260929170000_add_ingestion_page_range` chỉ thêm `pageStart` và `pageEnd` vào `ingestion_jobs`; không sửa migration cũ.
2. Chạy `npx prisma migrate deploy` từ môi trường tin cậy với database hiện tại, xác nhận `npx prisma migrate status` đã cập nhật. Không chạy seed.
3. Sau đó mới deploy code server/web. Nếu bật app mobile phiên bản cũ, API vẫn mặc định đọc 4 trang đầu; cần build APK mới để chọn trang bắt đầu.
4. Thử PDF text 4 trang và PDF scan 4 trang bằng tài khoản thử nghiệm. Xác nhận trạng thái job, số câu, đáp án; thử PDF dài ở trang 1-4 và 5-8. Không tự xuất bản vào kho chung.
5. Theo dõi lỗi job và lượt Gemini. OCR và mỗi khoảng trang bổ sung có thể tạo thêm chi phí; không chạy tự động qua toàn bộ PDF dài.

Chưa kiểm thử gọi Gemini thật trong quá trình phát triển bản sửa này. Không thể bảo đảm OCR nhận đúng mọi câu/đáp án; người dùng phải duyệt kết quả trước khi lưu hay chia sẻ.
