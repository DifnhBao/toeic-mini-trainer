# Progress log — bằng chứng thực hiện

Mỗi lần hoàn thành một mốc công việc sẽ ghi thêm một mục ở đầu file này, kèm
bằng chứng có thể kiểm chứng lại (hash commit, lệnh đã chạy, kết quả).

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
