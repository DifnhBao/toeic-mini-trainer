# Diễn tập phục hồi DB và media ngày 09/10/2026

Đã thực hiện trên các bản backup thật được chủ dự án cho phép lưu trên máy. Không đọc/ghi cloud trong hai lượt diễn tập này, không sửa dữ liệu đang dùng. Chủ dự án cho biết chưa có USB/ổ cứng ngoài; phần backup ngoài máy vẫn chưa hoàn thành.

## Kết quả đã kiểm chứng

| Kiểm tra | Bằng chứng |
| --- | --- |
| DB cũ phục hồi vào PostgreSQL 18 cách ly | 22 bảng và số bản ghi khớp manifest; `--network none`, không mở cổng, dữ liệu tmpfs |
| Tham chiếu media trong DB phục hồi | 14/14 asset READY khớp key, dung lượng, MIME và ETag trong gói R2 đã giải mã/xác thực; 2 object bổ sung không được DB này tham chiếu |
| File thiếu hoặc khác phiên bản | 0; không có asset thiếu ETag hoặc nhóm dùng URL legacy trong snapshot này |
| Media phục hồi vào engine MinIO thật cục bộ | 16/16 object, 18.948.378 byte, nội dung SHA-256/metadata/content headers khớp; 16 lượt đọc range đều đạt |
| Dọn dữ liệu thử | Bucket mới UUID, các file đã ghi, container và mạng sở hữu bởi lượt chạy đã dọn; không giữ plaintext trên đĩa |
| Unit/regression sau bổ sung | 233/233 đạt trên Windows, không skip |

DB dùng `neon-2026-10-08T04-13-59.877Z.dpapi`; media dùng `r2-2026-10-08T10-21-46.688Z-7e03760b`. Đây là bản lưu ngày 08/10, **không phải backup mới của toàn bộ dữ liệu production hiện tại**, không cùng thời điểm snapshot nguyên tử. Không suy luận 2 object bổ sung là rác và không xóa chúng ở nguồn.

Receipt chỉ chứa số lượng/hash/tên gói, lưu local trong `Test/backups/pair-b26dae69-7433-49bf-ba99-dd2b14051a9d.json` và `engine-drill-976a44b9-02f7-4b86-93e8-6c9a6b2ca69e.json`. Thời gian đo lần lượt 22,605 và 60,91 giây; không phải cam kết RTO cho sự cố toàn hệ thống. Không commit backup, tên object riêng tư, credential hoặc manifest đã giải mã.

## Công cụ tái thực hiện

Chạy trên Windows cùng tài khoản/profile DPAPI đã mã hóa; Docker hoạt động và các image đã có sẵn. Không tự tải image hoặc dùng endpoint cloud.

```powershell
$env:ALLOW_LOCAL_BACKUP_PAIR_VERIFY = 'true'
node --experimental-strip-types scripts/verify-backup-pair-windows.mts 'Test/backups/neon-2026-10-08T04-13-59.877Z.dpapi' 'Test/backups/r2-2026-10-08T10-21-46.688Z-7e03760b'
Remove-Item Env:ALLOW_LOCAL_BACKUP_PAIR_VERIFY

$env:ALLOW_LOCAL_R2_ENGINE_DRILL = 'true'
node --experimental-strip-types scripts/drill-r2-local-engine.mts 'Test/backups/r2-2026-10-08T10-21-46.688Z-7e03760b'
Remove-Item Env:ALLOW_LOCAL_R2_ENGINE_DRILL
```

Pair verifier xác thực dump/manifest, giải mã trong bộ nhớ, phục hồi DB với một transaction, đối chiếu toàn bộ bảng rồi kiểm tra metadata READY với manifest R2 đã xác thực. Metadata khác hoặc thiếu phiên bản không được báo là khớp.

MinIO dùng `cgr.dev/chainguard/minio:latest` đã có trên máy, phiên bản quan sát `RELEASE.2026-09-22T19-25-18Z`; relay chỉ dùng Bash của `postgres:18` đã có. Cả hai nằm trên Docker `--internal`; không publish port, không có đường ra Internet. Node truyền HTTP qua stdin/stdout của Docker exec đến alias cố định `toeic-minio:9000`; SDK chỉ có credential local cố định. Endpoint loopback trong SDK phục vụ ký request, không mở kết nối đến cổng Windows. Đây là giải pháp cho việc Docker Desktop trên máy này không truy cập được published port của mạng internal. Mạng không được nới quyền để xử lý lỗi.

Preflight giải mã/xác thực toàn bộ gói trước khi tạo bucket/PUT; đọc lại xác thực từng object khi phục hồi. Công cụ kiểm tra đầy đủ nội dung, metadata và range rồi xóa chỉ những PUT được xác nhận trong bucket mới. Nếu ghi mất phản hồi/dọn lỗi thì báo thất bại; phần ngoài kiểm tra label sở hữu trước khi xóa container/mạng. Media chỉ ở bộ nhớ/tmpfs. Giới hạn drill 128 MiB tổng, 128 MiB mỗi response, timeout mỗi request 30 giây; không dùng công cụ này cho restore production.

Kiểm thử thêm: HTTP binary/Unicode query, interim 100, HEAD, chunked/extension/trailer, header Vary lặp, từ chối header injection/truncated response/framing mâu thuẫn; asset mất/khác MIME/size/ETag; plaintext buffer không rỗng được xóa cả khi callback thành công và khi callback lỗi đúng `SinkFailed`.

## Backup mới lúc 18h13–18h21 ngày 09/10

Đã đọc nguồn và lưu mã hóa trên máy theo phê duyệt DB/R2 trước đó. Không ghi/xóa/khôi phục vào Neon hoặc R2 thật, không tải backup lên Git/cloud.

| Kiểm tra | Kết quả |
| --- | --- |
| DB mới | PostgreSQL 18.6; dump DPAPI được giải mã và phục hồi vào container `--network none`, tmpfs; 22 bảng/số bản ghi khớp, đã dọn container; 33,291 giây |
| R2 mới | 20 object, 147.590.028 byte; AES-256-GCM, khóa bảo vệ bằng DPAPI; giải mã/xác thực và SHA-256 từng file đạt; không có cloud write |
| Đối chiếu cặp mới | 19/19 asset READY khớp key/dung lượng/MIME/ETag; 1 object bổ sung; thiếu hoặc khác phiên bản/dung lượng/MIME đều 0 |
| Xác thực cặp | Toàn bộ gói R2 được xác thực; DB phục hồi và đối chiếu 22 bảng, container đã dọn; không gọi cloud; 21,991 giây |

Gói mới: `Test/backups/neon-2026-10-09T11-13-35.986Z.dpapi` và `Test/backups/r2-2026-10-09T11-14-58.806Z-75a13678`. Receipt `Test/backups/pair-aeede902-874f-4764-96fe-caa13c17ef17.json`, kiểm tra lúc `2026-10-09T11:21:01.820Z`; SHA-256 của file DB mã hóa `a3d5db70078f93abeb98ac601e814996bed1b37e2f62072066867cb8be0b19dc`. Không commit các gói/manifest/log riêng tư này.

Cặp mới vẫn **không phải snapshot nguyên tử DB/media**. Object bổ sung không được suy luận là rác. Gói R2 mới lớn hơn giới hạn drill MinIO 128 MiB tổng; chưa phục hồi 20 file mới vào engine. Bằng chứng engine phía trên chỉ áp dụng cho gói 16 file ngày 08/10. Không nới giới hạn để biến kiểm tra thành đạt.

Công cụ DB backup được sửa để theo dõi container trước khi tạo, kiểm tra label sở hữu và dọn trước khi công bố `verified/cleaned`; xóa buffer plaintext cả khi lỗi. Docker dùng image đã có với `--pull never`. Syntax/lint đạt và lượt backup thật ở trên kiểm chứng đường chạy thành công; chưa có fault injection cho mọi lỗi Docker/DPAPI.

## Các cổng vẫn mở

- Backup định kỳ, retention/cảnh báo quá hạn, RPO đề xuất ≤24 giờ; lượt mới chỉ chứng minh thời điểm vừa sao lưu, chưa phải lịch vận hành.
- Điểm phục hồi DB/media cùng thời điểm và đối chiếu thông qua ứng dụng đã khôi phục.
- Quyền IAM/cấu hình R2 thật, private bucket/cloud restore có phê duyệt riêng; MinIO local không kiểm chứng các mục này.
- Bản sao ngoài máy và khóa phục hồi độc lập với Windows profile. DPAPI CurrentUser không tự bảo vệ khỏi mất máy/profile; chưa có ổ lưu ngoài, không tự gửi backup cloud.
- Diễn tập toàn hệ thống và RTO đề xuất ≤4 giờ. Không đóng cổng vận hành chỉ vì hai lượt local này đạt.
