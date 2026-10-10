# Quyền ghi cache và ẩn lời giải — 09/10/2026

## Hai lỗi đã sửa

Trước đây, tác vụ tạo lời giải hoàn tất/lỗi chỉ so `id + GENERATING`. Khi một lượt hết hạn được nhận lại, tác vụ cũ có thể ghi đè kết quả hoặc đổi lượt mới thành `FAILED`. Việc lưu cache `READY` và bản sao lời giải cá nhân cũng diễn ra ở hai thao tác riêng.

API ẩn lời giải chỉ đổi cache chung thành `HIDDEN`, nhưng lịch sử web/Android vẫn trả trực tiếp bản sao `AiExplanation` đã lưu trước đó. Một lượt đọc cache READY cũ còn có thể lưu bản sao mới sau khi quản trị viên ẩn cache.

## Hành vi hiện tại trong mã nguồn

- Mỗi claim dùng `id + GENERATING + startedAt + updatedAt`; nhận lại lượt hết hạn tạo timestamp tăng đơn điệu. Lưu kết quả và xử lý lỗi đều so đúng claim. Lượt cũ mất quyền ghi nhận 409 khi hoàn tất; lỗi provider vẫn trả 503 nhưng không tác động lượt mới.
- Chuyển cache sang READY và upsert bản sao cá nhân nằm trong cùng transaction. Nếu bản sao không lưu được, READY rollback; lượt đó chỉ đổi FAILED khi còn đúng claim. Không giữ khóa DB trong lúc chờ provider.
- Cache READY được khóa và kiểm tra lại trạng thái/phiên bản trước khi lưu bản sao trong transaction. Nếu quản trị viên đã ẩn/thay cache, trả 409 thay vì trả lời giải từ snapshot cũ.
- Ẩn lời giải tạo/đổi HIDDEN, xóa các bản sao cá nhân của câu và ghi audit trong cùng transaction. Không xóa câu, bài làm, đáp án đã chọn hoặc điểm.
- Đọc lịch sử Android và server page web đều kiểm tra HIDDEN theo revision/ngôn ngữ/prompt hiện hành, kể cả bản sao sót từ deployment cũ. Metadata cache nội bộ không đưa vào response Android. Guest tiếp tục chỉ dùng READY đúng revision; không gọi AI để tạo lời giải.
- Web đổi key khung lời giải khi server trả trạng thái HIDDEN sau refresh, bỏ state cũ của khung đang mở. Đây chưa phải cơ chế push thu hồi nội dung; tương tác React/trình duyệt thật vẫn chưa nghiệm thu do quyền truy cập bị chặn.
- Giữ nguyên quota, giới hạn provider, cooldown hai phút cho GENERATING và một phút cho FAILED, response shape và xác thực/quyền sở hữu. Không thêm migration, secret hoặc dependency. Không cần APK mới cho thay đổi server này.

## Kiểm chứng

Chín kiểm thử PostgreSQL mới dùng handler API thực, SQL thực và SDK Gemini với `fetch` thay bằng phản hồi fixture; mọi đường gọi mạng provider đều bị chặn, không gửi dữ liệu hoặc phát sinh chi phí AI. Hai kiểm thử policy xác nhận HIDDEN chỉ áp dụng đúng revision.

Các tình huống mới: 11 request chồng nhau chỉ một lượt tạo; người học khác dùng cache mà không tiêu quota provider; chặn đọc câu trả lời người khác/câu đã đúng; lượt cũ thành công hoặc lỗi sau khi có claim thay thế; quản trị viên ẩn khi đang tạo; ẩn giữa đọc READY và lưu bản sao; lịch sử/guest không lộ bản sao ẩn cũ; quota từ chối không gọi provider; rollback READY khi câu trả lời biến mất trước khi lưu bản sao.

Một lượt đầu vướng cách mock delegate Prisma trong test, đã thay bằng query extension để điều khiển ranh giới tranh chấp mà giữ SQL thực. Lượt targeted hoàn chỉnh sau sửa đạt 9/9, không bỏ qua. Logs cục bộ: `Test/integration-explanation-targeted.txt`, `Test/unit-explanation-fencing.txt`, `Test/typecheck-explanation-fencing.txt`, `Test/lint-explanation-fencing.txt`, `Test/integration-explanation-fencing.txt`, `Test/build-explanation-fencing.txt`.

| Kiểm tra | Kết quả |
| --- | --- |
| Unit/regression | 209/209 đạt, không bỏ qua |
| PostgreSQL integration | 61/61 đạt, mười suite, không bỏ qua; 128,338 giây |
| TypeScript | Đạt |
| Lint | 0 lỗi, ba cảnh báo img đã có |
| Production build | Webpack Next.js 16.3.8 đạt, 41/41 trang tĩnh và build trace hoàn tất; kiểm tra lại TypeScript/lint trang kết quả sau khi thêm key reset cũng đạt |
| Schema | Không thêm migration; dùng 11 migration hiện có trên PostgreSQL 16, DB `toeic_release_test`, chỉ bind `127.0.0.1:55433` |

Đối chiếu sau cleanup: users, questions, mini tests, attempts, bản sao cá nhân và cache lời giải đều còn 0 trên fixture, log `Test/explanation-fixture-cleanup.txt`; container test đã dừng. Không tác động DB thật hoặc container dự án khác.

## Rollout, rollback và giới hạn

Chưa triển khai; mốc API live được xác minh gần nhất là `ff80432`, chưa kiểm tra lại cloud trong lượt này. Cần xác minh CI từ xa và deployment được phép trước chuyển domain. Khi rollout, dừng tạo AI mới và chờ các request phiên bản cũ kết thúc theo giới hạn runtime trước bật lại; writer cũ chưa có điều kiện claim này và không được coi là an toàn khi chạy xen với writer mới. Không dùng việc chỉ đợi theo đồng hồ làm bằng chứng request cũ đã dừng; cần đối chiếu deployment/request đang chạy. Hướng dẫn này chưa được thực hiện trên cloud.

Rollback về API trước bản này làm mất bảo vệ claim và lọc lời giải ẩn trong lịch sử. `AI_ENABLED=false` chỉ dừng tạo mới, không ngăn server cũ trả bản sao đã lưu. Trước rollback cần đánh giá trạng thái cache/các bản sao và tránh mở lại đường đọc lời giải sai.

Các phản hồi đã gửi và lời giải đang mở/offline trên thiết bị không bị thu hồi từ xa. Đọc mới sau khi thao tác ẩn đã commit mới thuộc bảo đảm lọc server; request đồng thời trước đó có thể đã nhận snapshot. UI tương tác/thiết bị, provider thật, chi phí/cảnh báo và hành vi trên Vercel chưa nghiệm thu. Editor câu đã xuất bản vẫn phải bảo vệ revision và lịch sử bài làm riêng; bản sửa cache không hoàn thành editor hoặc đóng toàn bộ SAFE-03/CONTENT-03/beta.
