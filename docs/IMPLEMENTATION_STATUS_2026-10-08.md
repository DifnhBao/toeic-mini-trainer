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
| Unit/regression | 209 kiểm thử đạt; không dùng DB/provider thật; gồm policy lời giải HIDDEN theo revision, kiểm tra câu cũ trước xuất bản, tám kiểm thử gửi lại nội dung bị từ chối, 21 kiểm thử phiên Android, restore media loopback, bảo vệ log và mã yêu cầu, cùng các guard HTTP, audio nhóm, PDF 50 MiB và backup R2 đã có |
| PostgreSQL integration | 68 kiểm thử đạt trên DB loopback `toeic_release_test`, gồm bảy kiểm thử tạm dừng/bật lại OCR không mất lượt thử, chín kiểm thử claim/cache/ẩn lời giải với SDK dùng phản hồi giả, sáu kiểm thử cổng xuất bản câu cũ, gửi lại đồng thời/duyệt cũ trong lúc thay phiên bản, chín kiểm thử refresh/logout/reuse/rollback, sáu race timeout/retry worker, thống kê, Kho bài, upload/gắn/xuất bản ảnh và audio riêng theo nhóm, dedup và rollback với S3 loopback |
| Schema | 11 migration hiện có áp dụng thành công trên DB test; không thêm migration |
| Kiểu dữ liệu | TypeScript web và mobile đạt |
| Lint | 0 lỗi, 3 cảnh báo `<img>` hiện có |
| Production build | Next.js 16.3.8 Webpack đạt trên Windows ngoài sandbox |
| Android bundle | Source mobile `3cbde63`: Expo export Android đạt, 1.322 source; đây chưa phải nghiệm thu APK trên thiết bị |
| Backup/restore | DB Neon thật đã backup DPAPI và restore cách ly, 22 bảng khớp snapshot trong 24,657 giây; R2 thật đã backup mã hóa 16 file/18.948.378 byte và giải mã đối chiếu SHA-256; chưa restore bucket/backup định kỳ/offsite |
| Smoke local | 7 kiểm tra public/không đăng nhập đạt; không xác minh Google OAuth hoặc AI thật |
| Smoke sau promote | 23/23 kiểm tra đạt tại `https://toeic-mini-trainer.vercel.app`, gồm phương thức auth, trạng thái job/worker, kho bài, API chặn request chưa đăng nhập và trang admin hiển thị từ chối quyền; bundle thực có UI audio riêng; chưa phải nghiệm thu OAuth/media/AI thật |
| OAuth preflight | Google provider đã bật; sign-in/callback URL đúng domain chính; chưa xác minh đăng nhập thật |
| API cũ trước rollout | 6/7 smoke đạt; GET ingestion list trả 405 |
| Dependency web production | `npm audit --omit=dev` báo 0 lỗ hổng sau vá dependency |
| Dependency công cụ build | Braces/node-forge chưa có bản vá; ngoại lệ CI hết hạn 22/10/2026, không có trong 1.322 source của bundle mobile `3cbde63` |
| APK preview nền | EAS build `1f35e1b8-3a13-4977-907b-297a541d3b1a` FINISHED từ commit `24b9d6e`; chưa chứa bản vá dependency tiếp theo |
| Vercel | Deployment `dpl_AByFEsgTytEtXqdCk63cXsQFUwA7`, source `ff80432`, READY và đã promote; 23/23 smoke trước/sau promote; bản trước `f7bb8c2`, hạn chế rollback auth tại `MOBILE_SESSION_FAMILY_2026-10-08.md` |
| Payload Vercel | 149 tệp, đủ 125 tệp app/types/prisma; không có env/APK/nguồn ETS/ảnh local/backup/dữ liệu test |
| APK `5107b97` | EAS build `d2e40383-bd61-407d-9ad5-2081468f4165` FINISHED; người thử S23 FE báo A-01/02/06/07 đạt và ba lỗi A-03/04/08 |
| APK sửa Samsung | Build `ee0468f2-ffd3-4d5f-ad45-b9c7c6dc4a27`, source `dcb6524`, FINISHED; người thử ghi R-01…R-05 đạt trên S23 FE; R-06 đang vướng quy trình nhập đề nghe/audio |
| APK Kho bài mới | Build `f66fc9a6-cd3a-4985-9fb4-8664eff8db32`, source mobile `dee15f2`, FINISHED; APK 114.429.599 byte, CRC 1.698 mục/manifest/dex/bốn ABI đạt; chưa có biên bản điện thoại cho bản này |
| APK sửa phiên/điều hướng | Source `3cbde63`, EAS build `88bbd6b1-ca59-4153-9bfd-cf43e06661f4`, FINISHED; APK 114.438.583 byte, CRC 1.698 mục/manifest/dex/bốn ABI/bundle marker đạt; chữ ký v2 hợp lệ, cùng chứng chỉ bản Kho bài. Chưa nghiệm thu trên điện thoại; build `b6092a3` trước đó đã CANCELED |
| Truy cập quản trị | Người dùng xác nhận đăng nhập ADMIN thấy trang nhập đề/audio sau rollout `4242017`; chưa xác nhận upload và xuất bản |
| PDF listening quá 15 MB | Người dùng báo PDF 19,1 MB/MP3 42,2 MB bị chặn. Bản `d02f05d` nâng PDF nguồn lên 50 MiB ở UI/policy/worker; bundle thực trên domain chính xác nhận 52.428.800 byte. Người dùng đã qua upload, phát hiện tiếp lỗi OCR PDF scan (hàng dưới); bốn trang/lượt và 5 MiB OCR giữ nguyên |
| PDF scan có chữ ở bìa | File ETS thật 14 trang: worker cũ chỉ gửi chữ bìa nên không thấy câu. `aea97e2` sửa theo từng trang, chuẩn bị OCR cả bốn cụm local đạt; ngày 09/10 đã OCR thật/lưu/mở lại cụm 1–4, các cụm sau chưa nghiệm thu. Key cần bổ sung, ảnh chưa tự tách; xem `PDF_SCAN_RELEASE_2026-10-08.md` và `ETS_UPLOAD_OCR_ACCEPTANCE_2026-10-09.md` |
| ETS upload/OCR thật 09/10 | Phiên ADMIN có sẵn upload PDF 19,1 MB/MP3 42,2 MB và OCR trang 1–4 thành công, hai câu Part 1 khớp phạm vi nguồn; tác vụ COMPLETED mở lại được sau reload, key trống. Chưa gắn ảnh, phát audio, phân tích phần còn lại hoặc công khai; quyền truy cập/upload site sau đó bị người dùng từ chối. Xem `ETS_UPLOAD_OCR_ACCEPTANCE_2026-10-09.md` |
| Audio riêng cho nhóm | `0c21f9f` cho gắn/nghe/khôi phục audio nguồn, lưu vào tác vụ, duyệt nhiều audio theo số nhóm/tên file và xuất bản đúng bản sao; test API/DB/S3 loopback đạt, audio ETS thực tế chưa chia/nghiệm thu |
| Storage preflight | Cấu hình R2 cục bộ đạt HEAD bucket, OPTIONS 204 với origin domain chính/PUT/Content-Type; không ghi object, không sửa CORS, chưa xác minh upload từ Vercel |
| Backup media R2 | Sau phê duyệt riêng: 16 object, 18.948.378 byte đã mã hóa và kiểm tra lại độc lập đạt; 15 asset READY có object/size khớp. Không ghi cloud; chưa diễn tập restore bucket hoặc snapshot DB/R2 đồng thời |
| Truy vấn tải local | Cùng fixture 20 user/400.000 answer: p95 thống kê cũ/mới 1.218/354 ms khi lặp 20 câu và 1.209/739 ms khi phủ 10.000 câu; chưa phải HTTP/production (`PERFORMANCE_LOCAL_2026-10-08.md`) |
| HTTP tải local | Production build `0c21f9f`, 20 người học giả lập/đỉnh 40 request đồng thời, 1.800 request: p95 tổng 1.288,74 ms, không lỗi HTTP; đúng nhóm/quyền/retry và cleanup đạt. Chỉ Part 5 đã warmup, chưa phải staging/Vercel/thiết bị; xem `PERFORMANCE_HTTP_LOCAL_2026-10-08.md` |

Các lỗi EPERM của sandbox khi build/đọc module đã được kiểm tra lại ngoài sandbox. Một lượt unit test đồng thời build gặp EPERM khi đọc React; phải dùng kết quả của lượt chạy hoàn chỉnh sau đó. Không bỏ qua kiểm thử thất bại để tuyên bố đạt.

Luồng R-06 mới đã triển khai API/web: ADMIN nhập PDF/audio, duyệt và công khai trên web; người học chọn nhóm câu đã công khai trong Kho bài web/Android. Giữ dữ liệu cá nhân cũ, chặn tạo nội dung mới cho USER/REVIEWER tại tám API server, gồm import JSON cũ. Hướng dẫn và giới hạn tại `ADMIN_LISTENING_WORKFLOW_2026-10-08.md`. Người dùng xác nhận đã truy cập trang ADMIN; chưa nghiệm thu upload/audio thật của luồng này. Truy vấn READ ONLY chỉ đếm được một ADMIN đang ACTIVE trên DB cấu hình; không đọc định danh hoặc thay quyền. AI chỉ đọc PDF, không nghe audio để suy đáp án.

APK mới nhất: [tải bản sửa phiên/điều hướng `3cbde63`](https://expo.dev/artifacts/eas/HQsh1uAZ9NxH0pay9CNPlroMv8VH3bT3p4cyEX5zt7Q.apk), SHA-256 `97A3A1D0E54C070137B6687DF7A94D03709450957CDA2B84D430880ADC7DE245`, chữ ký cùng bản Kho bài cũ, API `ff80432`. Biên bản [ANDROID_RETEST_3CBDE63_2026-10-09.md](ANDROID_RETEST_3CBDE63_2026-10-09.md); chưa có kết quả thiết bị. Bản Kho bài trước `dee15f2` vẫn được giữ làm mốc lịch sử với SHA-256 `702AEF922860D9066FA8CFB085340A38F34B9E2983BE64EACAB19CEDA50D21E4`. Không đưa APK hoặc log chứa metadata cloud lên Git.

Một lượt integration chạy cùng build bị timeout khóa AI và kéo theo lỗi lease của test kế tiếp. Đã để các tệp integration chạy tuần tự, giữ 20 request đồng thời trong test capacity; release lease trong finally của test đầu. Lượt chạy độc lập hoàn chỉnh sau đó đạt 19/19, không nới timeout hoặc bỏ assertion capacity.

Bổ sung vận hành sau rollout: `scripts/backup-r2-windows.mts` chỉ list/get R2, mã hóa AES-256-GCM với khóa DPAPI CurrentUser, kiểm tra lại inventory và giải mã đối chiếu từng file. Sau phê duyệt riêng của chủ dự án, backup media thật và kiểm tra lại độc lập đã đạt. Lượt đầu dừng do timestamp LIST/GET khác độ chính xác; đã sửa có regression, giữ kiểm tra ETag/size và inventory đầy đủ. Hướng dẫn tại `R2_BACKUP_2026-10-08.md`. Công cụ này không đổi runtime API/APK; chưa hoàn tất phục hồi bucket cách ly, offsite hoặc lịch chạy.

## Đối chiếu với kế hoạch tổng thể

| Nhóm công việc | Trạng thái thực tế |
| --- | --- |
| BUILD-01, BASE-01 | Production build đã đạt local và Vercel; source được chốt/push, không có secret hoặc dữ liệu thử nghiệm |
| BASE-02, E2E-01 | API `ff80432` đã lên domain chính, 23 smoke đạt; DB hiện có 11 migration, không thêm migration; readiness có secret chưa kiểm tra được |
| E2E-02…05 | APK sửa Samsung được người thử ghi R-01…R-05 đạt; R-06 media chưa đạt nghiệm thu; còn thiết bị thứ hai |
| SAFE-01/02 | Kiểm thử tích hợp phân quyền/auth/scoring và chống nộp trùng đã đạt trên PostgreSQL cách ly; 21 regression client về phiên/storage đạt. Native/OAuth/đổi tài khoản trên APK mới vẫn cần nghiệm thu |
| SAFE-03 | Đã rollout limiter, quota/ngày, công tắc dừng và giới hạn AI đồng thời qua PostgreSQL; kiểm chứng local đạt, chưa thử provider/tải thật; ngân sách tiền/cảnh báo chưa hoàn tất |
| OPS-01 | Remote CI push 37877041742 và PR 37877046329 của `f5fed44` đã success cả web/integration/mobile; PR #4 vẫn nháp. Master trả protected=false, không có ruleset; cấu hình bảo vệ đã chuẩn bị, chưa áp dụng. Kết nối GitHub đã khôi phục |
| OPS-02 | Backup DB thật mã hóa/restore cách ly và backup media R2 thật/kiểm tra giải mã đạt; snapshot DB/R2 nhất quán, restore bucket, định kỳ/offsite/PITR chưa hoàn tất |
| OPS-03/04 | Đã có log/runbook/worker recovery nền; `f7bb8c2` chặn worker cũ ghi đè lượt retry, sáu regression DB local đạt. Cảnh báo thực tế, cron, tải worker và diễn tập ngắt hạ tầng vẫn chưa nghiệm thu |
| CONTENT, UX, PERF | Cần nội dung có quyền dùng và nghiệm thu thiết bị. SQL và HTTP local 20 người học đã có bằng chứng; tải staging, cache lạnh, media/mạng và thời gian dài hơn vẫn chưa đạt cổng PERF-01 |
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

Chuẩn bị nghiệm thu nội dung thật: đã cắt/render và kiểm tra đủ 11 ảnh cần thiết từ PDF ETS người dùng cung cấp, đóng gói cục bộ theo số câu, kiểm tra SHA-256/PNG/ZIP đạt. Ảnh chưa được upload hoặc công khai; đáp án và audio khớp nhóm vẫn chờ hoàn thiện. Kết quả/đường dẫn tại `ETS_MEDIA_PREPARATION_2026-10-08.md`; không thay đổi runtime hoặc mở cổng beta.

Cập nhật audio nhóm: `0c21f9f` đã rollout, 150 unit/29 integration/build/19 HTTP smoke trước và sau promote đạt. ADMIN có thể thay đoạn audio riêng của từng nhóm; APK hiện có nhận `group.audioUrl` như trước. Không tự cắt MP3, không thêm migration hoặc công khai bộ ETS. Đáp án, đoạn audio khớp nhóm, nghiệm thu ADMIN/R2/thiết bị và các cổng vận hành/beta vẫn còn mở; xem `GROUP_AUDIO_2026-10-08.md`.

Bổ sung kiểm chứng HTTP: đã thêm runner chỉ nhận DB/API loopback, đo luồng học production thực với JWT giả lập và kiểm tra kết quả/quyền/retry. Lượt cuối 1.800 request/20 người học đạt, p95 tổng khoảng 1,29 giây; 156 unit/TypeScript/lint đạt. Fixture đã dọn, server và container test đã dừng. Không thay runtime hoặc triển khai lại; PERF-01 vẫn mở cho hạ tầng thật. Chi tiết tại [PERFORMANCE_HTTP_LOCAL_2026-10-08.md](PERFORMANCE_HTTP_LOCAL_2026-10-08.md).

Bổ sung recovery OCR: `f7bb8c2` đã rollout, 156 unit/35 integration/build và 21 HTTP smoke trước/sau promote đạt. Chặn worker cũ ghi đè draft/kết quả IMPORTED hoặc đổi trạng thái/giảm lượt thử của retry mới; timeout từ snapshot GET cũ cũng không tác động lượt mới. Không thêm migration hoặc APK. OPS-04 vẫn mở cho cron, ngắt worker và đo thời gian phục hồi trên hạ tầng; đáp án ETS, media và nghiệm thu Android vẫn chờ. Chi tiết tại [INGESTION_WORKER_RECOVERY_2026-10-08.md](INGESTION_WORKER_RECOVERY_2026-10-08.md).

Bổ sung auth server: `ff80432` đã rollout, 156 unit/44 integration/build và 23 HTTP smoke trước/sau promote đạt. Refresh/logout/reuse cùng family được tuần tự hóa và đọc lại trạng thái để không bỏ sót token thay thế vừa commit; lỗi lưu/ký rollback, logout lỗi DB trả 503. Không thu hồi session thật để thử. Access JWT vẫn có TTL 15 phút; phản hồi đến muộn, ghi/xóa SecureStore và đổi tài khoản trên client vẫn cần sửa/kiểm chứng, chưa đóng cổng SAFE-01/E2E. Chi tiết tại [MOBILE_SESSION_FAMILY_2026-10-08.md](MOBILE_SESSION_FAMILY_2026-10-08.md).

Bổ sung client 09/10: `3cbde63` chặn nhận/trả/retry bằng phiên cũ, tuần tự hóa storage, giữ một refresh chung, có cảnh báo và retry logout, bỏ màn hình riêng tư khi đổi tài khoản và cho cuộn đăng nhập. 177 unit/21 regression controller mới, TypeScript/lint/dependency/export 1.322 source đạt; bảo vệ navigator mới chỉ qua kiểm tra tĩnh/export, cần nghiệm thu native. Build EAS thay thế đã FINISHED và kiểm chứng file/chữ ký như bảng trên; API không triển khai lại. Emulator riêng chỉ chạy APK nền, gặp System UI ANR/thiếu RAM host, đã dừng và kiểm chứng cleanup; không dùng thay nghiệm thu APK mới. MS-01…MS-08, giới hạn thu hồi offline và bằng chứng tại [MOBILE_SESSION_CLIENT_2026-10-09.md](MOBILE_SESSION_CLIENT_2026-10-09.md). Chưa có đường dẫn đáp án ETS hoặc bằng chứng đóng cổng Android/beta.

Nghiệm thu file thật 09/10: đã upload và OCR/lưu/mở lại thành công cụm 1–4 bằng phiên ADMIN hợp lệ; hai câu đúng phạm vi bìa/hướng dẫn/câu 1–2. Key chưa có, 11 ảnh còn local và MP3 chưa chia đoạn. Upload ảnh câu 1 rồi quyền truy cập site bị Browser Use từ chối theo lựa chọn người dùng; đã dừng mọi thao tác web, không dùng CLI/cookie/browser khác để vượt qua. Snapshot R2 cũ không bao gồm upload mới. Chi tiết tại [ETS_UPLOAD_OCR_ACCEPTANCE_2026-10-09.md](ETS_UPLOAD_OCR_ACCEPTANCE_2026-10-09.md); các cổng nội dung, media, Android và beta vẫn mở.

Bổ sung sau đó 09/10: chủ dự án đã cung cấp ảnh đáp án Test 1. Đã chuẩn hóa cục bộ đủ 100 đáp án Listening, đối chiếu theo hàng/cột và kiểm tra phân bố Part/đáp án Part 2 đạt; chưa nhập lên web hoặc duyệt. Lần kiểm tra sau lời đề nghị cấp lại Browser Use vẫn bị quyền từ chối đã lưu chặn origin. Ảnh/key/media chỉ chuẩn bị local; không coi đây là nghiệm thu full bộ đề hoặc mở beta. Bằng chứng và bước ghép key theo số câu nguồn tại [ETS_UPLOAD_OCR_ACCEPTANCE_2026-10-09.md](ETS_UPLOAD_OCR_ACCEPTANCE_2026-10-09.md).

Bổ sung phục hồi media 09/10: công cụ mới chỉ nhận endpoint loopback, tạo bucket UUID mới, kiểm tra backup trước ghi và không báo thành công nếu cleanup lỗi. Bản backup đã phê duyệt 16 file/18.948.378 byte qua restore/read/hash/metadata/16 range bằng S3 HTTP fixture trong bộ nhớ, dọn dữ liệu/listener đạt; không ghi cloud/plaintext đĩa. 186 unit, TypeScript và lint các tệp sửa đạt; không deploy API hoặc build lại APK vì không đổi runtime ứng dụng. Backend/bucket private thật, liên kết DB/media, snapshot nhất quán, định kỳ/offsite và RPO/RTO vẫn mở. Chi tiết tại [R2_LOCAL_RESTORE_2026-10-09.md](R2_LOCAL_RESTORE_2026-10-09.md).

Bổ sung log lỗi 09/10: bỏ bảy log truyền Error thô trong upload/media/đọc bài; loại lỗi ở các log AI/auth/ingestion/đóng góp/capacity và hook Next đều qua allowlist, không serialize error/stack/cause/metadata hoặc tên lớp tùy ý. 189 unit, TypeScript, lint (ba cảnh báo img cũ), production build Webpack 41/41 đạt. Chưa deploy bản này; API live vẫn `ff80432`, APK không đổi. GitHub connector tiếp tục trả 404 và chưa có installation cho chủ repo; người dùng chọn cấp quyền, cần hoàn tất kết nối rồi mới kiểm tra CI/branch protection. Không suy ra CI xanh từ SSH push. Chi tiết và giới hạn OPS-03 tại [SERVER_LOG_PRIVACY_2026-10-09.md](SERVER_LOG_PRIVACY_2026-10-09.md).

Bổ sung mã yêu cầu 09/10: proxy API tạo UUID mới, ghi đè ID caller, trả header và chuyển context giới hạn tới log route/hook/worker. Sáu kiểm thử mới, tổng 195 unit, TypeScript/lint/build và 17 phản hồi HTTP production loopback đạt; 16 API ID khác nhau, credential nội bộ không lộ ra wire, server đã dừng. Guard payload yêu cầu proxy/hook root. Chưa deploy, không đổi APK; API live vẫn `ff80432`. Người dùng xác nhận chọn kết nối GitHub `ddinhbao05`, nhưng connector sau đó báo `Unknown tool`; chưa xác minh tài khoản mới, CI hoặc branch protection. Chi tiết/phạm vi tại [REQUEST_TRACE_2026-10-09.md](REQUEST_TRACE_2026-10-09.md).

Bổ sung gửi lại nội dung 09/10: ADMIN chủ bộ bị từ chối có editor nạp bản đã gửi, sửa câu/Part/lựa chọn/đáp án, kiểm tra lại từng câu và quyền chia sẻ; dùng lại media, không upload hoặc chạy AI lại. Gửi lại cùng ID về PENDING với audit và so sánh phiên bản; hai request chỉ một thành công, lượt duyệt cũ không thể công khai bản mới. 203 unit/46 PostgreSQL integration, TypeScript/lint/build đạt; 11 migration áp dụng vào DB loopback mới, container đã dừng. Browser Use từ chối fixture cục bộ nên UI tương tác chưa được xác minh. Chưa deploy; live vẫn ff80432, CI chưa xác minh, APK không đổi. Thay media/editor câu đã xuất bản và các cổng nội dung/Android/vận hành/beta còn mở. Chi tiết tại [CONTRIBUTION_RESUBMISSION_2026-10-09.md](CONTRIBUTION_RESUBMISSION_2026-10-09.md).

Bổ sung cổng xuất bản câu cũ 09/10: API publish kiểm tra lại Part/nội dung/lựa chọn/đáp án, media chia sẻ READY đúng loại, audio Part 1–4, ảnh Part 1 và đoạn đọc Part 6–7; áp dụng cả khi xuất bản lại sau archive. Cập nhật so sánh trạng thái/revision/group; xuất bản đồng thời chỉ một audit thành công. 207 unit/52 integration PostgreSQL đạt, TypeScript/lint đạt; fixture đã dọn và container test đã dừng. API live vẫn ff80432; chưa deploy, chưa kiểm tra UI/R2 thật và CI từ xa. Chi tiết và giới hạn tại [QUESTION_PUBLICATION_PREFLIGHT_2026-10-09.md](QUESTION_PUBLICATION_PREFLIGHT_2026-10-09.md).

Bổ sung cache lời giải 09/10: tác vụ cũ không ghi đè/đánh dấu lỗi claim mới; lưu READY và bản sao cá nhân chung transaction. Hide xóa bản sao và lịch sử web/Android kiểm tra HIDDEN đúng revision; guest giữ quy tắc chỉ đọc READY. 209 unit/61 integration PostgreSQL, TypeScript/lint đạt; không gọi provider thật. Fixture users/questions/tests/attempts/personal explanations/cache đều còn 0 và container đã dừng. Chưa deploy, live vẫn ff80432; không thu hồi phản hồi đã gửi/offline, không đóng cổng AI/chi phí, UI/Android hoặc beta. Phạm vi và hạn chế triển khai/rollback tại [EXPLANATION_CACHE_RECOVERY_2026-10-09.md](EXPLANATION_CACHE_RECOVERY_2026-10-09.md).

Bổ sung tạm dừng OCR 09/10: worker không nhận job khi AI/ingestion tắt; nếu dừng trước gọi provider thì trả PENDING và hoàn lượt theo đúng claim, không tác động worker thay thế. Drain có secret trả trạng thái paused; vẫn chặn request không xác thực. 209 unit/68 integration PostgreSQL đạt; dữ liệu giả đã dọn về 0 và container test dừng. Chưa deploy; mốc live được xác minh gần nhất vẫn ff80432. Công tắc theo môi trường từng deployment, không hủy provider đã gọi; lịch giờ/lần, CI, nghiệm thu web/Android và beta vẫn mở. Chi tiết tại [INGESTION_PAUSE_2026-10-09.md](INGESTION_PAUSE_2026-10-09.md).

Bổ sung GitHub 09/10: connector đã xác thực `DifnhBao`, quyền repo hợp lệ; đối chiếu workflow run/check-runs/jobs xác nhận ba job CI thật của `6ff0597` đạt. [PR nháp #4](https://github.com/DifnhBao/toeic-mini-trainer/pull/4) đã tạo và gắn vào chat, chưa merge. Master chưa được bảo vệ, rulesets rỗng; payload `.github/branch-protection-master.json` đã chuẩn bị nhưng chưa áp dụng. Một run schedule gọi readiness/worker qua secret đạt 2xx; chưa gắn được với deployment cụ thể hoặc chứng minh OCR hoàn tất. Lượt kiểm tra tiếp theo plugin GitHub không còn installed và công cụ CI yêu cầu kết nối, nên CI riêng của PR vẫn chưa xác minh. Các yêu cầu Browser Use, Android/media/vận hành/beta còn mở. Bằng chứng theo SHA và giới hạn tại [GITHUB_RELEASE_GATE_2026-10-09.md](GITHUB_RELEASE_GATE_2026-10-09.md).

Cập nhật sau khôi phục kết nối: profile/repo GitHub xác nhận `DifnhBao`; hai lượt CI push/PR của `f5fed44` đều completed/success, từng job web/integration/mobile đạt. Master vẫn chưa được bảo vệ. Metadata Vercel xác nhận preview tự động `f5fed44` READY (`dpl_FBqNuqK4ioFJZTXKrQmkp3V7iHaT`), domain chính vẫn production `ff80432` READY (`dpl_AByFEsgTytEtXqdCk63cXsQFUwA7`). Chỉ đọc metadata, chưa smoke hoặc nghiệm thu preview; không promote, đổi cấu hình, gọi AI hoặc ghi DB/storage. Cần quyền Browser Use/nghiệm thu thiết bị trước tiếp tục cổng phát hành; xem phần cập nhật tại [GITHUB_RELEASE_GATE_2026-10-09.md](GITHUB_RELEASE_GATE_2026-10-09.md).
