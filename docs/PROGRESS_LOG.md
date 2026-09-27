# Progress log — bằng chứng thực hiện

Mỗi lần hoàn thành một mốc công việc sẽ ghi thêm một mục ở đầu file này, kèm
bằng chứng có thể kiểm chứng lại (hash commit, lệnh đã chạy, kết quả).

## 2026-09-26 — Chuyển luồng phát triển sang mobile-first (chưa commit)

- Xác định màn đăng nhập mobile không hiển thị nút Google vì chưa có
  `mobile/.env.local` và chưa cấu hình Android OAuth Client ID; backend hiện mới
  có Google Client ID cho web.
- Theo tài liệu Expo SDK 57, OAuth/OIDC local không thể kiểm thử đúng trong Expo
  Go vì app không sở hữu custom scheme. Đã thêm `expo-dev-client`, profile EAS
  development/preview/production và các script chạy Development Build Android.
- Màn đăng nhập nhận biết Expo Go và giải thích rõ đây chỉ là môi trường xem trước;
  Development Build có cấu hình OAuth mới hiển thị nút đăng nhập Google.
- Cập nhật `mobile/README.md` với package Android
  `com.toeicminitrainer.app`, yêu cầu SHA-1/OAuth Client ID, API URL truy cập được
  từ điện thoại và quy tắc giữ `MOBILE_JWT_SECRET` ở backend.
- Kiểm tra: `npx tsc --noEmit` → exit 0; `npm run lint` → exit 0;
  `npx expo config --type public` → exit 0, SDK 57 nhận đúng scheme/package.
- Chưa tạo EAS project, chưa build lên cloud và chưa điền Client ID vì các bước
  này cần tài khoản Expo/Google Cloud của chủ dự án. Không in hoặc commit secret.

## 2026-09-26 — E2E Giai đoạn 5 (chưa commit, base `0a097a9`)

- B0: user tự đăng nhập Google tại `/admin/extract`; giao diện hiện `Đăng xuất`.
  Các request E2E sau đó dùng session cùng `ownerId`; không ghi cookie hoặc secret
  vào log.
- B1 (phiên trước, theo `Test/HANDOFF-E2E.md`): PDF `e2e-questions.pdf`:
  `POST /api/v1/uploads` **201**, PUT từ browser sang R2 **200**, complete **200
  READY**; asset `717ead5f-45a9-4cd4-8e50-68301f18e8d4`.
- B2: UI upload `sample-audio.wav` (8.044 byte): intent **201**, complete **200
  READY**; audio asset `772d1a7d-aea3-47fc-ad7b-8bd521c2260c`. Mã PUT của
  lần upload UI không được ghi riêng; B5 xác minh object bằng signed GET **200**,
  kích thước và SHA-256 khớp file local.
- B3: job `f8ea9fae-c4fb-4d7f-a569-0540f93c84ef` từ PDF text layer hợp lệ:
  create **202**, poll **200 COMPLETED**, 1 nhóm/5 câu Part 5. Job Part 3 có
  audio `c3db080b-59a9-4992-8ed5-99920712fab3`: create **202**, retry **202**,
  poll **200 COMPLETED**, 1 nhóm/3 câu và `audioAssetId` đúng. Hai lỗi ban đầu
  đã được chẩn đoán: `DOCUMENT_PARSE_FAILED` do `pdf-parse` nhận `Buffer` không
  ổn định với PDF nhỏ (đổi sang `Uint8Array` thuần); `AI_EXTRACTION_FAILED` do
  schema Gemini chưa bắt buộc `options.A/B/C/D` (đã bổ sung). PDF gốc và PDF rỗng
  đều đọc đúng sau sửa byte đầu vào. Xác nhận riêng trên asset PDF B1 gốc:
  job `aa9d6877-9032-4be2-8f44-e8e8d3747889` create **202**, poll **200
  COMPLETED**, 1 nhóm/5 câu Part 5 (không import lần nữa để tránh trùng nội dung).
- B4: `POST /api/v1/ingestions/f8ea9fae-c4fb-4d7f-a569-0540f93c84ef/import`
  → **200**, `questionsAdded: 5`; gọi lại → **200**, `alreadyImported: true`.
  Truy vấn Prisma trước/giữa/sau cho Part 5 của chủ tài khoản: **0 → 5 → 5**;
  5 câu có `ownerId` đúng và đủ lựa chọn A–D. Import job Part 3 → **200**,
  `questionsAdded: 3`; DB có 1 `question_group` cùng `ownerId`, đúng
  `audioAssetId`, chứa 3 câu Part 3 cùng chủ tài khoản.
- B5: `POST /api/mini-tests/generate` Part 5, limit 10 → **201**; GET bài
  `59fb1c02-2981-49ff-bf37-e7576ddb745e` → **200**, 10 câu Part 5; submit
  → **200**, điểm 3/10. Part 3, limit 50 → **201**; GET bài
  `e7a0cfa7-f700-4ddd-aeda-7679e6b3fa4e` → **200**, 3 câu đều có media
  R2 ký tạm và chỉ chọn câu công khai/thuộc chủ tài khoản. URL dùng
  `AWS4-HMAC-SHA256`, `X-Amz-Expires=3600`, không phải `/uploads/`; signed GET
  audio → **200**, 8.044 byte, SHA-256 khớp `Test/sample-audio.wav`; submit
  → **200**, điểm 1/3. Không lưu URL ký tạm trong log.
- B6: upload `e2e-empty.pdf` 559 byte: intent **201**, PUT **200**, complete
  **200 READY**, create job **202**, poll **200 FAILED** với
  `DOCUMENT_TEXT_EMPTY`. File giả 16 byte bắt đầu `MZ` khai báo PDF: intent
  **201**, PUT **200**, complete **422 ASSET_VALIDATION_FAILED**; DB ghi
  `REJECTED/SIGNATURE_MISMATCH`, R2 HEAD object → **404**. GET asset UUID lạ
  → **404 ASSET_NOT_FOUND**; POST upload không auth → **401 UNAUTHORIZED**.
  PUT bằng URL upload có TTL 300 giây sau 325 giây → R2 **403**.
- Kiểm tra: `npm test` → **11/11**; `npx tsc --noEmit` → exit 0;
  `npx eslint app/lib/toeic-ingestion.ts next.config.ts` → exit 0;
  `npm run build` → exit 0; `git diff --check` → exit 0. Đã đọc hướng dẫn
  Next 16.3.5 trong `node_modules/next/dist/docs/` trước khi sửa code;
  `next dev` chạy route E2E trên port 3000. `AGENTS.md` được `next dev` tự bổ
  sung rule block; thay đổi này được giữ nguyên để user duyệt cùng diff.
  Chưa commit, chưa chạy migration/reset.

## 2026-09-22 — Chốt Giai đoạn 5 vào Git

- Commit `256440a` `feat(api,web,mobile): giai doan 5 - object storage rieng tu
  va pipeline nhap pdf/audio` — 46 file (+2.682/−169), gồm toàn bộ 5A + 5B:
  7 route upload/ingestion, 5 thư viện storage/import, tab Tài liệu mobile,
  2 migration (vẫn **chưa áp dụng** lên database) và 2 bộ unit test.
- Cổng kiểm tra chạy lại ngay trước khi commit (2026-09-22):
  `npm test` → **11/11** đạt; `npx tsc --noEmit` (web) và `npx tsc --noEmit
  -p mobile` → exit 0; `npm run lint` → 0 finding trong file Giai đoạn 5
  (11 error + 4 warning còn lại đều thuộc file local bị Git bỏ qua
  `/Test/*.js` hoặc file tồn từ commit trước, nằm ngoài phạm vi).
- An toàn trước khi commit: `git check-ignore` xác nhận `.env`, `mobile/.env`,
  `/public/uploads/`, `/Test/`, `mobile/dist-android/` đều bị bỏ qua; quét
  pattern credential (AKIA/AIza/private key/SECRET=giá trị) trên toàn bộ
  diff + file mới → sạch (chỉ có fixture giả lập trong unit test).
- Production build và export Android/iOS không chạy lại: bằng chứng ngày
  2026-09-21 (mục 5A/5B trên) vẫn còn hiệu lực vì cây làm việc không đổi
  giữa hai thời điểm — audit read-only đã xác nhận.
- Việc tiếp theo (theo thứ tự ưu tiên): cấp bucket R2/S3 thật + CORS +
  lifecycle `pending/` 24 giờ → chạy 2 migration qua deployment job →
  kiểm thử E2E PDF/audio thật trên web → test thiết bị Android/iOS thật.

## 2026-09-21 — Giai đoạn 5B (pipeline nhập PDF/audio web + mobile)

### 1. Pipeline có trạng thái và kiểm soát quyền sở hữu

- Thêm `IngestionJob` cùng migration `20260921190000_add_ingestion_jobs`
  (**chỉ tạo để review, chưa chạy lên database**). Tác vụ có trạng thái
  `PENDING/PROCESSING/COMPLETED/IMPORTING/IMPORTED/FAILED`, giới hạn ba lần thử
  và cơ chế phục hồi tác vụ bị treo.
- Web session và mobile Bearer token dùng chung lớp xác thực; nếu request đã gửi
  Bearer token sai thì server không fallback sang cookie.
- PDF/audio chỉ được xử lý khi asset thuộc đúng tài khoản và đã qua xác minh
  `READY`. AI coi text PDF là dữ liệu không tin cậy, giới hạn 30.000 ký tự; JSON
  đầu ra bị kiểm tra chặt Part 1–7, đáp án A–D, số lựa chọn, URL/asset và tối đa
  500 câu trước khi ghi database.
- Import dùng claim nguyên tử `COMPLETED → IMPORTING` và transaction, nên bấm
  lặp không tạo câu hỏi trùng. Câu hỏi/nhóm câu hỏi nhập mới được gắn chủ sở
  hữu và không đi vào bài của tài khoản khác; câu seed cũ `ownerId = null` vẫn
  dùng chung. Các API bài làm chỉ phát URL media ký tạm thời sau khi kiểm tra
  lại quyền sở hữu asset.

### 2. Trải nghiệm web và mobile

- Trang web nhập tài liệu và tab mobile `Tài liệu` cùng thực hiện: xin quyền
  upload → PUT trực tiếp vào object storage → xác minh → tạo/poll tác vụ AI →
  xem trước → xác nhận nhập.
- Mobile dùng API file native của Expo SDK 57; giới hạn file được kiểm tra cả ở
  client lẫn server. Dashboard có lối tắt đến tab tài liệu.
- Endpoint local legacy `/api/extract-ai` và `/api/admin/upload-image` trả `410`
  ở production. `/public/uploads/` được Git bỏ qua để tránh commit nhầm tài liệu
  cá nhân; đường dẫn cũ chỉ còn tương thích local.

### 3. Bằng chứng kiểm thử

- `npm test` → **11/11** test đạt: policy upload/magic bytes/signed headers và
  schema import/URL ngoại/answer key/số lựa chọn.
- `npx prisma format --check`, `validate`, `generate` → đạt; `npx tsc --noEmit`
  cho web và mobile → đạt.
- Lint mobile → đạt. ESLint cho toàn bộ file Giai đoạn 5 → 0 error; còn một
  cảnh báo có chủ đích cho `<img>` dùng URL private ký tạm thời ở trang kết quả.
- `npm run build` → production build thành công và nhận đủ route upload,
  ingestion, retry, import. Expo Doctor → **21/21**; export Android và iOS đều
  thành công.
- Production smoke test: 5 route upload/ingestion và 3 route tạo/đọc/nộp bài
  web không token đều trả `401`; hai route upload local legacy trả `410`.
- `npm audit` mobile → 0 vulnerability. Root vẫn có baseline **4 high, 0
  critical** trong Prisma CLI/mysql transitive; `npm audit fix --force` đề nghị
  downgrade Prisma major nên không tự áp dụng.

### 4. Việc vận hành còn lại (không tự động thực hiện)

- Cấp bucket private/credentials thật, CORS tin cậy và lifecycle xóa `pending/`
  sau 24 giờ; sau đó kiểm thử E2E bằng PDF/audio thật.
- Review và chạy hai migration Giai đoạn 5 trong deployment job.
- Kiểm thử trên thiết bị Android/iOS thật. Production host phải hỗ trợ Next.js
  `after()`/`waitUntil`; nếu không, chuyển processor sang queue/worker bền vững.

## 2026-09-21 — Giai đoạn 5A (nền object storage riêng tư)

### 1. API upload S3/R2 an toàn theo hai vùng

- Thêm `UploadedAsset` gắn `ownerId`, trạng thái `PENDING/READY/REJECTED` và
  migration `20260921170000_add_uploaded_assets` (mới tạo để review, **chưa chạy
  lên database**).
- `POST /api/v1/uploads`: Bearer auth, rate limit, allow-list MIME/kích thước,
  object key ngẫu nhiên, URL PUT 5 phút; `Content-Length` được ký cùng request.
- `POST /api/v1/uploads/:id/complete`: kiểm tra chủ sở hữu, kích thước và MIME
  thực tế bằng HEAD, kiểm tra magic bytes bằng conditional GET/ETag. File đạt
  được conditional-copy từ `pending/` sang `ready/`; file giả mạo bị xóa và
  đánh dấu `REJECTED`.
- `GET /api/v1/uploads/:id`: chỉ cấp URL GET 60 phút cho file `READY` thuộc đúng
  chủ sở hữu. Credentials và object key không đi vào mobile bundle.
- Luồng web cũ chưa bị thay thế; cấu hình thiếu sẽ trả `503 STORAGE_UNAVAILABLE`
  thay vì tự rơi về public/local storage.

### 2. Kiểm chứng

- `npx prisma format`, `npx prisma validate`, `npx prisma generate` → đạt.
- `npm test` → 6/6 test upload policy đạt (MIME, giới hạn size, magic bytes,
  metadata filename, tách namespace `pending/ready`, header được ký).
- `npx tsc --noEmit` → exit 0.
- ESLint theo toàn bộ file mới/sửa của Giai đoạn 5A → exit 0.
- `npm run build` → production build thành công, nhận đủ 3 route upload mới.
- Production smoke test cả 3 route không token → `401 UNAUTHORIZED`.
- `npm audit` → không phát sinh advisory từ AWS SDK; baseline vẫn 4 high trong
  Prisma CLI/dependency MySQL không được app PostgreSQL sử dụng, 0 critical.

### 3. Việc còn lại của Giai đoạn 5

- Tạo bucket/credentials thực tế và CORS/lifecycle cho prefix `pending/`.
- Chạy migration qua deployment job sau khi review.
- Nối màn hình upload web/mobile với API mới và dùng asset ID trong pipeline
  extract/import.
- Chuyển extraction dài sang background job có retry và trạng thái tiến độ.

## 2026-09-21 — Chốt hiện trạng + Giai đoạn 4 (AI Coach mobile)

### 1. Vệ sinh Git trước khi commit

- Thêm vào `.gitignore` (root): `/Test/`, `/mobile/dist-android/`, `/mobile/dist-ios/`.
- Sửa `mobile/.gitignore`: thêm `dist-android/`, `dist-ios/`; bỏ dòng `example` lạc đề.
- Kiểm chứng bằng `git check-ignore -v`:
  - `.env` → khớp rule `.gitignore:34:.env*` (không bao giờ bị commit).
  - `Test/READING.pdf` → khớp `/Test/`.
  - `mobile/dist-android/assets/...` → khớp `dist-android/`.
- Quét secret toàn bộ file sẽ commit (regex API key Google `AIza...`,
  connection string `postgres://`, `sk-...`): **0 kết quả**.

### 2. Chốt hiện trạng bằng 4 commit logic

Trước khi làm việc, toàn bộ source chỉ nằm trong working tree (repo có duy nhất
commit scaffold `336bbaa`).

| Commit | Nội dung |
| --- | --- |
| `53c1054` | chore: bỏ qua tài liệu test cục bộ và build output mobile |
| `2223164` | feat(web): app luyện TOEIC core — pages, web API, NextAuth, Prisma + 2 migration đầu, security headers |
| `113bd31` | feat(api): API v1 cho mobile — Bearer JWT, refresh rotation, 2 migration mobile sessions |
| `0d34383` | feat(mobile): app Expo giai đoạn 1–3 |

Kiểm chứng: `git log --oneline` và `git status` sạch (chỉ còn `docs/` chờ commit
cuối buổi).

### 3. Giai đoạn 4 — AI Coach trên mobile

File mới:

- `app/api/v1/ai/coach/route.ts` — chat Bearer: giới hạn 12 lượt × 2.000 ký tự,
  tin cuối phải là câu hỏi, rate limit 10 req/phút/người, Gemini `gemini-2.5-flash`
  với system instruction (giữ nguyên prompt giáo viên của bản web).
- `app/api/v1/ai/explain/route.ts` — chữa câu sai: kiểm tra quyền sở hữu qua
  `attempt.userId`, cache-first theo `AiExplanation`, chỉ sinh lời giải cho câu sai,
  rate limit 30 req/phút/người, prompt/JSON schema giống bản web.

File sửa:

- `mobile/src/app/(tabs)/coach.tsx` — thay màn placeholder bằng chat thật: bong
  bóng hội thoại, chọn trọng tâm (Tổng hợp/Ngữ pháp/Từ vựng/Chiến thuật), câu hỏi
  gợi ý, trạng thái gửi/lỗi. Lịch sử hội thoại chỉ nằm trong memory của phiên,
  đúng quyết định "không lưu hội thoại ở MVP".
- `mobile/src/app/result/[id].tsx` — nút "Chữa câu này bằng AI" cho câu sai chưa
  có lời giải cache; lời giải trả về được ghi thẳng vào state của attempt.
- `mobile/src/types/learning.ts` — thêm `CoachTurn`, `CoachResponse`, `ExplainResponse`.
- `docs/MOBILE_ROADMAP.md` — giai đoạn 3 đánh dấu "complete in source", giai đoạn 4
  "complete in source, pending device testing".

### 4. Bằng chứng kiểm thử

- Typecheck web sau thay đổi: `npx tsc --noEmit` → **exit 0** (baseline trước đó cũng exit 0).
- Typecheck mobile: `cd mobile && npx tsc --noEmit` → **exit 0**.
- Smoke test trên `next dev -p 3199` (đã dừng server sau khi test):
  - `POST /api/v1/ai/coach` không token → **401** `{"error":{"code":"UNAUTHORIZED",...}}`
  - `POST /api/v1/ai/explain` không token → **401** cùng envelope.
  - `POST /api/v1/ai/coach` với `Authorization: Bearer fake.token.here` → **401**
    (JWT bị từ chối đúng, không lọt vào logic AI).

Chưa kiểm thử được (cần thiết bị thật / token hợp lệ / tốn lượt Gemini): luồng
chat đầy đủ và sinh lời giải thật. Đây là việc còn lại khi chạy thử trên máy.

### 5. Rủi ro đã biết, chưa xử lý (thừa nhận trong roadmap)

- Rate limit in-memory chỉ đúng với 1 instance — production cần store dùng chung.
- Hai request explain đồng thời cho cùng một câu có thể đua nhau tạo `AiExplanation`
  (unique constraint sẽ chặn bản thứ hai, client nhận 503 và thử lại được).
- Audio/ảnh vẫn nằm `public/uploads` — chưa chuyển object storage.
