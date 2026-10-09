# Báo cáo công việc khi chủ dự án đi vắng

Cập nhật 20h11 ngày 09/10/2026, giờ Việt Nam. Bản này ghi việc đã kiểm chứng đến lượt báo cáo buổi tối. Mục tiêu phát hành tổng thể vẫn chưa hoàn tất.

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

Head đã đẩy hiện tại `b3d55e152cbd656729e65404f76ff8c80efd7bde` chỉ cập nhật tài liệu so với `abe13b0`; CI [37925949985](https://github.com/DifnhBao/toeic-mini-trainer/actions/runs/37925949985) được đọc lại trong lượt báo cáo và vẫn completed/success. PR đã cập nhật phạm vi, bằng chứng và các cổng còn mở.

Sau đó đã bắt đầu bổ sung mã hỗ trợ vào thông báo lỗi API web/Android để đối chiếu log. Thay đổi hiện chỉ ở working tree: helper dùng chung, ApiError mobile và các luồng web chính; **chưa kiểm thử, chưa commit/push/deploy**. CI xanh của `b3d55e1` không bao phủ phần đang sửa này. Cần hoàn thiện/kiểm thử trước khi dùng để nghiệm thu; không báo tính năng mã hỗ trợ đã hoàn thành.

## Trở ngại mới

Cập nhật sau báo cáo 20h11: phần mã hỗ trợ đã hoàn thiện cục bộ, 252/252 unit Windows không skip, TypeScript web/mobile đạt và lint 0 lỗi (3 cảnh báo img cũ). Đã thêm cấu hình Metro chỉ mở thư mục shared và kiểm tra loader/lint đạt. Chưa commit/push/CI cho phần mới tại thời điểm ghi cập nhật này; build web, export Android, PostgreSQL cần được xác minh trên CI trước phát hành. Chi tiết [CLIENT_SUPPORT_CODE_2026-10-09.md](CLIENT_SUPPORT_CODE_2026-10-09.md). Đoạn working tree ở trên giữ trạng thái tại lúc báo cáo 20h11.

Ổ C từng hết dung lượng (0 byte theo phép đọc); trong lượt báo cáo còn 114.126.848 byte, khoảng 109 MiB, vẫn quá ít để tiếp tục phép đo nặng. Docker Desktop không khởi động được sau lỗi I/O của DB test ở lần kiểm tra gần nhất. Đã ngừng phép đo nặng và không xóa/move tệp cá nhân. Lượt đo với câu lặp cuối chưa hoàn tất và fixture có thể còn trong volume DB test; cần khôi phục môi trường rồi xác minh/dọn theo quyền sở hữu. CI riêng đã kiểm chứng bản sửa đã commit; không thay DB thật cho kiểm thử local.

Ba biên bản Android do chủ dự án đang sửa được giữ nguyên, không đưa vào commit của lượt này. Chưa có USB/ổ cứng ngoài: backup ngoài máy và khóa phục hồi độc lập vẫn còn thiếu. Quyền Browser Use lưu chặn trước đó chưa có bằng chứng khôi phục mới; không dùng đường khác vượt quyền.

## Khi trở lại

1. Giải phóng dung lượng ổ C, khôi phục Docker và dọn fixture test bị gián đoạn; không reset DB thật.
2. Chốt/kiểm thử mã hỗ trợ đang sửa; theo runbook phát hành API và APK đồng bộ, nghiệm thu màn phân tích trên S23 FE theo tám mục trong biên bản.
3. Hoàn thiện một bộ Reading hợp lệ trong Kho bài, gắn nhãn được kiểm duyệt; kiểm tra với tài khoản người học thật và Android thứ hai.
4. Hoàn thiện vận hành: backup định kỳ/ngoài máy/khóa, phục hồi DB-media nhất quán, cảnh báo/ngân sách/người xử lý, bảo vệ nhánh; sau đó beta 10–20 người/14 ngày.

Chi tiết: [kế hoạch phân tích](PERSONAL_LEARNING_INSIGHTS_PLAN.md), [nghiệm thu tính năng](PERSONAL_LEARNING_INSIGHTS_ACCEPTANCE_2026-10-09.md), [hiệu năng và lỗi môi trường](PERSONAL_LEARNING_INSIGHTS_PERFORMANCE_2026-10-09.md), [backup/restore](BACKUP_RECOVERY_PAIR_2026-10-09.md).
