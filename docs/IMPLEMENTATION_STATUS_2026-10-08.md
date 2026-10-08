# Kết quả triển khai ngày 08/10/2026

Đây là kết quả sau đợt thực hiện kế hoạch trong `PROJECT_ASSESSMENT_2026-10-08.md`. Các ước lượng phần trăm trong báo cáo trước là đánh giá tại thời điểm khảo sát, không phải số đo nghiệm thu.

## Phần đã thực hiện

- Khắc phục production build trên Windows bằng Webpack; giữ lệnh Turbopack riêng để kiểm tra sau.
- Hoàn thiện luồng mobile xem/sửa/loại câu trích xuất, lưu bản nháp, tìm lại tác vụ, kiểm tra protocol và chỉ nhập câu đã duyệt. Có bộ tình huống nghiệm thu MR-01…MR-14.
- Web và mobile dùng chung xử lý nộp/chấm bài. Kiểm tra quyền, câu thuộc đề và lựa chọn hợp lệ; retry và nộp đồng thời chỉ tạo một attempt. Web lưu mã lần nộp, đáp án, thời gian và vị trí để phục hồi khi tải lại.
- Chuyển limiter production sang bộ đếm PostgreSQL dùng chung; lỗi lưu counter chặn tác vụ, có Retry-After. Không để user đã xác thực đổi header IP để lấy quota mới.
- Thêm công tắc dừng AI/ingestion và hạn mức gọi provider toàn ứng dụng, tính cả retry của worker; giới hạn output và timeout. Hạn mức lượt gọi chưa thay thế ngân sách tiền trên provider.
- Lấy câu và thống kê Part bằng truy vấn DB, tránh tải toàn bộ ngân hàng/lịch sử vào bộ nhớ API.
- Chặn tự liên kết Google/Apple mới vào tài khoản cũ chỉ vì trùng email.
- Thêm kiểm thử tích hợp PostgreSQL, workflow CI web/mobile/integration, smoke API, thử backup/restore cách ly và log lỗi Next.js có cấu trúc.
- Viết quy trình phát hành, rollback, sự cố, cấu hình và tiêu chí mở beta trong `RELEASE_RUNBOOK.md`.

## Bằng chứng kiểm tra

| Hạng mục | Kết quả đã quan sát |
| --- | --- |
| Unit/regression | 146 kiểm thử đạt; không dùng DB/provider thật; gồm quyền ADMIN, biên giới PDF 50 MiB và 9 kiểm thử backup R2 (DPAPI thật trên Windows) |
| PostgreSQL integration | 24 kiểm thử đạt trên DB loopback `toeic_release_test`, gồm thống kê, kho bài phân trang, tạo bài chỉ từ nhóm công khai và API ảnh/upload/copy/rollback với S3 loopback |
| Schema | 11 migration hiện có áp dụng thành công trên DB test; không thêm migration |
| Kiểu dữ liệu | TypeScript web và mobile đạt |
| Lint | 0 lỗi, 3 cảnh báo `<img>` hiện có |
| Production build | Next.js 16.3.8 Webpack đạt trên Windows ngoài sandbox |
| Android bundle | Expo export Android đạt, 1.320 source; đây chưa phải nghiệm thu APK trên thiết bị |
| Backup/restore | DB Neon thật đã backup DPAPI và restore cách ly, 22 bảng khớp snapshot trong 24,657 giây; R2 thật đã backup mã hóa 16 file/18.948.378 byte và giải mã đối chiếu SHA-256; chưa restore bucket/backup định kỳ/offsite |
| Smoke local | 7 kiểm tra public/không đăng nhập đạt; không xác minh Google OAuth hoặc AI thật |
| Smoke sau promote | 18/18 kiểm tra đạt tại `https://toeic-mini-trainer.vercel.app`, gồm kho bài, API chặn request chưa đăng nhập và trang admin hiển thị từ chối quyền; chưa phải nghiệm thu media/AI thật |
| OAuth preflight | Google provider đã bật; sign-in/callback URL đúng domain chính; chưa xác minh đăng nhập thật |
| API cũ trước rollout | 6/7 smoke đạt; GET ingestion list trả 405 |
| Dependency web production | `npm audit --omit=dev` báo 0 lỗ hổng sau vá dependency |
| Dependency công cụ build | Braces/node-forge chưa có bản vá; ngoại lệ CI hết hạn 22/10/2026, không có trong 1.320 source của bundle APK Kho bài |
| APK preview nền | EAS build `1f35e1b8-3a13-4977-907b-297a541d3b1a` FINISHED từ commit `24b9d6e`; chưa chứa bản vá dependency tiếp theo |
| Vercel | Deployment `dpl_FDgketUQrPGQj62jjd87kvETRNiu`, source `f0bc90f`, READY và đã promote; 18/18 smoke trước/sau promote; bản trước `aea97e2`, hạn chế rollback ảnh pending tại `LISTENING_IMAGES_2026-10-08.md` |
| Payload Vercel | 147 tệp, đủ 123 tệp app/types/prisma; không có env/APK/dữ liệu test; có lệnh kiểm tra source không bị thiếu |
| APK `5107b97` | EAS build `d2e40383-bd61-407d-9ad5-2081468f4165` FINISHED; người thử S23 FE báo A-01/02/06/07 đạt và ba lỗi A-03/04/08 |
| APK sửa Samsung | Build `ee0468f2-ffd3-4d5f-ad45-b9c7c6dc4a27`, source `dcb6524`, FINISHED; người thử ghi R-01…R-05 đạt trên S23 FE; R-06 đang vướng quy trình nhập đề nghe/audio |
| APK Kho bài mới | Build `f66fc9a6-cd3a-4985-9fb4-8664eff8db32`, source mobile `dee15f2`, FINISHED; APK 114.429.599 byte, CRC 1.698 mục/manifest/dex/bốn ABI đạt; chưa có biên bản điện thoại cho bản này |
| Truy cập quản trị | Người dùng xác nhận đăng nhập ADMIN thấy trang nhập đề/audio sau rollout `4242017`; chưa xác nhận upload và xuất bản |
| PDF listening quá 15 MB | Người dùng báo PDF 19,1 MB/MP3 42,2 MB bị chặn. Bản `d02f05d` nâng PDF nguồn lên 50 MiB ở UI/policy/worker; bundle thực trên domain chính xác nhận 52.428.800 byte. Người dùng đã qua upload, phát hiện tiếp lỗi OCR PDF scan (hàng dưới); bốn trang/lượt và 5 MiB OCR giữ nguyên |
| PDF scan có chữ ở bìa | File ETS thật 14 trang: bìa 47 ký tự, các trang sau scan; worker cũ gửi mỗi chữ bìa nên không thấy câu. `aea97e2` sửa theo từng trang, chuẩn bị OCR cả bốn cụm đạt; draft thiếu key phải duyệt bổ sung. Chưa nghiệm thu Gemini thật, ảnh chưa tự tách nhưng `f0bc90f` đã cho gắn và xuất bản ảnh riêng; xem `PDF_SCAN_RELEASE_2026-10-08.md` và `LISTENING_IMAGES_2026-10-08.md` |
| Storage preflight | Cấu hình R2 cục bộ đạt HEAD bucket, OPTIONS 204 với origin domain chính/PUT/Content-Type; không ghi object, không sửa CORS, chưa xác minh upload từ Vercel |
| Backup media R2 | Sau phê duyệt riêng: 16 object, 18.948.378 byte đã mã hóa và kiểm tra lại độc lập đạt; 15 asset READY có object/size khớp. Không ghi cloud; chưa diễn tập restore bucket hoặc snapshot DB/R2 đồng thời |
| Truy vấn tải local | Cùng fixture 20 user/400.000 answer: p95 thống kê cũ/mới 1.218/354 ms khi lặp 20 câu và 1.209/739 ms khi phủ 10.000 câu; chưa phải HTTP/production (`PERFORMANCE_LOCAL_2026-10-08.md`) |

Các lỗi EPERM của sandbox khi build/đọc module đã được kiểm tra lại ngoài sandbox. Một lượt unit test đồng thời build gặp EPERM khi đọc React; phải dùng kết quả của lượt chạy hoàn chỉnh sau đó. Không bỏ qua kiểm thử thất bại để tuyên bố đạt.

Luồng R-06 mới đã triển khai API/web: ADMIN nhập PDF/audio, duyệt và công khai trên web; người học chọn nhóm câu đã công khai trong Kho bài web/Android. Giữ dữ liệu cá nhân cũ, chặn tạo nội dung mới cho USER/REVIEWER tại sáu API server, gồm import JSON cũ. Hướng dẫn và giới hạn tại `ADMIN_LISTENING_WORKFLOW_2026-10-08.md`. Người dùng xác nhận đã truy cập trang ADMIN; chưa nghiệm thu upload/audio thật của luồng này. Truy vấn READ ONLY chỉ đếm được một ADMIN đang ACTIVE trên DB cấu hình; không đọc định danh hoặc thay quyền. AI chỉ đọc PDF, không nghe audio để suy đáp án.

APK mới: [tải bản Kho bài](https://expo.dev/artifacts/eas/BuQ4n2XzKW6tim3MFgJZZvscfO6I_4V-yLGumPGtErk.apk), SHA-256 `702AEF922860D9066FA8CFB085340A38F34B9E2983BE64EACAB19CEDA50D21E4`. API `4242017` bổ sung guard JSON cũ; API `d02f05d` sửa giới hạn PDF của web/worker, không thay runtime mobile Kho bài so với source APK `dee15f2`. Log kiểm chứng cục bộ: `Test/apk-dee15f2-verification.json`, `Test/vercel-protected-smoke-d02f05d.txt`, `Test/vercel-promoted-smoke-d02f05d.txt`, `Test/vercel-pdf50-canonical-bundle.json`; không đưa APK hoặc log chứa metadata cloud lên Git.

Một lượt integration chạy cùng build bị timeout khóa AI và kéo theo lỗi lease của test kế tiếp. Đã để các tệp integration chạy tuần tự, giữ 20 request đồng thời trong test capacity; release lease trong finally của test đầu. Lượt chạy độc lập hoàn chỉnh sau đó đạt 19/19, không nới timeout hoặc bỏ assertion capacity.

Bổ sung vận hành sau rollout: `scripts/backup-r2-windows.mts` chỉ list/get R2, mã hóa AES-256-GCM với khóa DPAPI CurrentUser, kiểm tra lại inventory và giải mã đối chiếu từng file. Sau phê duyệt riêng của chủ dự án, backup media thật và kiểm tra lại độc lập đã đạt. Lượt đầu dừng do timestamp LIST/GET khác độ chính xác; đã sửa có regression, giữ kiểm tra ETag/size và inventory đầy đủ. Hướng dẫn tại `R2_BACKUP_2026-10-08.md`. Công cụ này không đổi runtime API/APK; chưa hoàn tất phục hồi bucket cách ly, offsite hoặc lịch chạy.

## Đối chiếu với kế hoạch tổng thể

| Nhóm công việc | Trạng thái thực tế |
| --- | --- |
| BUILD-01, BASE-01 | Production build đã đạt local và Vercel; source được chốt/push, không có secret hoặc dữ liệu thử nghiệm |
| BASE-02, E2E-01 | API `f0bc90f` đã lên domain chính, 18 smoke đạt; DB hiện có 11 migration, không thêm migration; readiness có secret chưa kiểm tra được |
| E2E-02…05 | APK sửa Samsung được người thử ghi R-01…R-05 đạt; R-06 media chưa đạt nghiệm thu; còn thiết bị thứ hai |
| SAFE-01/02 | Kiểm thử tích hợp phân quyền/auth/scoring và chống nộp trùng đã đạt trên PostgreSQL cách ly |
| SAFE-03 | Đã rollout limiter, quota/ngày, công tắc dừng và giới hạn AI đồng thời qua PostgreSQL; kiểm chứng local đạt, chưa thử provider/tải thật; ngân sách tiền/cảnh báo chưa hoàn tất |
| OPS-01 | Workflow và cổng dependency đã có, kiểm tra local đạt; chưa xác minh được remote CI hoặc branch protection bằng quyền GitHub hiện có |
| OPS-02 | Backup DB thật mã hóa/restore cách ly và backup media R2 thật/kiểm tra giải mã đạt; snapshot DB/R2 nhất quán, restore bucket, định kỳ/offsite/PITR chưa hoàn tất |
| OPS-03/04 | Đã có log/runbook/worker recovery nền; chưa nghiệm thu cảnh báo thực tế, tải worker và phục hồi khi ngắt |
| CONTENT, UX, PERF | Cần nội dung có quyền dùng, nghiệm thu thiết bị và đo tải lớn; tối ưu truy vấn đã triển khai nhưng chưa phải báo cáo tải mục tiêu |
| Beta/phát hành rộng | Chưa bắt đầu; cần hoàn tất các cổng trước beta và theo dõi 10–20 người trong hai tuần |

Hiện đã hoàn thành phần nền kỹ thuật và rollout API để bắt đầu nghiệm thu giai đoạn 1. Các việc bảo mật/kiểm thử của giai đoạn 2 được thực hiện sớm; không đồng nghĩa giai đoạn 2 đã đóng hoặc sản phẩm đã sẵn sàng phát hành rộng.

## Các cổng còn lại trước sử dụng thực tế

1. Kiểm tra readiness có xác thực và worker/storage trên hạ tầng: Vercel không cho pull worker secret qua CLI. Không thay/đọc lén secret để bỏ qua giới hạn này.
2. Đăng nhập trên API mới; kiểm tra ingestion protocol và AI trên tài khoản test.
3. Samsung S23 FE đã báo A-01/A-02/A-06/A-07 đạt ở APK trước; APK `dcb6524` đã được người thử ghi R-01…R-05 đạt trong `ANDROID_RETEST_DCB6524.md`, gồm Coach, phục hồi bài và đổi tài khoản. Người dùng đã chọn quản trị viên nhập PDF/audio trên web, người học chọn bài sẵn; API/web đã rollout và truy cập ADMIN đã được xác nhận. Cần nghiệm thu L-02/L-03/L-05 về upload, xuất bản và nghe/luyện trên APK mới; chưa coi media đạt. Cần thiết bị Android thứ hai trước khi đóng các cổng E2E.
4. Cấu hình cảnh báo, ngân sách, backup Neon/R2 định kỳ và offsite có khóa phục hồi độc lập; diễn tập phục hồi bucket và điểm DB/media nhất quán; chỉ định người vận hành và kiểm duyệt nội dung.
5. Chuẩn bị bộ nội dung có quyền sử dụng, hướng dẫn/support/chính sách dữ liệu, rồi chạy beta 10–20 người trong hai tuần và xử lý lỗi trước mở rộng.

API ngoài Internet đã được cập nhật như bằng chứng ở trên. APK/device QA, vận hành đầy đủ và beta vẫn chưa hoàn tất; không nâng tỷ lệ sẵn sàng chỉ vì build/test đạt.

## Thứ tự thực hiện tiếp theo theo quyết định nhập đề trên web

Mốc dưới đây là thời lượng dự kiến khi có đủ tài khoản, thiết bị và người kiểm duyệt; không phải cam kết ngày phát hành. Thay luồng nhập file trên điện thoại bằng chuẩn bị trên web theo quyết định của chủ dự án; vẫn phải nghiệm thu file/media và dữ liệu riêng tư.

| Chặng | Việc cụ thể | Phụ trách | Điều kiện chuyển chặng |
| --- | --- | --- | --- |
| 1. Đóng nghiệm thu luồng học, dự kiến 1–2 ngày | L-02/L-05: upload PDF/audio, sửa đáp án, tiếp tục job, công khai không trùng; L-03: cài APK mới trên S23 FE, nghe/làm/nộp/khôi phục qua Wi-Fi và 4G; thử tài khoản người học và Android thứ hai | Chủ dự án/QA thao tác thật; Dev xử lý lỗi và chốt phiên bản | Có biên bản theo SHA; không còn lỗi chặn học hoặc lộ dữ liệu; ghi rõ Part chưa đủ media |
| 2. Đóng cổng vận hành, dự kiến 3–5 ngày | OPS-01: xem CI và bật bảo vệ nhánh bằng tài khoản có quyền; OPS-02: backup Neon định kỳ/offsite và R2, diễn tập phục hồi; OPS-03/04: xác minh readiness/cron, cảnh báo và recovery; SAFE-03: đặt ngân sách tiền và thử cảnh báo | Dev + người vận hành/chủ tài khoản cloud | CI chặn lỗi; nhận được cảnh báo thử; backup/restore và recovery có bằng chứng; có người chịu trách nhiệm |
| 3. Chuẩn bị nội dung và tải beta, dự kiến 3–7 ngày, kiểm duyệt chạy song song | CONTENT-01/02: bộ 300–500 câu có quyền dùng, kiểm đáp án/audio/passage theo Part; UX-01: ít nhất hai Android; PERF-01: tải HTTP 20 user trên hạ tầng được phép, theo dõi p95/5xx/chi phí | Người kiểm duyệt + Dev/QA | Chỉ bật Part có nội dung đạt; vòng học ổn định; báo cáo tải thực tế, không thay bằng số SQL local |
| 4. Beta mời riêng, tối thiểu 14 ngày | 10–20 người học, kênh phản hồi, theo dõi lỗi và chi phí hằng ngày; sửa và nghiệm thu lại P0/P1; chốt hỗ trợ/chính sách dữ liệu/xóa tài khoản trước mở rộng | Chủ dự án + Dev + vận hành | Đạt ngưỡng beta trong kế hoạch tổng thể, không còn P0/P1; chỉ khi đó quyết định phát hành rộng |

Việc tiếp theo ngay lúc bàn giao: quản trị viên hoàn tất một bài nghe có đáp án đã đối chiếu trên web, rồi người học mở bài đó trên APK Kho bài mới. Không dùng tài khoản ADMIN hoặc kết quả test cách ly để kết luận trải nghiệm người học thật đã đạt.

Cập nhật sau báo lỗi PDF scan: `aea97e2` đã rollout; 133 unit/19 integration/build/15 smoke trước và sau promote đạt. Người dùng xác nhận có file đáp án và sẽ cung cấp đường dẫn. Bước chuẩn bị OCR dùng đúng file 14 trang đã đạt; OCR provider và công khai có kiểm duyệt vẫn cần nghiệm thu. Chi tiết và giới hạn rollback tại `PDF_SCAN_RELEASE_2026-10-08.md`.

Cập nhật tiếp: `f0bc90f` đã rollout chức năng gắn ảnh vào tác vụ và xuất bản ảnh/audio sang Kho bài, 146 unit/24 integration/build/18 smoke trước và sau promote đạt. Ảnh lưu vào tác vụ; phiên bản/quan hệ đóng góp ngăn ghi đè khi gửi đồng thời. Copy có điều kiện ETag, giao dịch DB và dọn copy lỗi đã kiểm chứng bằng API thật trên PostgreSQL + S3 loopback. Chưa nghiệm thu tài khoản ADMIN/R2/điện thoại thật; cắt ảnh/chia audio vẫn thủ công. Không nâng trạng thái beta chỉ vì kiểm thử đạt. Chi tiết tại `LISTENING_IMAGES_2026-10-08.md`.
