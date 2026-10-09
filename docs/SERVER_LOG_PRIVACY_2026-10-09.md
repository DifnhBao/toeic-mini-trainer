# Giới hạn dữ liệu trong log lỗi server

Ngày 09/10/2026. Phần sửa bổ sung cho SAFE/OPS; chưa triển khai lên Vercel trong lượt này.

## Vấn đề và thay đổi

Bảy lời gọi log ở upload intent, mở file, complete/cleanup upload, upload ảnh local và đọc bài web còn truyền nguyên Error vào console. Lỗi SDK/DB có thể mang message/stack/cause, URL, header hoặc metadata; không dùng log này để nghiệm thu với file/tài khoản thật.

`app/lib/server-error-log.ts` thay các log đó bằng JSON chỉ có event cố định, timestamp và loại lỗi thuộc allowlist. Không serialize Error hoặc đọc message/stack/cause/toJSON. Tên lớp không nằm trong danh sách trả `UnknownError`; tên được đọc một lần, getter/proxy gây lỗi không làm hỏng xử lý trả lỗi API. Các log AI/auth/ingestion/capacity/đóng góp đang giữ context giới hạn cũng dùng cùng bộ lọc tên lỗi. Job/contribution ID đã kiểm tra UUID được giữ để hỗ trợ điều tra; không thêm nội dung tài liệu hoặc thông tin người dùng.

Hook Next `onRequestError` dùng bộ lọc này, giữ method/route template/routeType hiện có, không ghi request path/query/header. Đã đọc guide instrumentation và kiểu thực tế của Next 16.3.8 đang cài; không thêm thư viện, env hoặc migration. Các HTTP status/message và thao tác DB/storage/AI của route giữ nguyên.

## Bằng chứng và giới hạn

- Ba kiểm thử mới chạy trực tiếp logger và hook Next, dùng lỗi có token/signed URL giả, SDK response/metadata/cause/stack, custom `toJSON`, tên lỗi nhạy cảm, getter thay đổi/throw và proxy đã revoke. Kiểm tra đầu ra không có chuỗi nhạy cảm; hook chỉ giữ route template.
- 189/189 unit đạt; TypeScript và lint toàn repo đạt (ba cảnh báo img đã có). Log cục bộ: `Test/unit-server-log.txt`, `Test/typecheck-server-log.txt`, `Test/lint-server-log.txt`.
- Production build Next 16.3.8 Webpack đạt, 41/41 trang tĩnh và trace hoàn tất, tiến trình kết thúc exit 0; artifact route complete upload chứa event mới. Bằng chứng `Test/build-server-log.txt`. Không gọi provider hoặc cố tình gây lỗi DB/storage cloud để thử.
- Integration PostgreSQL/S3 trước đó là 44 kiểm thử trên source API `ff80432`; chưa chạy lại trong lượt này vì Docker Desktop đang dừng. Không dùng kết quả đó làm nghiệm thu integration của bản sửa log mới.
- API đang chạy vẫn `ff80432`; chưa có deployment hoặc smoke mới của bản sửa này. Không truy cập origin đang bị Browser Use chặn qua HTTP/CLI/browser khác. Cần hoàn tất kiểm chứng rollout được phép trước khi coi bản live đã được sửa log.

Đây là giới hạn dữ liệu của log do ứng dụng phát ra, không phải chứng nhận toàn bộ log nền tảng/SDK/framework không chứa dữ liệu nhạy cảm. Bổ sung sau đó đã kiểm chứng ID API/worker cục bộ tại [REQUEST_TRACE_2026-10-09.md](REQUEST_TRACE_2026-10-09.md), chưa deploy hoặc có UI client báo ID. Metric, cảnh báo thật và người trực vẫn thiếu; OPS-03 vẫn mở. Không thay cảnh báo bằng việc có câu lệnh console hoặc test logger đạt.

## Cổng CI từ xa

Trước đổi kết nối, GitHub connector đọc `DifnhBao/toeic-mini-trainer` trả 404, phiên xác thực `thiennn20`; SSH push vẫn hoạt động. Người dùng đã báo kết nối và chọn `ddinhbao05`, nhưng lần đọc tiếp theo trả `Unknown tool` cho cả lệnh đọc user/repo. GitHub vẫn installed/enabled theo công cụ tìm plugin. Chưa đọc được repo/checks bằng kết nối mới, cần phục hồi connector rồi xác minh ba job quality và branch protection. Không kết luận tài khoản mới thiếu quyền từ lỗi công cụ; không đọc credential helper, tạo token hoặc đổi chế độ quyền plugin để thay quyền GitHub App. Không coi push thành công là CI đã đạt.
