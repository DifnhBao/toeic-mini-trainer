# Kiểm chứng refresh và logout đồng thời

Ngày 08/10/2026. Phần này bổ sung cổng SAFE-01; không thay nghiệm thu Google Login hoặc xử lý phiên trên điện thoại.

## Vấn đề đã tái hiện

Refresh thu hồi token hiện tại và tạo token thay thế trong một transaction. Logout và phát hiện dùng lại token cũ trước đây chỉ chạy UPDATE các hàng đang chưa revoked. Khi UPDATE chờ transaction refresh, token thay thế chưa commit không có trong snapshot ban đầu; sau khi chờ xong, UPDATE có thể bỏ sót token mới. Logout đã trả thành công nhưng vẫn còn một refresh token dùng được. Hai race logout/refresh và reuse/refresh đều tái hiện trên PostgreSQL thật cục bộ trước sửa.

Hành vi snapshot và việc UPDATE kiểm tra lại hàng sau khi chờ được mô tả trong [PostgreSQL Read Committed](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED). Chỉ đặt UPDATE trong transaction mà không tuần tự hóa cùng family chưa đủ loại bỏ cuộc đua này.

## Thay đổi

- Refresh, phát hiện reuse và logout lấy cùng khóa transaction theo family trước khi đọc trạng thái hiện tại và thay đổi token. Dùng `pg_advisory_xact_lock(18888, hashtext(familyId))`, READ COMMITTED, chờ lock tối đa hai giây và transaction tối đa năm giây. Khóa chỉ giữ trong xử lý DB/ký JWT, không gọi OAuth hoặc chờ client. [Khóa advisory theo transaction](https://www.postgresql.org/docs/18/explicit-locking.html#ADVISORY-LOCKS) tự nhả khi commit/rollback; các tác vụ phải cùng tuân thủ khóa.
- Sau khi lấy khóa, đọc lại session và trạng thái ACTIVE của user. Token dùng lại vẫn thu hồi cả family như chính sách trước; không thêm thời gian ân hạn replay. Hash collision chỉ có thể làm hai family chờ nhau; điều kiện dữ liệu vẫn lọc đúng family ID.
- Ký access token trước khi đổi refresh token trong transaction. Thiếu cấu hình ký hoặc INSERT token thay thế thất bại phải để token cũ còn dùng được sau rollback.
- Logout giữ phản hồi 200 giống nhau cho token hợp lệ, đã logout hoặc không tồn tại. Lỗi DB/lock trả 503 `AUTH_UNAVAILABLE`, không trả thành công khi chưa xác nhận thu hồi và không đưa chi tiết lỗi DB ra API.

Không thêm migration, đổi TTL hoặc định dạng token/API thành công. Hai hàm server nhận dependency DB tùy chọn để kiểm thử trên kết nối độc lập; runtime vẫn dùng Prisma hiện có.

## Kiểm thử

`tests/integration/mobile-session.test.ts` dùng hai Prisma/pool độc lập trên `toeic_release_test` loopback. Query extension giữ transaction refresh ngay sau INSERT thật; bắt đầu logout/reuse ở kết nối khác, quan sát nó thực sự chờ lock bằng `pg_stat_activity`, rồi cho transaction đầu commit. Không dùng thời gian ngủ để đoán cuộc đua đã xảy ra, không gọi Google/Apple hoặc cloud.

Chín kiểm thử:

1. Logout thu hồi cả token thay thế vừa commit trong lúc chờ.
2. Reuse token cũ thu hồi cả token mới đang được tạo.
3. 20 refresh đồng thời chỉ một lượt xoay vòng thành công; reuse thu hồi family, token thay thế không refresh được nữa.
4. Logout lặp/không có token không làm hỏng family của thiết bị khác.
5. Sai device hoặc token hết hạn không xoay vòng.
6. Lỗi cấu hình ký JWT giữ token cũ và không tạo hàng thay thế.
7. Lỗi lưu token mới rollback việc thu hồi token cũ và nhả khóa.
8. Handler logout trả 503 khi query xác minh bị lỗi giả lập, không lộ chi tiết lỗi.
9. Handler logout trả cùng response cho token thật, lặp và không tồn tại; token thật đã bị thu hồi.

Hai handler test tạm dùng limiter memory để kiểm tra riêng contract; không thay limiter runtime. Giới hạn dùng chung PostgreSQL đã có các kiểm thử riêng. Toàn bộ fixture user/session được xóa theo UUID, không truncate/reset hoặc dùng DB thật. Log nằm trong `Test/`, không đưa token hoặc metadata cloud lên Git.

Lượt đầy đủ đạt 156/156 unit và 44/44 integration, TypeScript đạt; lint 0 lỗi/ba cảnh báo `<img>` cũ. TypeScript lượt đầu phát hiện khai báo stub test chưa phù hợp kiểu PrismaPromise; đã thay stub lỗi bằng hàm ném lỗi đồng bộ và chạy lại đạt. Kiểm tra độc lập còn 0 user fixture `session-race`; quan hệ session cascade theo user, container test đã dừng. Log trước/sau race và các kiểm tra đầy đủ mang tên `Test/*session-family*`/`Test/session-race-*.txt`.

Source bản sửa server: `ff80432`; production build Next.js 16.3.8 Webpack/41 trang đạt. Manifest Vercel 149 tệp, đủ 125 tệp app/types/prisma; không có env, tài liệu ETS, test, backup, APK hoặc mobile. Không thay runtime APK trong bản sửa server này.

## Triển khai

Deployment `dpl_AByFEsgTytEtXqdCk63cXsQFUwA7`, source `ff80432`, READY; URL riêng `https://toeic-mini-trainer-2j1v1ra2v-le-dinh-bao-s-projects.vercel.app`, đã promote sang `https://toeic-mini-trainer.vercel.app`. Inspect domain chính xác nhận đúng deployment ID và READY. 23/23 HTTP smoke đạt trước và sau promote; gồm auth GET trả 405, worker/trạng thái job chưa xác thực trả 401, các trang và guard Kho bài/media cũ. Bundle ADMIN thực tế vẫn có PDF 50 MiB và UI ảnh/audio nhóm.

Không dùng token thật hoặc tạo/thu hồi phiên trên cloud để smoke; các race và contract POST được chứng minh bằng integration local, không phải OAuth/Neon đầu cuối. Không thay secret, migration hoặc seed. Log manifest/deploy/inspect/promote/smoke mang hậu tố `ff80432`; hai báo cáo bundle tại `Test/vercel-session-protected-bundle.json` và `Test/vercel-session-canonical-bundle.json`.

Runtime trước để phục hồi là `f7bb8c2`, deployment `dpl_EHWv17jLwEHm3cvmkpsLJqTKpbfS`, URL `https://toeic-mini-trainer-busrwiq8j-le-dinh-bao-s-projects.vercel.app`. Rollback mở lại cuộc đua thu hồi refresh, áp dụng giới hạn bên dưới.

## Giới hạn còn lại

Việc thu hồi ở đây áp dụng refresh token. Access JWT đã cấp vẫn có thể hợp lệ đến hết 15 phút; request tiếp tục kiểm tra trạng thái ACTIVE của user. Chưa có thu hồi access token ngay lập tức theo từng session. Không dùng báo cáo này để tuyên bố mất máy/token bị lộ đã được xử lý tức thì.

Phản hồi refresh/login đến muộn trong `mobile/src/providers/auth-provider.tsx` còn cần kiểm tra riêng với logout/đổi tài khoản và SecureStore. Bản sửa server không tự ngăn client ghi token cũ trở lại bộ nhớ/thiết bị; APK và nghiệm thu mất mạng/đóng app vẫn là cổng mở. Không nâng trạng thái beta chỉ vì các race DB đạt.

Việc tiếp theo ở mobile: chặn nhận token/response của phiên đã hết hiệu lực; tuần tự hóa ghi/xóa SecureStore; lỗi 401 của tài khoản cũ không được xóa phiên mới; request cũ không retry bằng token của tài khoản vừa chuyển. Cần kiểm thử phản hồi đến muộn, ghi storage chậm/lỗi, restore đồng thời logout/login và nghiệm thu APK mới sau sửa.

Khóa advisory chỉ bảo vệ khi mọi phiên bản worker/API đều dùng quy tắc mới. Khi rollout/rollback có invocation cũ đang chạy, không coi đó là bảo đảm tuần tự tuyệt đối giữa hai phiên bản. Rollback về bản trước mở lại race; ưu tiên sửa tiến tới, không tự thu hồi toàn bộ session thật để nghiệm thu.
