# Diễn tập phục hồi media cục bộ ngày 09/10/2026

## Phạm vi đã kiểm chứng

Đã giải mã bản backup R2 được chủ dự án phê duyệt ngày 08/10 bằng DPAPI CurrentUser, đưa **16 object / 18.948.378 byte** qua AWS SDK và HTTP vào fixture S3 trong bộ nhớ, đọc lại toàn bộ và đối chiếu hash/metadata/content headers. Cả 16 file có dữ liệu đều qua đọc đoạn đầu với HTTP 206 và Content-Range đúng. Bucket thử đã dọn, listener đã dừng; không ghi plaintext lên đĩa hoặc gọi R2/cloud/DB/AI.

Đây là **fixture giao thức HTTP cục bộ**, không phải MinIO hoặc Cloudflare R2. Fixture không xác thực chữ ký SigV4 đầy đủ, không mô phỏng IAM/lifecycle/versioning/durability. Kết quả không đóng cổng phục hồi bucket thực, quyền riêng tư hoặc liên kết DB/media sau sự cố. Snapshot này có trước upload PDF/MP3 ETS mới và không bao gồm chúng. Thời gian lượt thử được ghi trong proof local; không dùng thời gian fixture làm RTO production.

Bằng chứng local: `Test/r2-local-restore-real-backup.json`, helper chạy thật `Test/verify-real-r2-local-restore.mts`, log unit/typecheck/lint `Test/*r2*restore*.txt`. Backup, decoded metadata và file nguồn vẫn bị loại khỏi Git/Vercel/EAS.

## Công cụ và chốt an toàn

- `scripts/backup-r2-windows.mts`: thêm reader kiểm tra toàn bộ package trước khi đưa plaintext cho restore sink; mỗi object được kiểm tra lại AES-GCM/SHA-256/size, buffer được xóa trong finally. Lệnh backup/verify cũ giữ nguyên interface và format.
- `scripts/verify-r2-local-restore.mts`: chỉ nhận HTTP `127.0.0.1` với port rõ ràng, không đọc `.env` hoặc dùng credential cloud. Không nhận URL R2, hostname DNS, userinfo, path, query, fragment. SDK không theo region redirect.
- Mỗi lượt tự sinh tên bucket UUID, HEAD phải trả 404 rồi mới tạo. Create thất bại không dẫn đến ghi/xóa bucket hiện có; object PUT dùng If-None-Match `*`. Chỉ xóa các PUT đã được xác nhận trong bucket của lượt này; không có thao tác xóa hàng loạt.
- Đọc lại từng file, đối chiếu byte count/hash, metadata và content headers đã lưu; file không rỗng phải đọc được range. Dọn lỗi phải báo thất bại. PUT mất phản hồi có thể đã ghi dữ liệu nhưng chưa được xác nhận: công cụ không tự xóa object đó, DeleteBucket sẽ phát hiện còn object và báo `LocalRestoreCleanupFailed` cùng tên bucket local để người vận hành kiểm tra.
- Fixture unit bổ sung các tình huống backup hỏng ở object sau (không ghi gì), sai byte/metadata/range, PUT lỗi/mất phản hồi, bucket đã tồn tại, cleanup lỗi và zero buffer sau callback thành công/thất bại. Fixture chỉ bind loopback và dọn nội dung trong bộ nhớ khi đóng.

## Chạy với backend S3 cục bộ riêng

Đây là lệnh vận hành cho một backend thử nghiệm đã chuẩn bị riêng; trong lượt này chỉ fixture trong bộ nhớ đã được chạy. Backend cần credential fixture `toeic-local-restore` / `local-restore-only`, region `us-east-1`, hỗ trợ bucket create/HEAD/delete, conditional PUT, GET/Range và metadata. Không dùng credential production hoặc dữ liệu có sẵn. Container/backend thật chưa được khởi động để nghiệm thu trong lượt này.

```powershell
$env:ALLOW_LOCAL_R2_RESTORE = 'true'
node --experimental-strip-types scripts/verify-r2-local-restore.mts 'D:\code\Toeic\toeic-mini-trainer\Test\backups\r2-2026-10-08T10-21-46.688Z-7e03760b' 'http://127.0.0.1:9000'
Remove-Item Env:ALLOW_LOCAL_R2_RESTORE
```

Yêu cầu Windows profile giữ khóa DPAPI. CLI chỉ nhận thư mục con trực tiếp của `Test/backups`, opt-in rõ ràng và endpoint loopback. Thành công phải có `verified`, `metadataChecked`, `cleaned` đều true, số file/byte đúng receipt. Sau lỗi cleanup, kiểm tra đúng bucket local được báo, giữ log lỗi đã lọc; không xóa bucket khác hoặc đổi endpoint sang R2 để thử lại.

## Cổng OPS-02 còn lại

Phải diễn tập tiếp trên backend/bucket private cách ly thật, dùng snapshot DB/R2 cùng thời điểm và kiểm tra đường dẫn/quyền/phát audio/ảnh/PDF qua ứng dụng. Còn thiếu backup định kỳ, offsite, khóa phục hồi độc lập khi mất Windows profile, retention/cảnh báo quá hạn và bằng chứng RPO/RTO. Không đưa bản backup hiện tại lên cloud hoặc thay cấu hình vận hành trong lượt này.
