# Product blueprint — TOEIC Mini Trainer

## 1. Bài toán sản phẩm

Người dùng chính là một người tự học TOEIC, đã có tài liệu rời rạc (PDF, audio, JSON) nhưng thiếu một vòng lặp học tập khép kín:

`đưa tài liệu vào → luyện ngắn → biết sai ở đâu → hiểu vì sao sai → luyện lại đúng điểm yếu`

Giá trị cốt lõi không nằm ở việc mô phỏng một bài thi 200 câu, mà ở khả năng biến tài liệu cá nhân thành các phiên học ngắn, có phản hồi và có lịch sử tiến bộ.

## 2. Các quyết định sản phẩm

### Vào app là có thể học ngay

Dashboard ưu tiên bộ tạo bài luyện thay vì trang giới thiệu. Người học chọn phạm vi và số câu trong một màn hình:

- Tổng hợp: lấy từ cả 7 Part.
- Listening: lấy từ Part 1–4.
- Reading: lấy từ Part 5–7.
- Từng Part: luyện đúng một dạng bài.
- Số câu: preset 5/10/20 hoặc tùy chỉnh 5–50.

### Học theo vòng lặp, không chỉ chấm điểm

Sau khi nộp bài, app phải trả lời bốn câu hỏi:

1. Tôi đúng bao nhiêu?
2. Tôi sai câu nào?
3. Tại sao lựa chọn của tôi sai?
4. Kiến thức/mẹo nào cần ghi nhớ cho lần sau?

AI chỉ được dùng ở nơi tạo thêm giá trị: giải thích lỗi và trả lời câu hỏi học tập. Điểm số và đáp án luôn do server/database quyết định, không giao cho AI.

### AI hỗ trợ, người học kiểm duyệt

Pipeline PDF sử dụng AI để cấu trúc hóa dữ liệu, nhưng không lưu thẳng. Người dùng xem Part, câu hỏi, lựa chọn và đáp án AI nhận diện trước khi bấm lưu. Điều này giảm rủi ro AI đoán sai answer key.

## 3. Kiến trúc chức năng

| Khu vực | Mục tiêu | Dữ liệu chính |
| --- | --- | --- |
| Dashboard | Tạo bài và thấy tiến độ | `Question`, `TestAttempt` |
| Test runner | Làm câu hỏi có audio/ảnh/đoạn đọc | `MiniTest`, `MiniTestQuestion` |
| Result review | Chữa lỗi và gọi AI | `UserAnswer`, `AiExplanation` |
| History | Nhìn lại xu hướng | `TestAttempt`, `UserAnswer` |
| AI Coach | Hỏi kiến thức/mẹo độc lập | Gemini API, không lưu hội thoại ở MVP |
| Kho đề | PDF/audio/JSON → câu hỏi | `QuestionGroup`, `Question` |

## 4. Mô hình dữ liệu

- `User`: tài khoản Google.
- `QuestionGroup`: ngữ cảnh dùng chung; có thể chứa đoạn văn, audio và ảnh.
- `Question`: Part, nội dung, lựa chọn và đáp án đúng.
- `MiniTest`: một đề ngắn được sinh tại thời điểm người học bắt đầu.
- `MiniTestQuestion`: quan hệ giữa đề và câu hỏi, có thứ tự.
- `TestAttempt`: một lần nộp bài của một người dùng.
- `UserAnswer`: lựa chọn và trạng thái đúng/sai của từng câu.
- `AiExplanation`: lời giải AI được cache theo câu trả lời sai.
- `SkillTag`: nền tảng cho phân tích lỗi theo chủ điểm ở phiên bản sau.

## 5. Ranh giới bảo mật quan trọng

- API tạo/mở/nộp bài và API AI yêu cầu đăng nhập.
- API mở bài không trả `correctAnswer` xuống trình duyệt.
- Trang kết quả và lịch sử chỉ truy vấn attempt thuộc email đang đăng nhập.
- Upload kiểm tra loại file và kích thước trước khi xử lý.
- Khóa Gemini, Google OAuth và database chỉ tồn tại ở server qua biến môi trường.

## 6. Trạng thái MVP

Đã có:

- Luồng đăng nhập → tạo bài → làm bài → nộp → chữa bài.
- Tổng hợp/Listening/Reading/Part 1–7.
- Audio, ảnh, passage; lưu nháp câu trả lời trên thiết bị.
- Dashboard tiến độ, lịch sử và AI Coach.
- PDF/audio extraction, kiểm duyệt, import JSON.
- Giao diện responsive và trạng thái lỗi/loading cơ bản.

Chưa nên gọi là production cho đến khi hoàn thành:

- Object storage bền vững cho PDF/audio/ảnh.
- Phân quyền “owner/admin” cho nhập dữ liệu.
- Rate limit và theo dõi chi phí AI.
- OCR cho PDF scan.
- Tách audio theo nhóm câu hoặc timestamp.
- Bộ test tự động cho scoring, authorization và import validation.

## 7. Roadmap có thứ tự

### P1 — Vận hành an toàn

1. Chuyển upload sang S3/R2 và lưu metadata tài liệu.
2. Thêm vai trò owner/admin.
3. Rate limit AI; log lỗi không chứa nội dung tài liệu nhạy cảm.
4. Backup PostgreSQL và quy trình restore thử nghiệm.

### P2 — Vòng lặp học thông minh

1. Gắn skill tags cho câu sai.
2. Dashboard “3 chủ điểm yếu nhất”.
3. Chế độ luyện lại câu sai theo spaced repetition.
4. Mục tiêu tuần và chuỗi ngày học.

### P3 — Chất lượng bộ đề

1. OCR cho file scan.
2. Editor sửa trực tiếp câu hỏi trước khi lưu.
3. Tách audio theo Part/group và transcript có timestamp.
4. Phát hiện câu trùng, answer key thiếu hoặc mâu thuẫn.

## 8. Chỉ số nên theo dõi

- Số phiên học hoàn thành mỗi tuần.
- Tỷ lệ bắt đầu → nộp bài.
- Độ chính xác theo Part và theo skill tag.
- Số câu sai được mở lời giải AI.
- Tỷ lệ câu sai làm đúng khi xuất hiện lại.
- Chi phí AI trên mỗi phiên học hoàn thành.

Chỉ số “làm đúng lại câu từng sai” là thước đo quan trọng nhất, vì nó phản ánh học thật thay vì chỉ sử dụng app nhiều.
