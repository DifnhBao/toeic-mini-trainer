# Nghiệm thu staging — 28/09/2026

Phạm vi: APK Android preview và API staging phi thương mại. Không dùng tài khoản
thật của người khác, PDF có bản quyền hoặc dữ liệu nhạy cảm để thử nghiệm.

## Đã kiểm tra tự động trong workspace

- `npm test`: 23/23 đạt, gồm hồi quy job import quá hạn và poll qua lỗi mạng.
- `npx tsc --noEmit`: root và `mobile/` đạt.
- `npm run build`: đạt.
- `npm run lint`: 0 lỗi, 4 cảnh báo có sẵn.
- `npx expo export --platform android`: bundle Android đạt; không thay thế APK build.
- API staging: `/` trả 200; `/api/internal/ready` không có secret trả 401;
  `/api/v1/ingestions/<UUID>` không đăng nhập trả 401.

Các thay đổi code ở lượt này mới nằm trong workspace, **chưa deploy**. Kết quả
trên staging hiện tại không xác nhận bản sửa mới cho đến khi commit, push, build
APK preview mới và kiểm thử lại.

## Cần nghiệm thu trên điện thoại thật

| Mã | Thao tác | Chấp nhận khi |
| --- | --- | --- |
| QA-A | Tài khoản A tạo bài, nộp, xem kết quả; B đăng nhập cùng thiết bị và mở ID bài/kết quả/job/file của A | B nhận 404/không thấy dữ liệu A; A đăng nhập lại vẫn có dữ liệu |
| QA-B | A upload PDF chữ có thể chọn và audio thử nghiệm, đóng app giữa job, mở lại; kiểm tra, sửa đáp án, import; tạo bài dùng câu vừa nhập | Job không nhân đôi; xem/sửa được mọi câu, kể cả câu 21+; câu đã nhập xuất hiện trong bài |
| QA-C | Tắt mạng khi app đang poll job, bật lại; thử trong lúc refresh token và lúc nộp bài | Không mất phiên hoặc job, không tạo hai attempt; có cách tiếp tục rõ ràng |
| QA-D | Lưu câu hỏi rồi cố tình để job `IMPORTING` bị ngắt (chỉ trên dữ liệu test) | Không tự báo `COMPLETED`; có nút thử lưu lại và không nhân đôi câu |
| QA-E | Theo dõi trong 3 ngày: GitHub Actions, Vercel, Neon, R2, Gemini | Không có job FAILED tồn đọng, lỗi 5xx bất thường hoặc khoản phí; hard-stop Actions $0 vẫn bật |

Ghi lại cho mỗi lần thử: thời gian, EAS build ID, backend commit SHA, Android
version, loại mạng, tài khoản giả danh A/B, kết quả, ảnh lỗi đã che thông tin.
Không lưu mật khẩu, ID/refresh token, signed URL hoặc client secret.

## Chưa đủ điều kiện công bố rộng rãi

- Mobile hiện chỉ hiện 20 câu đầu và chưa cho sửa đáp án trước khi import.
- Job ID chưa được khôi phục sau khi đóng hẳn app; bản sửa này chỉ giữ ID để
  tiếp tục poll khi màn hiện tại còn mở.
- Chưa có kiểm thử tích hợp hai tài khoản với database test cách ly; đọc source
  và 401 không chứng minh được toàn bộ phân quyền.
- Không truy cập được dashboard chi phí của chủ tài khoản từ workspace; người
  vận hành cần xác nhận từng dịch vụ trong bảng QA-E.
