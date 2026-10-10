# Sửa và gửi lại nội dung bị từ chối — 09/10/2026

## Phạm vi đã thực hiện

ADMIN là chủ bộ câu hỏi có thể mở **Sửa và gửi lại bộ câu hỏi** từ danh sách đóng góp bị từ chối hoặc tác vụ nguồn. Trang `/admin/contributions/{id}/edit` nạp dữ liệu đã gửi và lý do từ chối, giữ các chỉnh sửa trước đó. Người nhập sửa nội dung, Part, lựa chọn và đáp án; kiểm tra lại từng câu, loại câu không dùng, xác nhận lại quyền chia sẻ rồi gửi.

Không cần upload hoặc chạy AI lại. Audio/ảnh hiện có được dùng lại và chỉ xem trước trong bản sửa; thay/thêm media trong bước này chưa được hỗ trợ. Quyền xác nhận không được đánh dấu sẵn. Sau khi gửi, cùng mã đóng góp trở về `PENDING`, chưa tạo câu công khai. USER/REVIEWER không được tạo hoặc gửi lại nội dung theo chính sách quản trị viên nhập đề hiện tại.

## Giao dịch và phiên bản

- POST `/api/v1/contributions` nhận `resubmission: { contributionId, expectedUpdatedAt }` cùng `jobId`, `data`, `rightsConfirmed: true`. Chỉ chủ sở hữu có bản `REJECTED` đúng phiên bản được gửi lại; thành công trả 200, lần gửi đầu vẫn 201.
- Trong cùng transaction, khóa phiên bản tác vụ nguồn, so sánh phiên bản đóng góp, cập nhật dữ liệu/trạng thái và ghi audit `CONTRIBUTION_RESUBMITTED`. Hai request gửi lại cùng phiên bản chỉ một request thành công. Không tạo thêm job, đóng góp, media hoặc gọi provider.
- Web gửi `expectedUpdatedAt` khi duyệt/từ chối và đặt lại bộ điều khiển duyệt khi phiên bản đổi. Transaction duyệt so sánh phiên bản đã đọc, kể cả khi copy media diễn ra trước transaction. Lượt duyệt cũ không thể công khai bản vừa được từ chối rồi gửi lại.
- Giữ mốc `reviewedAt` cuối làm dấu đã từng được duyệt, xóa ghi chú/người duyệt hiện hành khi trở về chờ duyệt; lý do từ chối cũ vẫn có trong audit. Bản gửi lại bắt buộc có phiên bản khi duyệt. Client cũ thiếu phiên bản nhận 409 và hướng dẫn mở lại trên web. Duyệt lần gửi đầu từ client cũ vẫn được hỗ trợ, với điều kiện so sánh phiên bản trong transaction.
- Không thêm migration, không sửa câu đã xuất bản, không đổi API người học hoặc yêu cầu build APK mới.

## Bằng chứng kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| Unit/regression | 203/203 đạt; gồm tám kiểm thử mới về schema, quyền/phiên bản, audit, xung đột, tương thích client cũ và trạng thái editor khi render |
| PostgreSQL integration | 46/46 đạt, không bỏ qua; chạy tuần tự, 85,737 giây; gồm gửi lại đồng thời và duyệt cũ bị thay thế trong lúc copy media |
| Migration | 11 migration hiện có áp dụng thành công vào PostgreSQL 16 mới, DB `toeic_release_test`, cổng chỉ bind `127.0.0.1:55433` |
| TypeScript | `npm run typecheck` đạt |
| Lint | 0 lỗi, ba cảnh báo img đã có |
| Production build | `npm run build` Webpack đạt, có route editor mới |
| Kiểm tra UI tương tác | Chưa thực hiện: Browser Use từ chối truy cập fixture `http://127.0.0.1:3812`; server fixture đã dừng. Render test không thay thế kiểm tra thao tác trên trình duyệt |

Log cục bộ, không đưa lên Git: `Test/unit-resubmission.txt`, `Test/integration-resubmission.txt`, `Test/migrate-resubmission.txt`, `Test/typecheck-resubmission.txt`, `Test/lint-resubmission.txt`, `Test/build-resubmission.txt`. Fixture chỉ dùng dữ liệu giả, DB và S3 HTTP loopback; không ghi Neon/R2 thật hoặc gọi AI. Container test đã dừng sau kiểm tra; không tác động container của dự án khác.

## Trạng thái phát hành và việc còn lại

Bản sửa này đã hoàn tất kiểm thử mã nguồn cục bộ; chưa triển khai. API live vẫn là `ff80432`. Chưa xác minh remote CI hoặc nghiệm thu UI thật; không suy ra CI đạt từ SSH push. Browser Use vẫn chặn domain sản phẩm/GitHub và vừa chặn fixture cục bộ; cần quyền hợp lệ trước khi tiếp tục các thao tác đó.

Sau khi có quyền: xác minh ba job CI, build deployment mới, kiểm tra editor bằng ADMIN/chủ sở hữu và tài khoản khác, thử từ chối → sửa → gửi lại → duyệt, kiểm tra trang cũ nhận xung đột, rồi nghiệm thu media và luồng người học trước promote theo runbook.

CONTENT-03 mới hoàn thành phần sửa nội dung/đáp án và gửi lại bản bị từ chối ở mã nguồn. Thêm/thay media khi sửa, editor câu đã xuất bản và quy tắc tăng `contentRevision`/vô hiệu cache lời giải vẫn còn. Bộ ETS mới có đáp án chuẩn hóa cục bộ; chưa ghép vào bản nháp, hoàn tất media hoặc công khai. Các cổng Android, vận hành và beta vẫn mở.
