# Chuẩn bị media cho nghiệm thu ETS Listening

## Kết quả cục bộ

Sau rollout ảnh `f0bc90f`, đã chuẩn bị 11 PNG từ PDF ETS 2022 Test 1 do chủ dự án cung cấp: sáu ảnh Part 1 (câu 1-6), ba bảng/biểu đồ Part 3 (nhóm 62-64, 65-67, 68-70), hai bảng/biểu đồ Part 4 (nhóm 95-97, 98-100). Vùng cắt được chọn sau khi xem trang nguồn hoàn chỉnh và đã xem lại từng PNG kết quả. Render trực tiếp bằng Poppler, không dùng AI thay đổi nội dung hoặc suy đoán đáp án.

Các file nằm trong `output/pdf/ets-2022-test-1-media/` (cục bộ, bị loại khỏi Git/Vercel/EAS). `README.md` trong thư mục hướng dẫn ánh xạ số câu và các bước gắn/duyệt ảnh. `manifest.json` ghi trang nguồn, vùng cắt, kích thước, dung lượng và SHA-256 từng ảnh/source. Gói ZIP ở `output/pdf/ets-2022-test-1-media.zip`, chỉ gồm 11 PNG + README + manifest; không chứa PDF gốc, MP3 hoặc đáp án.

| Kiểm tra | Bằng chứng |
| --- | --- |
| Kích thước ảnh | Tổng 5.734.460 byte; lớn nhất 962.314 byte; cả 11 dưới 10 MiB |
| ZIP | 5.687.220 byte, 13 entry, CRC đạt |
| SHA-256 ZIP | `952594b40c47e28e858416e8b8ead741ffeabe1453b231803166ca7e5eefede8` |
| Tính toàn vẹn | Giải đọc ZIP trong bộ nhớ: SHA-256/dung lượng/kích thước/định dạng PNG khớp manifest cho từng ảnh; PDF nguồn không đổi hash |
| Bằng chứng local | `Test/ets-media-verification.json`; hai helper local `Test/prepare-ets-media.py`, `Test/package-ets-media.py` |
| Phạm vi | Không upload cloud, không ghi DB, không đổi runtime API/APK |

## Cổng chưa đóng

- Chưa gắn những ảnh này vào tác vụ thật hoặc công khai bộ ETS. Người quản trị phải kiểm tra số câu gốc, ảnh đúng nhóm, quyền chia sẻ và đáp án trước khi duyệt.
- Mỗi câu Part 1 cần ảnh riêng/nhóm riêng; số nhóm trên UI không mặc nhiên là số câu nguồn. Nếu AI gộp sai thì chưa duyệt, không gắn một ảnh cho nhiều câu Part 1 khác ảnh.
- Ngày 09/10 đã nhận ảnh đáp án và chuẩn hóa đủ câu 1–100 vào `output/ets-2022-test-1-answer-key/` (local, không nằm trong ZIP ảnh). Đối chiếu bản chép theo hàng/cột đạt; chưa nhập key vào tác vụ. Phải ghép theo số câu gốc, không theo chỉ số UI mỗi cụm. Không suy đáp án bằng MP3 hoặc ảnh đề.
- MP3 vẫn nguyên bài, chưa tách đoạn/đặt mốc thời gian cho nhóm. Ngày 09/10 đã nghiệm thu upload PDF/MP3 và OCR thật/lưu/mở lại cụm 1–4 qua ADMIN/R2; chưa gắn ảnh, phát/nghe audio, công khai hoặc thử Kho bài trên S23 FE. Upload ảnh câu 1 bị từ chối quyền trình duyệt, rồi truy cập site cũng bị từ chối; đã dừng, không thử đường khác. Chi tiết tại [ETS_UPLOAD_OCR_ACCEPTANCE_2026-10-09.md](ETS_UPLOAD_OCR_ACCEPTANCE_2026-10-09.md).
- Các file này phục vụ nghiệm thu nội bộ; không dùng việc chuẩn bị media để nâng trạng thái beta hoặc coi bộ 100 câu đã hoàn chỉnh.

Không chạy lại build/test runtime cho thay đổi chỉ gồm tài liệu và file media local; giữ nguyên bằng chứng bản live `f0bc90f` (146 unit, 24 integration, 18 HTTP smoke) và các giới hạn đã ghi trong `LISTENING_IMAGES_2026-10-08.md`.
