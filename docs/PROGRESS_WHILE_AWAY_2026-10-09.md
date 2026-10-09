# Báo cáo công việc khi chủ dự án đi vắng

Cập nhật 18h46 ngày 09/10/2026, giờ Việt Nam. Bản này ghi việc đã kiểm chứng; lịch báo cáo 20h sẽ đọc trạng thái mới nhất. Mục tiêu phát hành tổng thể vẫn chưa hoàn tất.

## Đã làm

- Phát triển phân tích học tập cá nhân trên web và Android: đúng/sai/bỏ trống theo Part, số câu khác nhau, xu hướng 30 ngày và đề xuất tối đa ba buổi. Mẫu quá ít không bị kết luận yếu; làm lại một câu không tự tăng bằng chứng. Nhãn kỹ năng chỉ dùng dữ liệu có sẵn, báo độ phủ. Không gọi AI trả phí, không thêm migration hoặc lưu thêm dữ liệu cá nhân.
- Nút luyện chọn đúng Part, ưu tiên câu chưa làm của đúng tài khoản, fallback khi kho thiếu. Tối ưu SQL sau phép đo lịch sử lớn; cùng fixture 400.000 đáp án, 20 tác vụ, p95 cũ/mới 13.112,94/1.190,98 ms. Đây là quan sát local, không phải SLA production.
- Sửa hiển thị chênh lệch xu hướng, tránh số thập phân dài; quyết định tăng/giảm dựa trên tỷ lệ gốc.
- Giữ bộ Reading tự soạn 20 câu và bản sửa thứ tự xem lại đã kiểm chứng trước đó. Không nhập/công khai Reading hoặc ETS trên hệ thống thật khi đi vắng. Chia audio vẫn tạm gác.
- Diễn tập local với backup ngày 08/10: 22 bảng DB; 14/14 media READY khớp. Phục hồi 16 file vào MinIO thật cách ly, hash/metadata/range đạt và đã dọn.
- Backup mới ngày 09/10: DB mã hóa phục hồi thử đạt 22 bảng; R2 20 file/147.590.028 byte giải mã/hash đạt. Cặp mới có 19/19 media READY khớp, 1 file bổ sung; không phải snapshot nguyên tử. Gói mới chưa restore vào MinIO vì vượt giới hạn tổng 128 MiB. Không gửi backup ra ngoài máy.

## Bằng chứng phát triển

Mã chính: `599d739` (phục hồi DB/media), `725b420` (tính năng phân tích), `abe13b0217e8e5c2faebc628ee582c569799e67a` (tối ưu/bằng chứng backup mới), đều đã đẩy lên `codex/release-readiness`.

CI của `abe13b0`: [37925241914](https://github.com/DifnhBao/toeic-mini-trainer/actions/runs/37925241914), web/integration/mobile và từng bước đều success. Đã đọc log: integration 78/78 không skip; unit Linux 243 đạt, 3 ca cần công cụ/Windows được skip, 0 lỗi. Windows local 246/246 không skip; TypeScript/lint tệp sửa đạt; CI web build, Android export và kiểm tra bundle đạt. Ba cảnh báo img cũ ở lint web còn tồn tại.

Chưa triển khai API production hoặc tạo APK cho màn phân tích mới. API được xác minh gần nhất `ff80432`, APK đang nghiệm thu `0941a11`; không coi mã/CI xanh là điện thoại đã có tính năng. PR #4 giữ nháp, không merge.

## Trở ngại mới

Ổ C hết dung lượng (0 byte theo phép đọc); Docker Desktop không khởi động được sau lỗi I/O của DB test. Đã ngừng phép đo nặng và không xóa/move tệp cá nhân. Lượt đo với câu lặp cuối chưa hoàn tất và fixture có thể còn trong volume DB test; cần khôi phục môi trường rồi xác minh/dọn theo quyền sở hữu. CI riêng đã kiểm chứng bản sửa cuối; không thay DB thật cho kiểm thử local.

Ba biên bản Android do chủ dự án đang sửa được giữ nguyên, không đưa vào commit của lượt này. Chưa có USB/ổ cứng ngoài: backup ngoài máy và khóa phục hồi độc lập vẫn còn thiếu. Quyền Browser Use lưu chặn trước đó chưa có bằng chứng khôi phục mới; không dùng đường khác vượt quyền.

## Khi trở lại

1. Giải phóng dung lượng ổ C, khôi phục Docker và dọn fixture test bị gián đoạn; không reset DB thật.
2. Theo runbook, phát hành API và APK đồng bộ, nghiệm thu màn phân tích trên S23 FE theo tám mục trong biên bản.
3. Hoàn thiện một bộ Reading hợp lệ trong Kho bài, gắn nhãn được kiểm duyệt; kiểm tra với tài khoản người học thật và Android thứ hai.
4. Hoàn thiện vận hành: backup định kỳ/ngoài máy/khóa, phục hồi DB-media nhất quán, cảnh báo/ngân sách/người xử lý, bảo vệ nhánh; sau đó beta 10–20 người/14 ngày.

Chi tiết: [kế hoạch phân tích](PERSONAL_LEARNING_INSIGHTS_PLAN.md), [nghiệm thu tính năng](PERSONAL_LEARNING_INSIGHTS_ACCEPTANCE_2026-10-09.md), [hiệu năng và lỗi môi trường](PERSONAL_LEARNING_INSIGHTS_PERFORMANCE_2026-10-09.md), [backup/restore](BACKUP_RECOVERY_PAIR_2026-10-09.md).
