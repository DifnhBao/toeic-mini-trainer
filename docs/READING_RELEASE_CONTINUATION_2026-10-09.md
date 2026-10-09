# Tiếp tục mục tiêu phát hành: Reading và thứ tự xem lại

Ngày: 09/10/2026. Theo quyết định của chủ dự án, tạm gác nghiệm thu chức năng tự chia audio; tiếp tục vòng học và Reading. Không thay các kết quả người dùng đã ghi trong ba biên bản Android trước.

## Lỗi đã xác nhận và bản sửa

Màn hình kết quả web và API kết quả Android dùng `UserAnswer.id` để sắp câu. Mã đáp án không thể hiện thứ tự câu trong bài, nên “câu 1” lúc xem lại có thể là câu 4 lúc làm. Điểm và liên kết đáp án vẫn đúng nhưng số thứ tự bị đổi.

Kiểm thử PostgreSQL mới nộp bài Part 6, cố ý sắp mã đáp án ngược thứ tự bài rồi gọi API kết quả thật. Source cũ đạt 4/5 tình huống và thất bại đúng tình huống thứ tự. Sau sửa, cả 5/5 đạt.

Web và API hiện dùng chung `orderAttemptAnswers`, dựa trên `MiniTestQuestion.orderIndex`. Các đáp án cũ không còn liên kết câu trong đề được giữ ở cuối, không mất dữ liệu; không sửa mảng đầu vào. Mapping nội bộ không xuất hiện trong response API: `attempt.test` vẫn chỉ có `id` và `title`. Không đổi schema, điểm, quyền truy cập hoặc phiên đăng nhập. Riêng bản sửa này không yêu cầu APK mới.

## Bộ Reading mẫu

- Nguồn tự soạn: `content/qa/original-reading.json`, đáp án/giải thích tại `content/qa/original-reading-key.json`.
- 20 câu: Part 5 có 10 câu; Part 6 có một nhóm 4 câu; Part 7 có hai nhóm 3 câu. Không cần audio hoặc ảnh.
- Công cụ `scripts/create-reading-qa.py` tạo PDF đề 4 trang, PDF đáp án 2 trang, JSON, hướng dẫn và manifest SHA-256; ZIP đã đọc lại kiểm tra CRC, đủ 6 tệp.
- Thư mục đầu ra local: `output/pdf/reading-qa/`; ZIP `original-reading-acceptance.zip`. Đã render và kiểm tra trực quan toàn bộ sáu trang, không thấy cắt chữ/chồng nội dung.
- Nội dung phục vụ nghiệm thu chức năng, không phải đề ETS, không phải bài đánh giá trình độ và chưa đủ mục tiêu nội dung beta 300–500 câu. Chủ dự án được sử dụng, sửa và phân phối phần văn bản tự soạn này.
- Chưa upload, nhập hoặc công khai nội dung trên hệ thống thật. JSON ở `/admin/import` hiện chỉ nhập vào kho riêng ADMIN, không tự thành Kho bài người học. Nếu dùng PDF qua luồng trích xuất web, OCR hiện vẫn dùng provider riêng; lượt này không gọi OCR/AI hoặc phát sinh phí provider.

## Bằng chứng local

| Kiểm tra | Kết quả |
| --- | --- |
| Unit/regression Windows | 220/220 đạt, không skip |
| PostgreSQL integration | 73/73 đạt, không skip, container `toeic-resubmit-test-20261009`, chỉ bind `127.0.0.1:55433`, DB `toeic_release_test` |
| Reading mới | 5/5 đạt: quyền ADMIN/gửi duyệt, duyệt đồng thời chỉ nhập 20 câu một lần, Kho bài giữ đủ bốn nhóm/đoạn đọc/không lộ đáp án trước nộp, chấm đúng/sai/bỏ trống khi nộp đồng thời, thứ tự xem lại và cách ly lịch sử/thống kê |
| TypeScript | Đạt |
| Lint các tệp thay đổi | 0 lỗi; một cảnh báo `<img>` có sẵn ở trang kết quả |
| PDF/ZIP | Đủ 20 câu, đáp án khớp JSON nguồn, 4+2 trang, ZIP CRC đạt, đã kiểm tra ảnh render |
| Production build | Next.js 16.3.8 Webpack đạt trên Windows |

Fixture trích xuất được tạo trực tiếp trong DB test; từ gửi duyệt đến xuất bản, tạo bài, nộp, kết quả, lịch sử và thống kê chạy qua handler thực. Đây không phải kiểm chứng upload/OCR/provider thật, đăng nhập Google, UI trình duyệt hoặc điện thoại. Fixture dọn theo tài khoản/job của lượt chạy, không seed/reset/truncate DB thật. Log chỉ lưu trong `Test/reading-*` và không commit.

CI của baseline `25ed616759c70ee5fc9d6c117151f8d483658148` đã đọc qua GitHub connector: PR run [37907108770](https://github.com/DifnhBao/toeic-mini-trainer/actions/runs/37907108770), web/integration/mobile và từng bước đều success. Kết quả này chưa thay bằng chứng CI của commit bản sửa mới.

Cập nhật 09/10: bản sửa Reading/thứ tự `89eaa4c0459075394b18e41cd8b27aa28083097b` đã đẩy và CI [37913175672](https://github.com/DifnhBao/toeic-mini-trainer/actions/runs/37913175672) đạt đủ web/integration/mobile. Công cụ phục hồi backup bổ sung ở `599d739179e5f06d5eb6645493d0733a8501e264` cũng đạt ba job và từng bước tại [37918253730](https://github.com/DifnhBao/toeic-mini-trainer/actions/runs/37918253730). Hai kết quả này được đọc qua connector, không thay nghiệm thu điện thoại/UI hoặc triển khai API mới.

## Thứ tự tiếp tục

1. Chốt build, lưu/đẩy bản sửa và xác minh CI đúng SHA; giữ PR #4 ở trạng thái nháp.
2. Triển khai web/API theo runbook khi có thể nghiệm thu deployment. API được xác minh gần nhất vẫn `ff80432`; chưa promote bản sửa này. Browser Use trước đó vẫn trả quyền lưu chặn website/GitHub, không dùng HTTP/CLI khác để vượt việc bị từ chối truy cập website. GitHub connector đọc CI đã có quyền hoạt động riêng.
3. Hoàn thiện một bài Reading qua luồng ADMIN hiện có, kiểm đáp án rồi xuất bản; xác minh bằng tài khoản USER thật. Bộ mẫu local hoặc Kho bài trong DB test không chứng minh Kho bài production đã có dữ liệu.
4. Trên APK `0941a11`: làm/nộp/xem lại Part 6 đúng thứ tự; đối chiếu điểm/lịch sử; thử đóng/mở, nộp mất phản hồi, Wi-Fi/4G và đổi hai tài khoản. Các mục MS-01/MS-02/MS-07 còn thiếu bằng chứng cần kiểm tra lại; không chuyển lỗi cũ thành đạt chỉ vì test xanh.
5. Đóng cổng vận hành: CI/bảo vệ nhánh, backup DB/media nhất quán và định kỳ, restore bucket cách ly, cảnh báo/người vận hành/ngân sách. Sau đó thiết bị Android thứ hai và beta mời riêng 10–20 người trong 14 ngày.

Mục tiêu phát hành tổng thể chưa hoàn tất. Chia audio chờ chủ dự án nghiệm thu sau; không dùng việc tạm gác đó để bỏ qua quyền dữ liệu, chấm điểm hoặc các cổng vận hành của bản Reading.
