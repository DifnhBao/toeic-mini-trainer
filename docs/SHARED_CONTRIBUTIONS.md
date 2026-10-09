# Phân quyền, đóng góp chung và lời giải AI — bản triển khai staging

## Quyền và dữ liệu

| Khả năng | Khách | USER | REVIEWER | ADMIN |
| --- | --- | --- | --- | --- |
| Làm bài từ câu đã xuất bản | Có, không lưu lịch sử, tối đa 3 bài/ngày | Có, lưu lịch sử | Có | Có |
| Dùng kho câu cũ chưa duyệt (`LEGACY`) | Không | Có | Có | Có |
| Nhập PDF/audio mới | Không | Không | Không | Có |
| Gửi bộ câu hỏi vào hàng chờ | Không | Không | Không | Có, phải xác nhận quyền chia sẻ |
| Xem PDF nguồn và duyệt/từ chối bộ đóng góp | Không | Không | Có | Có |
| Quản lý vai trò/trạng thái tài khoản và xuất bản câu cũ | Không | Không | Không | Có |
| Chatbot cá nhân, giải thích câu sai | Không | Có | Có | Có |

`SUSPENDED` không được dùng API yêu cầu đăng nhập; phiên mobile bị thu hồi khi khóa. Bài khách chỉ dùng câu `PUBLISHED` và không tạo `TestAttempt`/`UserAnswer`. Bảng `guest_usage` chỉ giữ bộ đếm giới hạn; không giữ câu, đáp án hay điểm. Lịch sử chatbot không lưu trong database; ứng dụng gửi ngữ cảnh của phiên hiện tại. PDF nguồn không công khai: reviewer nhận URL đọc 5 phút sau khi API kiểm tra quyền và ghi audit.

Lời giải sai được tạo một lần dưới dạng phân tích cho mọi lựa chọn của một câu và lưu theo `questionId + contentRevision + locale + promptVersion`. Người dùng khác đọc cache mà không gọi Gemini. Admin có API ẩn lời giải sai của câu đã xuất bản (`POST /api/v1/admin/questions/{id}/explanation/hide`, kèm `reason`); cache `HIDDEN` không được trả cho ai. Bài khách chỉ nhận lời giải đã có sẵn, không kích hoạt AI. Giới hạn tạo lời giải và coach hiện là 20 lần/người/ngày mỗi loại. Nhập PDF dùng tối đa 3 lần/người/ngày, riêng admin 10 lần/ngày, với bộ đếm bền vững trong DB để tránh phát sinh nhiều lượt gọi model ngoài ý muốn trên Vercel.

## Trình tự phát hành staging — chưa tự động thực hiện

1. Duyệt diff và ba migration mới `20260928120000_add_content_contributions`, `20260928130000_add_roles_and_publication_status`, `20260928140000_allow_system_owned_shared_assets`. Không sửa migration đã áp dụng. Chụp nhánh backup Neon, kiểm tra `npx prisma migrate status`, rồi `npx prisma migrate deploy` trên staging từ môi trường tin cậy. Tuyệt đối không chạy seed demo lên Neon thật.
2. Tạo secret server-only ngẫu nhiên tối thiểu 32 ký tự `GUEST_TEST_SECRET` trong Vercel Production. Không đặt trong `EXPO_PUBLIC_`, không commit hoặc gửi secret qua chat. Code mới cần schema và secret này trước khi bật bài khách.
3. Sau migration, xác định UUID của tài khoản admin đầu tiên từ database. Chạy script `npx tsx prisma/bootstrap-admin.ts` **một lần** với `BOOTSTRAP_ADMIN_USER_ID`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_CONFIRM=GRANT_FIRST_ADMIN` đặt cục bộ; script từ chối nếu đã có admin. Không in URL database hay secret. Xóa các biến bootstrap sau khi xong. Có thể dùng API admin để cấp `REVIEWER` cho tài khoản khác, kèm lý do.
4. Deploy Vercel staging và build lại APK preview. Đảm bảo `EXPO_PUBLIC_API_URL` trỏ về staging HTTPS. Đăng nhập bằng admin/reviewer để mở hàng chờ trên màn Kho tài liệu. Admin đăng PDF chính qua cùng luồng nhập → gửi duyệt → tự duyệt; reviewer khác không được tự duyệt đóng góp của mình. Quyền nằm trong database, không còn dùng `CONTENT_REVIEWER_USER_IDS`.
5. Admin rà từng PDF nguồn, audio, câu và đáp án trước khi duyệt. Đóng góp `PENDING`/`REJECTED` không xuất hiện trong bài chung. Tài khoản thường gọi API duyệt phải nhận 403. Sau duyệt, tài khoản khác tạo bài mới thấy câu đã xuất bản. Kiểm tra guest làm/nộp bài, không phát sinh lịch sử; đăng nhập và thử lời giải hai tài khoản để xác nhận lần sau dùng cache.

Không chạy migration, bootstrap, deploy hay thử nghiệm có chi phí trên production trong bước phát triển cục bộ. Các bước trên cần người vận hành xác nhận backup và môi trường đích.

## Giới hạn cần xử lý trước khi mở cho người dùng thật

- Duyệt xuất bản vẫn theo **cả bộ đề**. Web đã cho sửa/duyệt/loại từng câu trước khi gửi. Bản mã nguồn ngày 09/10 bổ sung ADMIN chủ sở hữu sửa nội dung/đáp án và gửi lại bộ bị từ chối, dùng lại media và không chạy AI lại; 203 unit/46 integration đạt, chưa deploy hoặc nghiệm thu UI tương tác. Xem [CONTRIBUTION_RESUBMISSION_2026-10-09.md](CONTRIBUTION_RESUBMISSION_2026-10-09.md). Thay media trong bản gửi lại, editor câu đã xuất bản và xử lý hàng loạt còn mở. Câu `LEGACY` phải được xem xét thủ công trước khi xuất bản.
- Audio đóng góp được sao chép sang object key `shared/audio/...` và asset không thuộc tài khoản người gửi khi duyệt. Cần kiểm thử copy/đọc R2 thật và thiết kế quy trình xóa/thu hồi bản sao nếu admin gỡ nội dung; lỗi giữa thao tác copy R2 và transaction DB vẫn có thể để lại object mồ côi cần dọn.
- Câu chung cũ được gắn `LEGACY`, không tự xuất bản cho khách. Admin chỉ có thể xuất bản từng câu qua API sau khi kiểm tra; câu có media legacy chưa an toàn bị chặn. Chưa có công cụ rà hàng loạt.
- Nếu sau này cho phép sửa nội dung/đáp án của một câu đã xuất bản, thao tác sửa phải tăng `contentRevision` và rà lại trạng thái xuất bản; nếu không cache lời giải cũ có thể trở nên sai. Hiện chưa có API sửa câu chung.
- Giới hạn khách dựa trên IP/HMAC và bộ đếm DB; cần kiểm thử IP thực qua proxy Vercel và bổ sung chống lạm dụng trước khi mở rộng. Các dòng usage hết hạn được worker nội bộ xóa trong lần cron kế tiếp. API khách cố tình không gọi Gemini nên không tạo chi phí model từ truy cập ẩn danh.
- Chưa có kiểm thử tích hợp Neon/R2 staging hoặc kiểm thử APK với nhiều tài khoản. Không xem bản này là sẵn sàng phát hành rộng.
