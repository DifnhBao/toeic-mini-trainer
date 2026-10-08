# Kiểm chứng backup DB Neon ngày 08/10/2026

Đã thực hiện sau khi chủ dự án đồng ý xuất dữ liệu DB thật xuống máy này. Không ghi, seed, migrate hoặc restore vào Neon.

## Kết quả quan sát

- PostgreSQL nguồn: 18.6; dùng pg_dump/pg_restore 18.6.
- Dump custom archive từ snapshot transaction chỉ đọc, đồng bộ với lượt đếm bản ghi.
- Mã hóa Windows DPAPI CurrentUser trước khi ghi file; giải mã lại trong bộ nhớ và đối chiếu SHA-256.
- Restore thành công với `--single-transaction --exit-on-error` vào container PostgreSQL mới, không có mạng, không publish port, dữ liệu trong tmpfs.
- Số bản ghi của **22 bảng public** khớp snapshot nguồn. Toàn bộ lượt backup/mã hóa/restore/đối chiếu mất **24,657 giây**.
- Container restore đã được xóa sau khi kiểm tra label sở hữu của chính lượt chạy.

File tại `Test/backups/neon-2026-10-08T04-13-59.877Z.dpapi` (92.038 byte); manifest kiểm chứng bên cạnh có đuôi `.dpapi.json`. Thư mục này bị loại khỏi Git, EAS và Vercel. Không mở/in dữ liệu dump hoặc đưa backup vào commit.

## Tái thực hiện có chủ đích

Từ thư mục gốc repository trên máy Windows này, với Docker chạy và image PostgreSQL 18 chính thức đã có:

```powershell
$env:ALLOW_READONLY_CLOUD_BACKUP = 'true'
node scripts/backup-neon-windows.mjs
Remove-Item Env:ALLOW_READONLY_CLOUD_BACKUP
```

Script dùng DATABASE_URL hiện được cấu hình, chỉ chấp nhận hostname Neon, mở transaction chỉ đọc và không in credential. Password của pg_dump đi qua environment của process cục bộ; không nằm trong argv hoặc file. Bản nguồn đầu tiên đã chạy thành công ở `Test/cloud-backup-verify.cjs`; bản được lưu trong scripts dùng cùng logic, import ESM và đổi đường dẫn output theo vị trí file.

DPAPI cần **đúng tài khoản/profile Windows** đã mã hóa. Không coi bản lưu trên máy này là bản backup có thể khôi phục sau khi mất máy/profile. Entropy cố định của định dạng là UTF-8 `toeic-mini-trainer.backup.v1`; manifest ghi hash để kiểm tra toàn vẹn. Khi khôi phục, giải mã trong bộ nhớ và chỉ đưa vào database cách ly để kiểm chứng trước, không tự restore vào production.

## Phần chưa hoàn thành

- Backup định kỳ/PITR và kiểm tra retention trên tài khoản Neon.
- Bản sao ngoài máy với cơ chế quản lý khóa/khôi phục được phê duyệt.
- Backup, đối chiếu và khôi phục PDF/audio/ảnh trong R2; dump DB chỉ chứa tham chiếu media.
- Kiểm chứng RPO ≤24 giờ và RTO ≤4 giờ trong kịch bản sự cố đầy đủ, gồm cấu hình ứng dụng và media. Thời gian thử restore nhỏ ở trên không phải RTO production.
