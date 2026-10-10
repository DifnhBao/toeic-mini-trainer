# Bản chuẩn bị nghiệm thu API và Android

Ngày 09/10/2026. Pin source `ffe179edabef553f0434cd85bad3f3b66916a721` trên `codex/release-readiness`, PR #4 nháp. Bản này chứa phân tích học tập cá nhân, mã hỗ trợ lỗi và guard yêu cầu shared runtime. Không coi HEAD tài liệu sau đó là source của các gói đã kiểm chứng ở đây.

## Source và CI

CI [37939651824](https://github.com/DifnhBao/toeic-mini-trainer/actions/runs/37939651824) completed/success, ba job web/integration/mobile và từng bước đều đạt. Log đọc được: Linux 249/252 unit đạt, 3 skip cần FFmpeg/ffprobe/DPAPI Windows; PostgreSQL 78/78 không skip; build web, export/audit Android đạt. Bộ Windows ở source mã hỗ trợ `08bfafb` 252/252 không skip; regression guard thay đổi ở `ffe179e` chạy Windows riêng đạt sau khi chứng minh guard cũ chấp nhận gói thiếu shared. Không khẳng định chạy lại toàn bộ Windows 252 ca cho `ffe179e`.

## Gói mã đã kiểm tra cục bộ

- Git archive từ source pin; ép `core.autocrlf=false` trong lệnh archive để nội dung khớp Git blob theo byte, không thay cấu hình Git của workspace. Snapshot trong `Test/rc-ffe179e-lf`. Ba biên bản Android chưa commit của chủ dự án không được đưa vào snapshot.
- Vercel CLI 63.1.0 `deploy --dry --format=json` trên snapshot liên kết đúng project có sẵn `prj_aNFdkqzmPs9xtj22hOH70IadKeo7`/team `team_iSgJJpFBT5k7mzLDCA1uPNQp`. Manifest có 170 entry (5 thư mục), 165 file; guard đạt đủ 141 file ứng dụng bắt buộc, gồm cả shared. Không có các đường dẫn env/backup/key/APK/mobile bị loại theo guard. Chỉ dry-run, không upload hoặc tạo deployment bằng CLI. Phương pháp theo [Vercel dry-run](https://vercel.com/changelog/dry-run-deployments-with-vercel-cli).
- Archive Android dùng đúng hàm `makeShallowCopyAsync` của EAS CLI 24.12.1 đang cài, cùng cơ chế `.easignore` của bước archive; không gọi login/GraphQL, signing, prebuild hoặc remote build. 374 file, 69 file mobile, 2 shared, 3.739.536 byte; từng file còn lại khớp Git blob, đủ mobile/shared runtime. `.env.example` bị loại theo `.env*`, không phải thiếu source runtime. Không có env/key/backup/APK/generated output theo kiểm tra; đây không phải APK hoặc kết quả EAS build. Archive chứa source tracked khác ngoài mobile như quy tắc EAS hiện có, không phải gói chỉ gồm mobile.

Proof/manifest/log nằm trong Test, ngoài Git: `rc-eas-ffe179e-proof.json`, `vercel-rc-ffe179e-lf-dry.json`, `vercel-rc-ffe179e-lf-verified.txt`. Script chuẩn bị chỉ cục bộ; đối chiếu source pin trước upload, không lấy working tree có thay đổi của người dùng thay snapshot đã kiểm tra.

## Preview tự động thực tế

Vercel metadata cho thấy Git integration đã tự tạo preview source pin, `READY`, target null: `https://toeic-mini-trainer-nwiyttnz6-le-dinh-bao-s-projects.vercel.app`. Đây là preview dùng cấu hình project có sẵn, **chưa chứng minh DB/bucket cách ly**, không dùng để tạo dữ liệu giả hoặc chạy load test.

Chín kiểm tra HTTP qua Vercel CLI đã đăng nhập đều đạt, không dùng phiên/token của người học:

| Request | Trạng thái |
| --- | --- |
| GET / và /progress | 200 |
| GET /api/v1/progress/insights, /api/v1/library, /api/v1/ingestions, /api/v1/attempts | 401 |
| GET /api/internal/ready | 401 |
| POST /api/v1/tests với body rỗng | 401 |
| POST /api/mini-tests/UUID-giả/submit với body rỗng | 401 |

Bảy response API có bảy UUID v4 hợp lệ khác nhau, thay UUID caller giả; body là lỗi và không có số liệu/câu hỏi/đề xuất. Không tạo bài, nộp bài có phiên, gọi AI/OCR, upload media, seed/migrate hoặc chuyển domain. Chỉ đối chiếu HTTP/response, chưa đối chiếu request ID với log cloud. Bằng chứng `Test/preview-ffe179e-api-smoke-proof.json` và log lọc, không lưu auth header/credential. Vercel CLI xử lý quyền deployment protection; kết quả này không chứng minh APK chưa đăng nhập Vercel truy cập được URL preview, không thay quyền/phiên Browser Use.

Readiness 401 chỉ xác nhận cổng bảo vệ. Local chưa có `INGESTION_WORKER_SECRET`, nên chưa gọi readiness có secret hoặc kết luận DB/R2 của preview khỏe. Không kéo hoặc ghi thêm secret cloud để vượt cổng này. Source route readiness đọc SELECT 1 và storage sau khi có quyền; cần nghiệm thu riêng qua cấu hình được phép.

## Domain chính và APK hiện tại

Vercel inspect domain chính vẫn trỏ deployment `dpl_AByFEsgTytEtXqdCk63cXsQFUwA7`, target production, READY, URL deployment `toeic-mini-trainer-2j1v1ra2v-le-dinh-bao-s-projects.vercel.app`. Đây là cùng ID đã đối chiếu trước với source `ff80432`; không promote hoặc đổi env trong lượt chuẩn bị. Project setting đọc được là Next.js, Node 24.x, rootDirectory null; CI dùng Node 22. Metadata/build READY và HTTP trên preview là bằng chứng riêng, không tự chứng minh mọi cấu hình production/preview tương đương.

APK được nghiệm thu gần nhất vẫn source `0941a11`; chưa tạo APK từ source pin. Profile EAS preview hiện trỏ domain chính. Không build/gửi APK với hứa hẹn tính năng mới trước khi API tương ứng được phát hành và kiểm tra; không nhúng secret deployment protection vào APK hoặc tự mở công khai preview để điện thoại truy cập.

## Bước tiếp theo cần người chủ dự án tham gia

1. Lượt tạo deployment dùng cấu hình production, chưa chuyển domain, đã được chủ dự án duyệt và thực hiện như phần cập nhật bên dưới. Chuyển domain vẫn chưa được phép; còn kiểm tra readiness, trạng thái worker/công tắc AI và fence cache theo runbook trước phát hành. Không promote nhầm preview chỉ vì READY.
2. Kiểm tra readiness có secret theo quyền hợp lệ, đăng nhập ADMIN/người học, auth/scoring/nộp trùng, không lộ lời giải ẩn, upload/media. Quyền Browser Use được lưu chặn trước đó chưa có bằng chứng mới; không dùng HTTP smoke để thay nghiệm thu UI hoặc vượt quyền.
3. Sau API mới đạt, tạo APK preview nội bộ đúng source/API, khóa ký có sẵn, không mua gói hoặc lên store. S23 FE nghiệm thu tám mục trong biên bản phân tích, account/offline/history/media, rồi Android thứ hai. Bộ Reading có quyền chia sẻ và nhãn kỹ năng cần hoàn thiện; chia audio vẫn tạm gác.
4. Backup định kỳ/ngoài máy/khóa và phục hồi DB-media nhất quán, cảnh báo/ngân sách/người xử lý và bảo vệ nhánh vẫn là cổng mở trước beta 10–20 người/14 ngày. Không đóng các cổng này bằng CI hoặc preview smoke.

## Cập nhật bản kiểm tra dùng cấu hình production — 21h40 ngày 09/10

Chủ dự án trả lời **“Đồng ý tạo bản kiểm tra, chưa chuyển domain”**. Đã upload snapshot LF đúng source pin, dùng `--prod --skip-domain`, project/team có sẵn; build script chỉ `prisma generate && next build --webpack`, không seed/migrate DB hoặc công khai ETS. Deployment `dpl_AZDhfhaixzLeQ54HMGgeKvuzs4XV`, URL `https://toeic-mini-trainer-16vz9lqhn-le-dinh-bao-s-projects.vercel.app`, target production, READY. `vercel ls` metadata đối chiếu đúng SHA pin và ref `codex/release-readiness`; không lấy HEAD tài liệu làm source deployment.

Chín kiểm tra HTTP cùng bảng phía trên đạt 9/9 trên bản kiểm tra mới: hai trang 200, bảy cổng API 401, mã yêu cầu hợp lệ/thay mã caller và body không chứa dữ liệu riêng tư. Chỉ Vercel CLI xử lý deployment protection, không có phiên người học, không gọi AI/provider hoặc tạo dữ liệu ứng dụng. Bằng chứng riêng `Test/production-ffe179e-api-smoke-proof.json`; không thay nghiệm thu tài khoản thật, nội dung báo cáo, media, log cloud hay APK.

**Sự cố alias phụ:** mặc dù dùng `--skip-domain`, Vercel tự gán `toeic-mini-trainer-le-dinh-bao-s-projects.vercel.app` vào deployment mới. Domain chính đã kiểm tra ngay sau tạo vẫn ở deployment cũ. Đã trả alias phụ về deployment cũ và inspect lại cả hai địa chỉ: cùng ID `dpl_AByFEsgTytEtXqdCk63cXsQFUwA7`, READY. Không khẳng định alias phụ chưa từng đổi hoặc không có lưu lượng trong khoảng đó. Proof trước/sau và log sửa nằm trong Test; chưa promote domain chính hoặc đổi cấu hình project.

**Readiness có khóa chưa được thực hiện:** `vercel env run -e production` báo 18 giá trị Secret không thể tải từ môi trường production. Tiến trình con không nhận khóa worker nên dừng trước HTTP request. Các biến thiếu trong tiến trình cục bộ không chứng minh cấu hình cloud thiếu; không kết luận DB/R2 lỗi, JWT/Auth chưa cấu hình hoặc công tắc AI bật/tắt. Không ghi plaintext secret, gọi API giải mã để vượt hạn chế, xoay khóa hoặc thay GitHub secret. Chủ dự án xác nhận không còn file chứa khóa gốc. Endpoint readiness khi có quyền chỉ `SELECT 1` và `HeadBucket`; chưa kiểm chứng các thao tác học/media thực tế.

CI HEAD tài liệu `6c809d5b227546b9e6e38cb2e83d2867cc06008a`, run [37943810895](https://github.com/DifnhBao/toeic-mini-trainer/actions/runs/37943810895), completed/success: web/integration/mobile và từng bước đều đã xác minh. HEAD này chỉ thêm biên bản; deployment và archive vẫn pin `ffe179e`.

## Bản kiểm tra với khóa riêng — 21h50 ngày 09/10

Sau khi xác nhận không còn khóa gốc, chủ dự án duyệt **“Đồng ý tạo bản kiểm tra với khóa riêng”**. Đã tạo lại bản kiểm tra cùng source pin và cấu hình production, chỉ ghi đè `INGESTION_WORKER_SECRET` bằng khóa CSPRNG 32 byte riêng của deployment đó; giữ nguyên secret project/GitHub. CLI 63.1.0 đã đối chiếu source: `--env INGESTION_WORKER_SECRET` không kèm giá trị đọc từ môi trường tiến trình. Khóa không có trong argv/log/plaintext file, bản lưu cục bộ chỉ DPAPI trong Test ngoài Git. Không gọi POST worker, AI hoặc sửa DB/R2.

Deployment mới `dpl_BTky44gFdmrsS6EkG1KUhUptn9CC`, `https://toeic-mini-trainer-r36raf45w-le-dinh-bao-s-projects.vercel.app`, target production READY; list metadata xác minh SHA pin. Helper ban đầu chờ JSON nhưng CLI ở môi trường tiến trình tối thiểu trả URL dạng chữ, nên helper báo lỗi sau CLI exit 0/build READY. Đã inspect/list đúng URL từ log để phục hồi receipt, **không submit lần hai hoặc tạo khóa khác**; sửa helper dùng `--json` cho lần được duyệt sau này. Không coi lỗi đọc receipt là build thất bại.

GET `/api/internal/ready` có khóa riêng đạt **HTTP 200, ready=true**, mã yêu cầu `8fe56bfb-439c-4b85-8698-888e07d65005`. Chỉ `SELECT 1` và R2 `HeadBucket` thành công từ runtime deployment; không chứng minh đọc dữ liệu phân tích thực tế, upload/playback media, quyền đọc/ghi từng object hoặc cron thật. Proof `Test/production-ffe179e-private-readiness-proof.json` chỉ chứa kết quả/mã yêu cầu, không có credential.

Chín HTTP smoke cùng bảng ở trên chạy lại trên URL khóa riêng đạt **9/9**; GET readiness thiếu khóa vẫn 401. Proof `Test/production-private-ffe179e-api-smoke-proof.json`; không dùng phiên người học và không tạo dữ liệu học. Phân biệt kết quả 401 không đăng nhập với readiness 200 có khóa riêng; cả hai không thay nghiệm thu UI/Android hoặc số liệu cá nhân thật.

Inspect domain chính và alias phụ ngay sau tạo bản khóa riêng đều vẫn trỏ ID cũ `dpl_AByFEsgTytEtXqdCk63cXsQFUwA7`. Không cần sửa alias cho lần này. Bản kiểm tra ban đầu và bản khóa riêng là hai deployment độc lập; không promote một trong hai chỉ vì READY. Kết quả DB/R2 dùng khóa riêng **không phục hồi hay chứng minh hoạt động khóa/cron thật**. Nếu cần xoay khóa worker dùng lâu dài, phải chuẩn bị đồng bộ Vercel–GitHub và được phép riêng trước thực hiện.
