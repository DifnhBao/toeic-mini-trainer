# Kiểm tra lỗi phân tích PDF (29/09/2026)

Cập nhật 08/10/2026: PDF nguồn cho luồng quản trị web tối đa **50 MiB**, dùng chung policy cho kiểm tra trên client, cấp upload intent và worker đọc R2. Giới hạn bốn trang/lượt, 30.000 ký tự và 5 MiB OCR sau tách trang giữ nguyên. Mobile mới dùng Kho bài, quản trị viên chuẩn bị file trên web; hướng dẫn hiện hành tại `ADMIN_LISTENING_WORKFLOW_2026-10-08.md`.

## Chẩn đoán

- Luồng upload R2 và luồng phân tích AI là hai bước khác nhau. Truy vấn chỉ đọc các job gần đây cho thấy lỗi `DOCUMENT_PARSE_FAILED` và `DOCUMENT_TEXT_EMPTY`; không có bằng chứng từ truy vấn này rằng PUT lên R2 bị lỗi.
- PDF scan 4 trang mẫu không có text layer; `pdf-parse` trả 0 ký tự. Trước đây job luôn thất bại với `DOCUMENT_TEXT_EMPTY`.
- PDF 72 trang mẫu có khoảng 130.000 ký tự. Trước đây luồng AI âm thầm lấy 30.000 ký tự đầu, bỏ toàn bộ phần còn lại.

## Cách xử lý mới

- Mỗi job chỉ xử lý tối đa 4 trang liên tiếp. Web đọc số trang trước khi upload, cho chọn khoảng hợp lệ và dùng lại asset đã upload nếu tiếp tục chọn trang khác. Mobile cho nhập trang bắt đầu; API tự lấy tối đa 4 trang từ đó.
- Server tách đúng các trang đã chọn trước khi đọc chữ. Nếu phần này vẫn quá 30.000 ký tự, job dừng với lỗi rõ ràng và không gọi AI; người dùng chọn ít trang hơn.
- Server kiểm tra lượng chữ từng trang, để bìa có text không che khuất các trang câu hỏi scan. Nếu có trang dưới 20 ký tự, gửi PDF cho Gemini đọc ảnh. Khi cụm trang vượt 5 MiB, chỉ đưa các trang thiếu text vào PDF OCR và giữ text còn lại trong prompt, kèm số trang gốc. Nếu PDF OCR vẫn vượt 5 MiB, yêu cầu chọn ít trang hơn. Nội dung AI trả về vẫn phải qua schema và người dùng tự kiểm tra đáp án trước khi lưu.
- Các mã lỗi OCR, khoảng trang, phản hồi AI và lỗi provider được phân biệt. Web có nút tiếp tục kiểm tra job hiện tại sau khi mất kết nối, tránh tự tạo lượt AI mới.

## Triển khai an toàn

1. Sao lưu/đánh dấu branch Neon trước thay đổi schema. Migration mới `20260929170000_add_ingestion_page_range` chỉ thêm `pageStart` và `pageEnd` vào `ingestion_jobs`; không sửa migration cũ.
2. Chạy `npx prisma migrate deploy` từ môi trường tin cậy với database hiện tại, xác nhận `npx prisma migrate status` đã cập nhật. Không chạy seed.
3. Sau đó mới deploy code server/web. Nếu bật app mobile phiên bản cũ, API vẫn mặc định đọc 4 trang đầu; cần build APK mới để chọn trang bắt đầu.
4. Thử PDF text 4 trang và PDF scan 4 trang bằng tài khoản thử nghiệm. Xác nhận trạng thái job, số câu, đáp án; thử PDF dài ở trang 1-4 và 5-8. Không tự xuất bản vào kho chung.
5. Theo dõi lỗi job và lượt Gemini. OCR và mỗi khoảng trang bổ sung có thể tạo thêm chi phí; không chạy tự động qua toàn bộ PDF dài.

Chưa kiểm thử gọi Gemini thật trong quá trình phát triển bản sửa này. Không thể bảo đảm OCR nhận đúng mọi câu/đáp án; người dùng phải duyệt kết quả trước khi lưu hay chia sẻ.

## Tái hiện với file ETS được cung cấp ngày 08/10/2026

- PDF nguồn 20.045.334 byte, 14 trang; MP3 44.275.491 byte. Cả hai dưới policy hiện tại (PDF 50 MiB, audio 100 MiB).
- Trang 1 chỉ có 47 ký tự text; trang 2–14 không có text layer. Trang 3 là hướng dẫn Part 1, trang 4 có câu 1–2; trang 8 bắt đầu Part 3; trang 14 kết thúc câu 100.
- Lỗi cũ: xét tổng số ký tự, coi cụm 1–4 là PDF text và gửi đúng 47 ký tự của bìa cho AI; AI trả `DOCUMENT_NO_QUESTIONS` dù có câu hỏi trong ảnh.
- Bản sửa giữ text trang 1, đưa trang 2–4 vào PDF OCR 4.350.144 byte thay vì cụm 1–4 nặng 10.995.190 byte. Các cụm 5–8, 9–12, 13–14 cũng dưới ngưỡng OCR. Đã chạy đường chuẩn bị dữ liệu thật trên cả bốn cụm, không gửi file gốc vào Git hay gói deploy.
- AI draft cho phép đáp án rỗng khi PDF nghe không có answer key; UI yêu cầu bổ sung trước khi duyệt. Schema lưu câu hỏi và xuất bản vẫn bắt buộc đáp án hợp lệ. APK cũ gọi import không kèm review nhận `REVIEW_REQUIRED` trước khi claim nếu draft còn thiếu key; các job cũ hợp lệ giữ tương thích.
- Phương án AI Part 2 phải đúng A/B/C; các Part khác A/B/C/D. Không bịa lời thoại hoặc đoán đáp án từ audio (luồng này chỉ đính kèm audio).
- Kiểm tra local: 133 unit PASS, kiểm tra lại 16 test route PASS, TypeScript PASS, lint 0 lỗi/3 cảnh báo ảnh có sẵn; production build Next.js 16.3.8 tạo 41 trang thành công. Deployment được ghi riêng sau khi build cloud và smoke đạt.
- Chưa gọi Gemini thật hoặc nghiệm thu tài khoản ADMIN trong lần kiểm tra local này. Chưa tự cắt ảnh Part 1/đồ thị trong PDF, chưa chia MP3 theo câu. Do đó không coi OCR thành công là toàn bộ test nghe đã sẵn sàng xuất bản cho người học.
