# Phân tích kết quả và đề xuất luyện tập cá nhân

Yêu cầu của chủ dự án ngày 09/10/2026: người học biết nên tập trung cải thiện phần nào từ kết quả đã làm. Ưu tiên miễn phí; tự chia audio tạm gác. Không thay cách chấm điểm hoặc suy ra điểm TOEIC từ mini test.

## Giai đoạn 1 — Đánh giá có bằng chứng

- Dùng bài đã nộp của đúng tài khoản trong 30 ngày gần nhất; đọc tối đa 100 bài, tối đa 50 đáp án mỗi bài. Nếu vượt phạm vi thì hiển thị rõ phân tích chỉ bao phủ một phần dữ liệu.
- Mỗi câu hỏi chỉ dùng lần trả lời mới nhất trong mỗi khoảng phân tích, để luyện lại một câu nhiều lần không tự trở thành nhiều bằng chứng độc lập. Vẫn báo số lượt làm và số câu khác nhau.
- Tách đúng/sai/bỏ trống theo Part 1–7. Chưa làm thì không hiển thị 0% như kết quả yếu. Dưới 20 câu khác nhau mỗi Part: gợi ý thu thập thêm dữ liệu, không kết luận là điểm yếu chắc chắn.
- Khi có ít nhất 20 câu: tỷ lệ đúng dưới 70% là ưu tiên luyện, từ 70 đến dưới 80% tiếp tục củng cố, từ 80% là phần đang làm tốt trong mẫu bài này. Đây là ngưỡng sản phẩm, không phải chuẩn đo trình độ.
- Xu hướng so hai nửa của khoảng 30 ngày theo từng Part; cần ít nhất 10 câu khác nhau ở mỗi nửa. Không so điểm tổng của những bài khác cấu trúc để kết luận tiến bộ. Báo mức trùng câu giữa hai nửa và giới hạn độ khó không được chuẩn hóa.
- Kỹ năng chỉ tổng hợp từ SkillTag đã gắn trên câu trong kho. Không tự suy ra “yếu thì”, “yếu từ vựng” khi câu chưa có nhãn; báo độ phủ nhãn.
- Đếm kho câu hỏi theo đúng quyền/publication của người học; đánh giá vẫn hiện Part yếu nhưng chỉ gợi ý bắt đầu Part có nội dung được dùng. Không trả ID, nội dung đề hoặc đáp án trong response phân tích.

Nghiệm thu: dữ liệu ít, chưa có dữ liệu, sai/bỏ trống, luyện lặp, lịch sử quá cũ, xu hướng, nhãn thiếu/đa nhãn, phạm vi bị giới hạn, thứ tự ưu tiên và cách ly hai tài khoản đều có kiểm thử.

## Giai đoạn 2 — Biến đánh giá thành buổi luyện

- Trang “Phân tích học tập” trên web và Android, mở từ Hôm nay và kết quả bài đã nộp.
- Mỗi đề xuất có lý do bằng số câu/tỷ lệ, cách luyện và nút bắt đầu bài đúng Part/số câu. Chỉ tạo bài khi người học bấm nút, không tự tạo khi mở trang, không tự nộp hoặc gọi AI. Khi luyện từ đề xuất, ưu tiên câu chưa làm của đúng tài khoản; nếu kho không đủ thì dùng câu đã luyện, không hứa toàn bộ là câu mới.
- Tối đa ba ưu tiên: Part cần cải thiện, Part ít dữ liệu cần khảo sát, phần cần duy trì. Có gợi ý xử lý bỏ trống khi đủ bằng chứng, không gán nguyên nhân “thiếu thời gian” từ thời lượng toàn bài.
- Cập nhật khi mở lại trang sau nộp; không giữ dữ liệu phân tích ở cache chung hoặc storage local. Lỗi tải có thử lại; đổi tài khoản không thấy kết quả của người trước.

Nghiệm thu: API private/no-store, web build và Android bundle/typecheck đạt; chỉ tạo bài khi bấm nút, ưu tiên câu chưa làm không mở quyền xem kho riêng người khác; thử với API mới và APK tương ứng trước nghiệm thu điện thoại.

## Giai đoạn 3 — Kiểm chứng với người học và cải tiến

1. Chủ dự án nghiệm thu trên Samsung S23 FE: làm/nộp hai Part, mở phân tích, kiểm số câu/đề xuất, đổi tài khoản và mất mạng/thử lại.
2. Chuẩn hóa nhãn kỹ năng trong kho, rà soát độ khó/phạm vi nội dung; chỉ sau đó mở rộng đề xuất tới kỹ năng cụ thể hoặc chọn câu theo nhãn.
3. Theo dõi 2 tuần: người học có hiểu lý do đề xuất, có luyện Part được đề nghị, tỷ lệ bỏ trống và kết quả trên câu mới thay đổi thế nào. Không dùng lượt làm lại cùng câu để khẳng định hiệu quả học tập.
4. Sau khi có dữ liệu kiểm chứng mới xem xét lịch ôn câu sai/spaced repetition và mục tiêu cá nhân. AI diễn giải là tùy chọn sau, phải có ngân sách/quyền rõ ràng; bản đầu không cần model hoặc dịch vụ trả phí.

## Phát hành

Không cần migration hoặc ghi thêm dữ liệu cá nhân. Không đưa nội dung đề/đáp án/token vào response phân tích. Mã và kiểm thử trước, CI đúng SHA tiếp theo; web/API mới và APK có giao diện mới phải được triển khai đồng bộ có kiểm soát. Không coi mã local/bundle xanh là tính năng đã có trên APK đang cài.

## Trạng thái phát triển

Ngày 09/10: giai đoạn 1–2 đã có mã triển khai và kiểm thử ban đầu; đang chạy bộ kiểm tra phát hành. API `GET /api/v1/progress/insights`, web `/progress`, Android `/insights`. Link mở từ trang chủ và màn kết quả. Request tạo bài hỗ trợ `preferUnseen` tùy chọn, mặc định giữ chọn ngẫu nhiên như trước; chỉ nút luyện từ phân tích gửi tùy chọn này.

Các nhãn kỹ năng/Part dùng thông tin hiện tại trong kho, không có snapshot độ khó/nhãn tại thời điểm làm. Tỷ lệ hiển thị được làm tròn một chữ số thập phân; phân loại ngưỡng dùng tỷ lệ gốc. Không gọi AI/provider, không gửi lịch sử học ra dịch vụ phân tích bên ngoài. Chưa triển khai production hoặc tạo APK mới cho giao diện này khi chủ dự án đang đi vắng.
