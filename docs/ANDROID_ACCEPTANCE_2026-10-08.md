# Biên bản nghiệm thu Android

## Phiên bản cần thử

- API: `https://toeic-mini-trainer.vercel.app`, deployment `dpl_pkxkgnfd37piBSPEairecse3Bgs8`, source `5107b97`.
- APK: EAS build `d2e40383-bd61-407d-9ad5-2081468f4165`, source `5107b97`; đã FINISHED lúc 11:28:48 ngày 08/10/2026 (giờ Việt Nam).
- [Tải APK preview mới](https://expo.dev/artifacts/eas/NKPUbumhVf4OlvVD_Tg25msKN4tJIpOr3G-O7N4TIyc.apk).
- SHA-256: `8363EDB6E48C2CA09D94AE21ECA8D5C12F129E3598AF3D491E221B4DAFB823FB`; dung lượng 114.508.403 byte. Bản local tại `Test/release-5107b97.apk` đã kiểm tra manifest, classes.dex và thư viện arm64-v8a.
- Package: `com.toeicminitrainer.app`; signing sẵn có; bản preview nội bộ, không phát hành store.
- Không dùng APK nền `24b9d6e` để xác nhận đã có bản vá Expo mới.

## Thông tin người thử điền

- Ngày/giờ:
- Model điện thoại, phiên bản Android: Samsung S23 FE, Android 16 / One UI 8.5 (chủ dự án cung cấp).
- Wi-Fi/4G và loại mạng lúc phát sinh lỗi:
- Đã cài APK mới, Metro/dev server tắt: chưa xác minh.

Không ghi email đầy đủ, token, secret, signed URL hoặc nội dung tài liệu riêng tư trong biên bản. Khi có lỗi chỉ cần bước thao tác, thông báo lỗi, thời điểm và mã job/attempt nếu có.

## Thứ tự kiểm tra

| Mã | Thao tác | Điều kiện đạt | Kết quả |
| --- | --- | --- | --- |
| A-01 | Cài APK; mở ứng dụng khi máy tính không chạy Metro | App khởi động và hiển thị màn hình đăng nhập | Chờ thử thiết bị |
| A-02 | Đăng nhập Google bằng provider đã dùng; đóng hẳn rồi mở app | Đúng tài khoản, giữ phiên; hủy Google Login không làm crash | Chờ thử thiết bị |
| A-03 | Tạo mini test từ câu đã có, trả lời vài câu; đóng/mở app | Bản nháp phục hồi đúng đáp án, vị trí và thời gian | Chờ thử thiết bị |
| A-04 | Nộp bài; khi phản hồi chậm thử lại cùng lần nộp | Điểm đúng, lịch sử chỉ có một attempt, xem lại câu sai được | Chờ thử thiết bị |
| A-05 | Thử bài có ảnh/audio/passage nếu kho có dữ liệu; chuyển Wi-Fi ↔ 4G | Media hợp lệ phát/hiển thị được; lỗi mạng có cách thử lại, không mất bài | Chờ thử thiết bị |
| A-06 | Tải PDF có quyền sử dụng; chọn khoảng trang; duyệt, sửa, bỏ câu, import riêng | Chỉ nhập câu đã duyệt; đóng/mở app tìm lại đúng job/nháp; không lặp câu | Chờ thử thiết bị |
| A-07 | Thử đóng góp, kiểm tra trạng thái; đăng xuất rồi đổi tài khoản | Nội dung đã sửa được giữ; không lẫn tài liệu, bài hoặc bản nháp giữa tài khoản | Chờ thử thiết bị |
| A-08 | Thử giải thích AI và Coach với câu hỏi ngắn | Trả kết quả hoặc lỗi/quota rõ ràng; không gọi lặp khi retry ngoài dự kiến | Chờ thử thiết bị |

Sau vòng kiểm tra nhanh này, thực hiện đủ MR-01…MR-14 và QA-A…QA-E trong `MOBILE_QUESTION_REVIEW.md`, gồm mất mạng, file lỗi, storage đầy và API cũ. Cần ít nhất hai thiết bị trước khi chốt E2E-02/E2E-05; một điện thoại đạt chỉ là bằng chứng cho thiết bị đó.

## Điều kiện dừng mở thêm người thử

Không tiếp tục mở beta nếu mất/lộ dữ liệu, không đăng nhập được, không thể nộp bài hoặc tạo attempt/import trùng. Ghi lại lỗi để sửa; không tự upload/AI lại hàng loạt. Chưa đánh dấu nghiệm thu đạt dựa vào build hoặc smoke API.

Readiness có xác thực, R2 backup, cảnh báo/ngân sách, nội dung có quyền dùng và beta 10–20 người vẫn là các cổng riêng trong `RELEASE_RUNBOOK.md`.
