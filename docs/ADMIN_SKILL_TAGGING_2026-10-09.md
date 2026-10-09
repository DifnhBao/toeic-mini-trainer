# Quản trị nhãn kỹ năng cho phân tích học tập

Đầu ra bổ sung cho giai đoạn 3 trong kế hoạch phân tích cá nhân. Chỉ có mã trên nhánh release-readiness; chưa chuyển domain, áp dụng nhãn trên DB thật hoặc thay APK. Hai deployment kiểm tra source `ffe179e` không chứa công cụ này.

## Cách sử dụng sau khi bản mới được phát hành

1. ADMIN mở Kho câu hỏi chung `/admin/questions`, chọn trạng thái và câu cần rà soát.
2. Đối chiếu câu, đáp án, nguồn/đoạn nghe/đoạn đọc, mở “Kỹ năng”. Mỗi nhãn có tiêu chí ngay dưới tên; chỉ chọn kỹ năng thực sự cần để trả lời, tối đa năm nhãn chuẩn cho một câu.
3. Ghi lý do và bấm Lưu nhãn kỹ năng. Thao tác độc lập với Xuất bản/Ẩn; giữ nguyên nội dung, đáp án, media, trạng thái và contentRevision. Không tự gán nhãn hàng loạt hoặc gọi AI.
4. Nhật ký quản trị ghi người thao tác, câu, thời điểm, lý do và danh sách nhãn chuẩn trước/sau. Nhãn cũ ngoài từ điển được hiển thị và giữ nguyên; không tự đổi hoặc xóa nhãn toàn kho.
5. Nếu tab khác đã lưu, trả 409 và yêu cầu tải lại, không ghi đè. Có thể bỏ chọn toàn bộ nhãn chuẩn rồi lưu có lý do; nhãn cũ vẫn giữ.

Giao diện hiện cho câu kho chung LEGACY/PUBLISHED/ARCHIVED, không quản lý câu PRIVATE của người học. Gắn nhãn không xác nhận bản quyền, độ khó hoặc khả năng xuất bản; những cổng đó vẫn riêng. Quy trình rà soát nội dung Reading và Listening vẫn cần người kiểm duyệt.

## Từ điển và quy tắc

Từ điển có 15 nhãn, định nghĩa trong `app/lib/skill-taxonomy.ts`. Các nhóm: mô tả hình Part 1, lời đáp Part 2, chi tiết/ý chính/suy luận nghe Part 3–4; thì/từ loại/hòa hợp chủ vị/từ nối Part 5–6; từ vựng theo ngữ cảnh Part 5–7; ý chính/chi tiết/suy luận/liên kết đọc Part 6–7 và đối chiếu nhiều tài liệu Part 7. Đây là từ vựng sản phẩm, không phải thang đo trình độ TOEIC hoặc bộ phân loại AI.

Ví dụ: câu Part 5 chỉ khác đuôi danh từ/tính từ/trạng từ phù hợp vị trí được rà nhãn từ loại; câu chỉ khác thì động từ theo mốc thời gian được rà nhãn thì. Không gắn mọi nhãn ngữ pháp cho mọi câu. Với Part 7, chỉ gắn đối chiếu tài liệu khi đáp án thực sự cần ít nhất hai tài liệu. Nếu nguồn không đủ bằng chứng, để trống và hoàn thiện nguồn trước.

Nhãn được dùng theo thông tin hiện tại của câu, nên sửa nhãn có thể đổi tổng hợp lịch sử đã làm. Không có snapshot nhãn/độ khó lúc làm. Báo cáo vẫn báo độ phủ, cần đủ mẫu và không tự suy ra điểm yếu từ câu chưa có nhãn. Một câu nhiều nhãn có thể nằm trong nhiều tổng hợp; không cộng các tổng nhãn thành số câu độc lập.

Từ điển chuẩn được sửa qua mã và review, không có UI tạo/đổi/xóa nhãn tùy ý. Nhãn cũ chưa có trong từ điển cần kế hoạch đối chiếu riêng trước chuẩn hóa; chưa có công cụ chuyển nhãn hàng loạt. Gắn nhãn trong bản nháp nhập đề/câu cá nhân và lọc buổi luyện theo nhãn là công việc tiếp theo, không coi là đã có.

## Cổng ghi dữ liệu

POST `/api/v1/admin/questions/:id/skills`: tài khoản ACTIVE/ADMIN, UUID hợp lệ, JSON có giới hạn/strict, tối đa năm key có trong từ điển và phù hợp Part, không trùng; reason 5–500 ký tự. Phiên web cần Origin đúng ứng dụng; bearer được xác thực riêng và không fallback cookie. Body không chấp nhận trường nội dung/publication để biến API nhãn thành API xuất bản.

Transaction khóa row question, so toàn bộ `expectedTagIds` với nhãn hiện có, ghi liên kết chuẩn và audit cùng transaction. Hai editor cùng snapshot chỉ một lượt thay đổi thành công; lượt sau 409. Upsert theo tên duy nhất để nhiều câu dùng chung một nhãn; không đổi mô tả của bản nhãn đã có. Request không đổi nhãn không tạo liên kết hoặc audit lặp. Response no-store, không có câu/đáp án trong response ghi nhãn.

## Kiểm chứng và nghiệm thu còn lại

- Local: ba unit quy tắc từ điển/input/stale-set, TypeScript web và lint sáu file mã/kiểm thử đã đạt.
- Source `28edcef40c108677605d93a394a2b433143bc218`: CI [37949687669](https://github.com/DifnhBao/toeic-mini-trainer/actions/runs/37949687669) completed/success; web/integration/mobile và từng bước đều đã đọc. Log PostgreSQL **84/84 không skip**, gồm cả sáu kịch bản nhãn mới; Linux unit **252/255 đạt, 3 skip, 0 lỗi** (công cụ FFmpeg/ffprobe/DPAPI Windows). Build web compiled 24,3 giây; Android export/audit đạt. Không khẳng định chạy full 255 unit Windows hoặc PostgreSQL local cho source này: máy chỉ còn khoảng 304 MiB RAM trống khi rà môi trường, nên dùng PostgreSQL cách ly của CI cho kiểm tra DB. Commit tài liệu sau source này có CI riêng; không gán kết quả runtime cho HEAD tài liệu khác.
- Sáu kịch bản PostgreSQL được thêm: quyền ADMIN/ACTIVE/câu private, dữ liệu nhãn sai/Part sai/trường xuất bản, thêm-xóa và giữ nhãn cũ/audit/nội dung không đổi, no-op, hai editor tranh chấp, hai câu cùng tạo một nhãn. Fixture chỉ loopback `toeic_release_test`, dọn theo UUID và chỉ nhãn chuẩn không tồn tại trước test/không còn liên kết; không dùng DB thật.
- Nghiệm thu UI bằng tài khoản thật vẫn mở: xem hướng dẫn, bỏ chọn/lưu, tab cũ, đổi tài khoản, lỗi mạng/mã hỗ trợ và báo cáo người học sau khi có nhãn đủ mẫu. Unit/CI không chứng minh màn hình trên production hoặc Android.
- Trước beta, chọn mẫu câu có quyền chia sẻ, hai người rà đối chiếu một phần nhãn và giải quyết khác biệt; ghi độ phủ theo Part. Chưa gắn nhãn dữ liệu thật hoặc khẳng định phân tích kỹ năng đã đủ bằng chứng cho người học.
