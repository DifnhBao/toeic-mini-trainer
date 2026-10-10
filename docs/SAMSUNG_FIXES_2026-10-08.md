# Sửa lỗi từ nghiệm thu Samsung S23 FE

Thiết bị do chủ dự án báo: Android 16 / One UI 8.5. Giữ nguyên các kết quả người thử đã điền trong `ANDROID_ACCEPTANCE_2026-10-08.md`.

| Phản hồi | Thay đổi | Kiểm chứng còn cần trên APK mới |
| --- | --- | --- |
| A-03: mở lại app không tìm thấy bài đang luyện | Thêm mục “Bài đang luyện” ở trang chủ và trang luyện; lưu đáp án/vị trí/thời điểm bắt đầu/UUID lần nộp, theo tài khoản và API; lưu ngay khi chọn/chuyển câu, báo lỗi lưu trữ | Trả lời vài câu, đóng hẳn/mở app, tiếp tục đúng bài/vị trí/đáp án/thời gian; thử đổi tài khoản |
| Bản cũ có nháp nhưng không có mục mở lại | Khôi phục tối đa 20 key nháp cũ; API phải xác nhận chủ bài đúng user hiện tại trước khi chuyển. Không ghi đè nháp mới; chỉ xóa key cũ sau lưu thành công | Cập nhật APK trực tiếp, không gỡ app/xóa dữ liệu; bản nháp cũ còn trên máy được tìm lại khi có mạng |
| A-04: nút tạo bài quay mãi sau nộp | Trả trạng thái tạo về bình thường trong `finally`, cả khi tạo thành công; submit dùng guard đồng bộ và không coi lỗi xóa nháp là nộp thất bại | Nộp bài, trở về luyện và tạo bài thứ hai ngay; kiểm tra lịch sử không trùng |
| A-08: hiện ký hiệu Markdown, bảng khó đọc | Chuyển tiêu đề/in đậm/danh sách/bảng thành văn bản dễ đọc; bảng thành đoạn có nhãn cột; giữ nguyên nội dung gửi làm ngữ cảnh AI. Prompt yêu cầu văn bản thường | Hỏi so sánh thì, ngữ pháp, từ vựng; không thấy ký hiệu định dạng hoặc bảng thô |
| A-05: chưa có ảnh/audio/passage | Chưa đủ dữ liệu để xác minh | Cần bộ nội dung có quyền sử dụng; không đánh dấu đạt |

Unit test kiểm tra khởi động lại store, tách account/API, ghi nhanh/xóa/late save, nhiều bài, dữ liệu sai/corrupt, storage đầy, chuyển nháp cũ có kiểm tra quyền và không ghi đè; formatter kiểm tra bảng, tiêu đề, emphasis, đoạn thường và code. Các kiểm thử không thay thế việc chạy UI trên Samsung.

API mới trả `test.ownerId` của chính tài khoản đã xác thực để ràng buộc phản hồi khi đổi phiên. Phải deploy API trước APK; nếu rollback về API không có trường này, APK mới chặn mở bài và yêu cầu cập nhật, tránh nhận nháp nhầm tài khoản.

Nháp ở AsyncStorage trên thiết bị, không đồng bộ cloud và không chứa token. Gỡ app/xóa dữ liệu sẽ mất nháp. Chưa cam kết lưu được thao tác cuối nếu hệ điều hành dừng tiến trình trước khi ghi hoàn tất. Lỗi lưu có thông báo thay vì khẳng định đã lưu.
