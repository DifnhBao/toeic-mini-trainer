# Nghiệm thu APK sửa phiên đăng nhập

Ngày 09/10/2026. Chưa có kết quả trên điện thoại cho bản này; các kết quả R-01…R-05 của APK cũ không tự áp dụng cho APK mới.

- Thiết bị dự kiến: Samsung S23 FE, Android 16, OneUI 8.5.
- Source mobile: `3cbde6358c03c5f5e98a9d5771ce9a810e78be13`.
- EAS build: `88bbd6b1-ca59-4153-9bfd-cf43e06661f4`, FINISHED.
- [Tải APK cập nhật](https://expo.dev/artifacts/eas/HQsh1uAZ9NxH0pay9CNPlroMv8VH3bT3p4cyEX5zt7Q.apk), 114.438.583 byte.
- SHA-256: `97A3A1D0E54C070137B6687DF7A94D03709450957CDA2B84D430880ADC7DE245`.
- API: `https://toeic-mini-trainer.vercel.app`, runtime `ff80432`.
- Package `com.toeicminitrainer.app`, version 1.0.0/code 1, chữ ký v2 hợp lệ và cùng chứng chỉ APK Kho bài cũ. Hash/link build giúp phân biệt các APK cùng số phiên bản.

Cài cập nhật, giữ dữ liệu app cũ; mở độc lập khi Metro tắt. Ghi mạng Wi-Fi/4G và kết quả thực tế vào bảng; không chia sẻ token, email hoặc URL media ký tạm thời. Cần hai tài khoản do người thử kiểm soát cho MS-02/MS-07. Không chỉnh SecureStore hoặc token thật để tái hiện lỗi.

| Mã | Thao tác và điều kiện đạt | Kết quả thiết bị |
| --- | --- | --- |
| MS-01 | Google Login, mở Kho bài/lịch sử, đóng hẳn/mở lại khi có mạng: đúng tài khoản, không logout bất thường | Chưa thử |
| MS-02 | Đang tải lịch sử/Kho bài của A thì logout, đăng nhập B; đóng/mở lại: không thấy dữ liệu A hoặc bị phản hồi A làm mất phiên B | Chưa thử |
| MS-03 | Tắt mạng rồi logout: vào đăng nhập ngay, thấy cảnh báo chưa xác nhận server. Bật mạng, thử logout lại: hết cảnh báo; mở lại không tự vào A | Chưa thử |
| MS-04 | Đóng/mở app khi offline: có thông báo chưa khôi phục được. Bật mạng, thử kết nối lại: đúng tài khoản và tiến độ server | Chưa thử |
| MS-05 | Sau ít nhất 16 phút không dùng app, mở màn hình cần đăng nhập: refresh đúng phiên, không lặp vô hạn hoặc logout bất thường | Chưa thử |
| MS-06 | Bài Listening đã duyệt có key/ảnh/audio: nghe, làm, nộp, xem lịch sử qua Wi-Fi/4G; thử lại mất mạng không tạo lần nộp trùng | Chưa thể thử bộ ETS: còn key/media/xuất bản |
| MS-07 | Mở lịch sử/kết quả A, logout rồi vào B; thử Back/deep link riêng tư khi chưa đăng nhập: không trở lại dữ liệu đã render của A; B không xem kết quả A | Chưa thử |
| MS-08 | Chữ lớn và lỗi kết nối/restore: cuộn tới đầy đủ thông báo, nút thử lại, Google và học thử | Chưa thử |

Ảnh/ghi chú lỗi cần kèm mã MS, thao tác ngay trước lỗi và loại mạng. Không đánh dấu đạt chỉ vì APK cài được. Cần thêm Android thứ hai và đóng các cổng vận hành/nội dung trước beta. Giới hạn access JWT 15 phút, retry thu hồi offline và bằng chứng cục bộ tại [MOBILE_SESSION_CLIENT_2026-10-09.md](MOBILE_SESSION_CLIENT_2026-10-09.md).
