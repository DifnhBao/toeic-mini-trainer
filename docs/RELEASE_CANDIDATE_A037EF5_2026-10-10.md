# Bản chuẩn bị nghiệm thu tiếp theo — 10/10/2026

Pin mã API/Android `a037ef596c27e2f5e55e002083ceddb8a424ba03` trên `codex/release-readiness`. Gồm phân tích học tập, mã hỗ trợ, công cụ ADMIN nhãn kỹ năng và kiểm tra worker chỉ đọc. PR #4 vẫn nháp, chưa merge. Các commit chỉ thêm bằng chứng sau đó không đổi source của gói đã kiểm chứng ở đây.

## CI và gói mã

[Run 38020485545](https://github.com/DifnhBao/toeic-mini-trainer/actions/runs/38020485545) completed/success; đọc đủ ba job web/integration/mobile và từng bước. Log Linux: 261 test, 258 pass, 3 skip, 0 fail; PostgreSQL 84/84, không skip; web build compiled 28,7 giây; Android export/kiểm tra bundle đạt. Local sáu test worker, web TypeScript và lint hai file đạt. Không khẳng định chạy lại toàn bộ Windows hoặc có APK mới.

Git archive với `core.autocrlf=false` riêng lệnh, snapshot `Test/rc-a037ef5-lf`, từng file khớp Git blob. Không chứa ba biên bản Android đang sửa của chủ dự án.

- Gói web: dry-run Vercel CLI 63.1.0 có 173 entry / 168 file / 919.827 byte; guard đạt đủ 144 file ứng dụng bắt buộc, gồm shared. Không có env/backup/key/APK/mobile hoặc đường dẫn bị loại. Manifest `Test/vercel-rc-a037ef5-lf-dry.json`. Lượt dry-run đầu thiếu metadata liên kết project nên dừng trước tạo deployment; đã dùng metadata project cũ được đối chiếu đúng project/team rồi chạy lại đạt, không tạo project hoặc thay cấu hình cloud.
- Project Vercel `toeic-mini-trainer`, ID `prj_aNFdkqzmPs9xtj22hOH70IadKeo7`, team `team_iSgJJpFBT5k7mzLDCA1uPNQp` / `le-dinh-bao-s-projects`.
- Gói Android: EAS CLI 24.12.1 copier / `.easignore`, 386 file / 69 mobile / 2 shared / 3.802.467 byte; đủ runtime, từng file khớp Git blob, không có đường dẫn env/key/backup/APK/generated output bị loại. Proof `Test/rc-eas-a037ef5-proof.json`. Chỉ chuẩn bị cục bộ; chưa gọi signing/build/upload/store. Profile preview vẫn trỏ canonical, nên phải nghiệm thu API tương ứng trước hứa tính năng mới trên APK.

## Preview và mapping đang dùng

Vercel Git preview source pin `READY`, target null: `https://toeic-mini-trainer-renymsnsk-le-dinh-bao-s-projects.vercel.app`. Metadata đối chiếu SHA/ref/repository/team. Chín HTTP kiểm tra qua Vercel CLI không có session người học đạt: GET `/`, `/progress` 200; GET insights/library/ingestions/attempts/readiness và POST test/submit body rỗng 401. Bảy API response có request ID v4 hợp lệ/riêng, thay mã caller, body lỗi không chứa dữ liệu học. Proof `Test/preview-a037ef5-api-smoke-proof.json`.

Không tạo dữ liệu học, gọi AI, upload nội dung hoặc seed/migrate. Preview DB/bucket cách ly chưa xác minh; không dùng load test ở đây. CLI gateway xử lý deployment protection, không chứng minh điện thoại truy cập được preview hoặc thay quyền Browser Use.

Inspect ngày 10/10: canonical và alias phụ cùng `dpl_AByFEsgTytEtXqdCk63cXsQFUwA7`, READY, URL `toeic-mini-trainer-2j1v1ra2v-le-dinh-bao-s-projects.vercel.app`. Cùng ID đã mapping trước với `ff80432`; inspect hiện tại không trả SHA, không suy ra SHA mới từ HEAD local. Không thay alias/config production.

Provider discovery chỉ đọc: preview có Google/HTTP 200 nhưng signin/callback origin vẫn canonical bản cũ; canonical discovery cũng 200/đúng origin. Proof `Test/release-oauth-preflight-20261010-proof.json`, 03:29:34 UTC. Chưa mở Google authorization, lấy CSRF/token/session/cookie hoặc đăng nhập. Không coi đăng nhập từ preview là nghiệm thu runtime mới.

## Khóa GitHub và kiểm tra chỉ đọc đã xác minh

Chủ dự án tự chạy và gửi [run 38020753830](https://github.com/DifnhBao/toeic-mini-trainer/actions/runs/38020753830). API metadata: workflow_dispatch, nhánh `codex/release-readiness`, SHA đúng source pin, run/job/từng bước completed/success. Log job `114121016239`:

```json
{"mode":"readiness-only","targetKind":"canonical","canonicalTarget":true,"readinessStatus":200,"ready":true,"requestId":null,"workerCalled":false}
```

Runner source đã kiểm tra: đúng một GET readiness, dừng trước POST worker; cấu hình khóa GitHub hiện có được canonical chấp nhận tại lượt này. Theo source endpoint, readiness đọc DB SELECT 1 và storage HeadBucket, không thay nghiệm thu dữ liệu học/media/quyền từng object. `requestId=null` không chứng minh mất request, server cũ chưa có receipt ID mới. Không tải/in/đổi khóa; không cần xoay khóa chỉ vì mất bản local. Không chứng minh khóa của bản kiểm tra riêng FFE là cùng khóa hoặc canonical mới đã rollout. Chưa xác minh schedule theo giờ, quiesce AI/writer cũ, queued/paused hay job hoàn thành.

Browser Use mở GitHub vẫn bị saved user permission từ chối; lượt thật do chủ dự án chạy, kết quả đọc bằng connector đã được phép. Không vượt chặn bằng trình duyệt/API thay thế thao tác UI.

## Cổng còn mở và bước được phép tiếp theo

1. Tạo bản kiểm tra production-config đã được chủ dự án phê duyệt và thực hiện theo phần cập nhật dưới đây. Chuyển domain vẫn chưa được phép; chưa seed/migrate/công khai ETS/mua gói.
2. Readiness bản mới cần gọi qua khóa gốc đúng quyền; không tải secret cloud. Workflow đã xác minh canonical; chưa dùng kết quả canonical cũ thay bản mới. Đang bổ sung tùy chọn origin chỉ dành cho readiness-only, không thay URL/secret cấu hình GitHub và từ chối override cho drain. Tùy chọn này không vượt deployment protection; trước chạy thật cần có đường truy cập được phép. Chưa sửa GitHub/project secrets hoặc tự dùng khóa riêng cho source mới.
3. Chốt môi trường nghiệm thu Google/runtime mới và quiesce writer cũ trước chuyển domain theo runbook. Không coi snapshot DB không PROCESSING hoặc CI là chứng minh request/provider cũ đã kết thúc. Rollback API cũ có rủi ro trả lời giải HIDDEN; chỉ tắt AI không sửa đường đọc cũ.
4. Sau API mới đúng phạm vi và qua các cổng, build APK nội bộ đúng source/API, nghiệm thu phân tích/account/offline/history/media trên S23 FE và Android thứ hai. APK hiện có vẫn 0941a11, chưa có phân tích mới.
5. Nội dung có quyền sử dụng, đáp án/ảnh/audio/nhãn thật đủ độ phủ, backup định kỳ/ngoài máy/khóa, phục hồi DB-media nhất quán, cảnh báo/ngân sách/người xử lý và beta 10–20 người/14 ngày vẫn mở. Audio tự chia đang hoãn theo yêu cầu.

## Cập nhật bản production-config đã được duyệt — 10h40

Chủ dự án trả lời **“Đồng ý tạo bản kiểm tra, chưa chuyển domain”** cho gói source pin 168 file. Lệnh từ snapshot đã đối chiếu Git blob, `--prod --skip-domain --json`, cấu hình project sẵn có, không worker-key override/seed/migrate. Deployment **`dpl_Hjy5rP2yLBfQTwQ5635Ju8QB35xW`**, URL **`https://toeic-mini-trainer-dplnz4l3b-le-dinh-bao-s-projects.vercel.app`**, target production, READY. List metadata đối chiếu đúng SHA/ref.

Inspect ngay sau build: canonical và alias phụ vẫn cùng deployment cũ `dpl_AByFEsgTytEtXqdCk63cXsQFUwA7`, READY; lần này không cần sửa alias. Không dùng riêng `--skip-domain` làm bằng chứng. Gói/source/CI khác với hai deployment FFE trước, không gộp kết quả readiness của chúng.

Chín HTTP smoke cùng bộ preview trên production-config test đạt 9/9 qua Vercel CLI có quyền gateway, không phiên người học/AI/dữ liệu học mới. Proof `Test/production-a037ef5-api-smoke-proof.json`. Đây chỉ là HTTP auth gates và response correlation, không phải số liệu phân tích/Google login/media/APK.

GET readiness trực tiếp **không gửi credential, không theo redirect** trả 302; location được xác minh là origin `https://vercel.com` và route đăng nhập SSO, chỉ lưu origin/boolean, không query/nonce/raw header. Proof `Test/production-a037ef5-reachability-proof.json`, 03:41:51 UTC. Đây là deployment protection trước API, không phải DB/R2 thất bại hoặc worker-key không hợp lệ. GitHub/điện thoại chưa truy cập trực tiếp được URL này bằng app credential. Không tắt protection, tạo/lấy bypass key, nhúng key vào APK hoặc tự mở alias công khai.

Runner đang bổ sung `readiness_origin` tùy chọn theo same-project allowlist, chỉ GET khi mode readiness-only, receipt `targetOverride`; bất kỳ override khi drain đều lỗi trước network. Tám test giả lập, web TypeScript và lint ba file đạt; YAML/default/cron/persist-credentials kiểm tra đạt. Chưa có CI/dispatch cho phiên bản runner này tại lúc ghi; schedule/default worker URL/key giữ nguyên. Chế độ đó vẫn từ chối redirect và không giải quyết quyền Vercel tự động.

Bước tiếp theo phải chốt môi trường truy cập được phép: địa chỉ staging/auth hợp lệ hoặc rollout canonical có kiểm soát theo runbook. Cần phê duyệt thay cấu hình/truy cập tương ứng; không xem phê duyệt tạo deployment là phê duyệt chuyển traffic. Trong lúc chờ, gói APK vẫn chỉ archive cục bộ, chưa build hoặc gửi bản không truy cập được API mới.
