# Quản trị nhập đề/audio, người học chọn bài

Quyết định của người dùng ngày 08/10/2026: quản trị viên chuẩn bị nội dung trên web; người học không nhập tài liệu trên điện thoại. R-01…R-05 của APK `dcb6524` đã được người thử ghi đạt; R-06 chưa hoàn tất, cần nghiệm thu lại luồng dưới đây.

## Quản trị viên trên máy tính

1. Đăng nhập đúng tài khoản ADMIN tại `https://toeic-mini-trainer.vercel.app`. Mở **Quản trị → Nhập đề & audio** (`/admin/extract`). Nếu báo chưa có quyền, dùng tài khoản quản trị hiện có; không tự sửa role/secret hoặc chạy seed DB.
2. Chọn PDF có quyền sử dụng, chứa câu hỏi/phương án và đủ thông tin kiểm tra đáp án; tối đa 15 MB. Chọn MP3/M4A/WAV tương ứng, tối đa 100 MB. Với bộ mẫu gốc đã chuẩn bị, dùng `original-functional-qa.pdf` và `original-listening.wav` trong `Test/qa-content`.
3. Chọn tối đa bốn trang liên tiếp rồi bấm **Phân tích trang đã chọn**. Để thử bộ mẫu, bắt đầu trang 1–2 kèm audio. Với đề dài, dùng các đoạn audio khớp trang; hệ thống chưa tự cắt audio hoặc đặt mốc thời gian. Audio gắn vào nhóm có câu Part 1–4, không tự gắn vào câu đọc.
4. Đối chiếu từng câu với nguồn, sửa nội dung/phương án/đáp án/Part, bấm **Duyệt câu này** hoặc **Bỏ qua câu này**. Chỉ câu được duyệt mới được đưa sang bước tiếp theo. Không công khai nếu thiếu audio/ngữ cảnh hoặc đáp án chưa chắc chắn.
5. Xác nhận quyền chia sẻ; bấm **Chuyển … câu sang bước xuất bản** rồi **Mở trang Duyệt nội dung**. Không cần lưu một bản cá nhân trước. Nếu đóng trang, mở lại tài liệu trong **Tiếp tục tài liệu đã xử lý**; kết quả đã gửi được dẫn về hàng chờ, không tạo lần gửi mới.
6. Trên **Duyệt nội dung**, lấy/mở PDF nguồn, lấy/nghe audio, kiểm tra toàn bộ câu và quyền chia sẻ. Xác nhận đã kiểm tra rồi bấm **Duyệt & công khai**. Audio được sao chép và kiểm chứng trong vùng chia sẻ; PDF nguồn giữ riêng tư. Bước này tạo nội dung thật, cần người quản trị thực hiện sau kiểm tra.
7. Mở **Kho bài** (`/library`), tải lại, chọn bài vừa công khai và nghe thử. Mỗi bài là một nhóm câu chung audio/đoạn đọc, không phải toàn bộ PDF. Nhóm trên 50 câu cần chia lại; nhóm thiếu audio, ảnh Part 1 hoặc đoạn đọc Part 6–7 bị chặn tạo bài.

Ảnh trong PDF chưa tự trở thành media của câu hỏi. Luồng duyệt hiện tại không xuất bản image asset; chưa coi nghiệm thu ảnh hoàn tất. Không dùng việc upload PDF thành công để kết luận đã có bài luyện ảnh.

## Người học trên web/Android

Mở **Kho bài → Tải lại kho bài → Luyện bài này**. Ứng dụng tạo một bài riêng cho tài khoản, lấy đầy đủ các câu đang công khai của nhóm; giữ audio/ngữ cảnh. Đáp án không nằm trong dữ liệu danh sách hoặc phản hồi tạo bài. Có **Xem thêm bài** khi danh sách dài.

Không thấy bài: quản trị viên phải hoàn tất **Duyệt & công khai**, không chỉ phân tích PDF hoặc gửi vào hàng chờ. Kho trống có hướng dẫn và lối vào luyện ngẫu nhiên theo Part. Các câu cá nhân và nháp bài luyện đã lưu trước đây không bị xóa.

APK cũ vẫn có thể hiện nút nhập tài liệu, nhưng USER/REVIEWER gọi API tạo upload, xác nhận upload, tạo/retry ingestion hoặc gửi nội dung mới sẽ nhận `403 ADMIN_CONTENT_ONLY`. Quyền được kiểm tra lại ở server; UI không thay thế kiểm tra quyền. ADMIN dùng luồng web; API vẫn kiểm tra role và sở hữu media, không dựa vào tên thiết bị/client.

## Nghiệm thu còn phải ghi

| Mã | Kiểm tra | Tiêu chí |
| --- | --- | --- |
| L-01 | USER và REVIEWER gọi năm API ghi nội dung mới | 403; không upload/gọi AI/tạo job |
| L-02 | ADMIN tải PDF/audio, duyệt và công khai trên web thật | Đúng câu/đáp án/nhóm, nghe được audio; PDF nguồn không công khai |
| L-03 | USER mở Kho bài trên web và APK mới qua Wi-Fi/4G | Thấy bài công khai, luyện/nghe lại/nộp đúng; không cần nhập file |
| L-04 | Thử nhóm riêng tư/chưa duyệt/đã ẩn, media bị thu hồi | Không tạo được bài; không lộ nội dung/đáp án nguồn |
| L-05 | Đóng trang quản trị rồi mở tài liệu gần đây | Tìm lại đúng job; GET không gọi AI mới; không gửi/xuất bản trùng |

Các kiểm thử tự động chỉ chứng minh trên dữ liệu cách ly. Chưa thay thế L-02/L-03/L-05 với tài khoản, R2, provider và thiết bị thật. Không seed/import bộ mẫu vào DB thật bằng script trong đợt triển khai mã.
