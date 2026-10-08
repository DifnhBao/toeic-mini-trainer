# Nghiệm thu lại bản sửa Samsung

Giữ kết quả A-01…A-08 của APK trước trong `ANDROID_ACCEPTANCE_2026-10-08.md`; không đổi những lỗi đã báo thành “đạt” chỉ vì sửa source.

- Source API/APK sửa lỗi: `dcb6524b3359c8d06cf3ff1395ff45e9adec7dee`.
- API chính: `https://toeic-mini-trainer.vercel.app`.
- Vercel: `dpl_51LUoFCVA9UrTPrpB746D2J7UHn2`, build Ready; 7/7 smoke trước và sau promote. Không chạy migration hoặc seed DB thật.
- APK EAS: `ee0468f2-ffd3-4d5f-ad45-b9c7c6dc4a27`, FINISHED lúc 15:46:17 ngày 08/10/2026 (giờ Việt Nam).
- [Tải APK sửa lỗi Samsung](https://expo.dev/artifacts/eas/wbY_1Je8BYuaf-vdHFB-M8I55is5uSdke7RoPIPMyXw.apk).
- Local `Test/release-dcb6524.apk`: 114.529.107 byte; SHA-256 `F084EFDA66A753943C028DB316FC6A168A46AEE4879830AD737FB2FDC0487854`. Đã kiểm tra ZIP CRC, 1.698 entry, manifest/classes.dex và các ABI arm64-v8a/armeabi-v7a/x86/x86_64; chưa chạy UI trên điện thoại.
- Điểm rollback API trước: `dpl_pkxkgnfd37piBSPEairecse3Bgs8` (`5107b97`). Nếu rollback về API này, APK mới sẽ chặn mở bài vì thiếu `test.ownerId`; phải xử lý tương thích trước khi tiếp tục QA.

## Cách thử lại

Cài đè APK mới, giữ dữ liệu hiện có để kiểm tra chuyển bản nháp cũ. Không gỡ app/xóa dữ liệu trước bước này. Metro tắt. Ghi model Samsung S23 FE / Android 16 / One UI 8.5, ngày giờ, Wi-Fi/4G và link build đang thử.

| Mã | Thao tác | Điều kiện đạt | Kết quả thiết bị |
| --- | --- | --- | --- |
| R-01 | Mở trang chủ sau cập nhật; kiểm tra nháp cũ còn trên máy | Có “Bài đang luyện”; đúng bài và tài khoản; việc khôi phục từ bản cũ cần có mạng | Chờ thử APK mới |
| R-02 | Tạo bài, chọn đáp án và chuyển câu; đóng hẳn/mở app; bấm tiếp tục | Đúng đáp án, vị trí, thời điểm bắt đầu; không tạo mã lần nộp mới | Chờ thử APK mới |
| R-03 | Nộp bài; trở về trang luyện và tạo bài thứ hai ngay | Nút không quay mãi; bài mới mở được; lịch sử lần nộp trước chỉ một attempt | Chờ thử APK mới |
| R-04 | Hỏi Coach câu so sánh có danh sách/bảng, ví dụ hai thì | Nội dung dễ đọc; không còn tiêu đề #, ** hoặc bảng Markdown thô | Chờ thử APK mới |
| R-05 | Đăng xuất và chuyển user khác, rồi quay lại user ban đầu | User khác không thấy nháp; user ban đầu vẫn tiếp tục được nháp của mình | Chờ thử APK mới |
| R-06 | Import bộ PDF/audio gốc, chọn Part 3/4/7 rồi luyện qua Wi-Fi/4G | Audio phát/nghe lại được, email/passage đủ, lỗi mạng có cách thử lại | Chờ thử APK mới |

## Bộ nội dung thử

- Gói local: `Test/original-qa-content.zip`; trong đó có hướng dẫn tiếng Việt, PDF 3 trang/10 câu, WAV 55 giây và hình sơ đồ văn phòng gốc.
- PDF được kiểm tra đủ 10 câu và render xem cả 3 trang; WAV mono PCM 22.050 Hz, có tín hiệu âm thanh. Chưa nghiệm thu phát trên thiết bị.
- Import cả 3 trang để có answer key: C A B D B C A D B C; phải duyệt lại trước khi nhập riêng. Audio là giọng tổng hợp offline, không dùng để đánh giá chất lượng đề thi thật.
- Bộ này chưa được seed/import vào DB thật tự động. Luồng PDF hiện không tự chuyển hình trong PDF thành image asset; cần nghiệm thu ảnh riêng, không đánh dấu A-05 hoàn tất chỉ nhờ có PDF chứa hình.
- Có thể tái tạo bản PDF/PNG/script audio bằng `python scripts/create-functional-qa.py` (reportlab, Pillow, pypdf), rồi chạy `powershell -File scripts/create-qa-audio.ps1` trên Windows có Microsoft Zira. Không gọi provider hoặc DB.

Các cổng readiness có secret, CI/branch protection, cảnh báo/ngân sách, backup offsite/R2 và beta vẫn còn; xem `IMPLEMENTATION_STATUS_2026-10-08.md`.
