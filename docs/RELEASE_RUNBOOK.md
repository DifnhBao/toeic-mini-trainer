# Quy trình kiểm chứng và phát hành

Ngày cập nhật: 08/10/2026. Dành cho Android + web/API của TOEIC Mini Trainer.

## 1. Cổng kiểm tra trước deploy

1. `npm ci` và `npx prisma generate`.
2. `npm test`, `npm run typecheck`, `npm run typecheck:mobile`, `npm run lint`.
3. Kiểm tra dependency: `npm run audit:dependencies -- --project web`, `npm run audit:dependencies -- --project mobile`, `npm audit --omit=dev --audit-level=high`. Các ngoại lệ công cụ có hạn đến 22/10/2026 trong `DEPENDENCY_SECURITY_2026-10-08.md`.
4. `npm run build` (Webpack); `cd mobile` rồi `npx expo export --platform android --source-maps --output-dir dist-android` và `npm --prefix .. run check:mobile-bundle`.
5. Chạy test tích hợp theo mục 2; chỉ sau khi đạt mới deploy/build APK.
6. Ghi Git SHA, migration status, deployment ID, EAS build ID và kết quả vào biên bản. Bundle export chưa phải APK hoặc nghiệm thu thiết bị.

Workflow `quality.yml` có ba job web/integration/mobile; không dùng secret production. PostgreSQL service chỉ tồn tại trong job. CI phải được bật và kiểm tra trên GitHub; có file workflow chưa chứng minh CI đã chạy hoặc branch protection đã được cấu hình.

## 2. Test PostgreSQL cách ly trên Windows

Yêu cầu Docker đã cài và chạy. Không dùng database hiện tại hoặc `.env` làm đích test.

```powershell
docker run --detach --name toeic-release-test-20261008 --publish 127.0.0.1:55432:5432 --env POSTGRES_USER=test --env POSTGRES_PASSWORD=test --env POSTGRES_DB=toeic_release_test postgres:16
$env:DATABASE_URL = 'postgresql://test:test@127.0.0.1:55432/toeic_release_test?sslmode=disable'
$env:TEST_DATABASE_URL = $env:DATABASE_URL
$env:ALLOW_INTEGRATION_TEST_DATABASE = 'true'
npx prisma migrate deploy
npm run test:integration
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-local-backup.ps1
```

Các giá trị user/password trên chỉ là fixture Docker, không dùng cho cloud. Integration runner chỉ chấp nhận loopback, tên DB chính xác `toeic_release_test` và opt-in; không fallback sang `.env`, không reset/seed/truncate. Fixture được dọn theo UUID do chính lượt test tạo. Sau khi xong có thể dừng container test bằng `docker stop toeic-release-test-20261008`.

Backup smoke test tạo dữ liệu học mẫu, dump trong container, restore vào DB mới có tên ngẫu nhiên, kiểm tra số lượng và quan hệ user/question/attempt/answer, rồi dọn DB restore và fixture. Kết quả này chỉ chứng minh quy trình trên PostgreSQL local; không chứng minh backup Neon hoặc R2 đã được bật.

## 3. Cấu hình production/staging

- API HTTPS, database và bucket private theo `.env.example`.
- `AI_DAILY_GLOBAL_CALL_LIMIT`: số lượt provider tối đa/ngày UTC trên toàn ứng dụng; mặc định 200. Lỗi cấu hình hoặc không ghi được counter phải chặn tác vụ.
- `AI_MAX_CONCURRENT_CALLS`: tối đa request AI đồng thời dùng chung DB, mặc định 3 (1–20). SDK chỉ một HTTP attempt; deadline/lease và job bận chờ lại được mô tả trong `AI_CAPACITY_2026-10-08.md`.
- `AI_ENABLED=false`: tạm ngừng gọi model; `INGESTION_ENABLED=false`: dừng phân tích tài liệu. Cache lời giải sẵn có vẫn có thể được đọc sau kiểm tra quyền.
- Quota cá nhân: coach/explain 20/ngày mỗi loại, ingestion 3 job/ngày (ADMIN 10). Worker dự trữ thêm lượt toàn hệ thống trước mỗi gọi Gemini, gồm retry. Lượt thất bại có thể vẫn tiêu thụ quota để tránh retry tạo chi phí không giới hạn.
- Giới hạn số lượt không phải trần tiền. Người vận hành phải đặt cảnh báo/ngân sách tại provider, đo token/cost thực tế và thống nhất mức chi tiêu trước mở rộng.
- Limiter production dùng `user_ai_usage` với key namespace `rate:v1:`; mỗi cửa sổ dùng atomic upsert. Header IP không nằm trong key của user đã xác thực. Counter hết hạn được worker dọn.
- Vercel dùng header IP do edge cấp. Self-hosting chỉ đặt `TRUSTED_CLIENT_IP_HEADER` khi proxy ghi đè header đó và không cho truy cập thẳng API. Không có proxy tin cậy thì guest/auth ẩn danh dùng chung quota bảo thủ.
- Không cần migration mới cho những sửa đổi ngày 08/10; cần tất cả 11 migration hiện có đã áp dụng trên môi trường đích. Kiểm tra backup/migration status trước rollout; không chạy seed trên database thật.
- Google/Apple mới không được tự ghép vào user cũ chỉ bởi email trùng; trả `ACCOUNT_LINK_REQUIRED`. Đăng nhập bằng provider ban đầu. Chưa có UI tự liên kết provider mới.

Tham chiếu proxy: [Vercel request headers](https://vercel.com/docs/headers/request-headers). Runtime mobile theo [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) (CI Node 22).

## 4. Trình tự rollout

1. Chốt commit đã qua kiểm tra, bảo đảm env/server schema tương thích và có điểm phục hồi dữ liệu.
2. Deploy API/web trước mobile. Trước upload, lưu dry-run manifest Vercel vào `Test/vercel-deploy-dry.json` và chạy `npm run check:vercel-payload` để kiểm tra secret bị loại và source ứng dụng không bị thiếu. Dùng `--prod --skip-domain` để kiểm tra deployment trước chuyển domain chính. Chạy `STAGING_API_URL=https://... node scripts/staging-smoke.mjs` bằng cú pháp đặt env của shell đang dùng. Chương trình chỉ đọc/kiểm tra các API không đăng nhập, không gọi AI hoặc tạo dữ liệu học.
3. Đăng nhập tài khoản test và xác minh GET ingestion list có tác vụ chính chủ, detail có `reviewProtocol = 1`. API list trả 405 nghĩa là server cũ chưa có chức năng này.
4. Build EAS Android preview từ đúng SHA, dùng signing sẵn có và `--freeze-credentials`; không auto-submit store. API URL trong APK phải trỏ deployment vừa nghiệm thu.
5. Trên Android thật, thực hiện MR-01…MR-14 trong `MOBILE_QUESTION_REVIEW.md`, QA-A…QA-E và vòng học qua 4G khi Metro tắt. Ghi build/API SHA, loại thiết bị/mạng và kết quả; không lưu token/signed URL/secret.
6. Chỉ mở beta được mời sau khi các luồng chính và phục hồi lỗi đạt. Không coi CI/build xanh là bằng chứng nghiệm thu APK.

## 5. Giám sát và xử lý sự cố

Nền đã có: readiness có secret, cron worker, trạng thái job, quota và audit. `instrumentation.ts` phát sự kiện JSON `server.request.failed` cho lỗi Next.js không được xử lý, chỉ có route template/method/error type, không có nội dung request hoặc secret. Lỗi đã được route bắt vẫn cần được theo dõi qua HTTP status/job code và log có sẵn.

Cần cấu hình thực tế trên hạ tầng: cảnh báo 5xx, readiness hỏng, job quá hạn, lỗi storage, mức dùng AI và ngân sách; người nhận/kênh trực phải được chỉ định. Chưa có Sentry/OTel hay thông báo ra ngoài được bật tự động.

| Sự cố | Xử lý |
| --- | --- |
| AI lỗi/chi phí tăng | Tắt `AI_ENABLED`, redeploy cấu hình; kiểm tra quota ngày/provider; giữ cache và vòng học không AI |
| Nhập tài liệu lỗi nhiều | Tắt `INGESTION_ENABLED`; kiểm tra errorCode và khoảng trang; không tự tạo lại job hàng loạt |
| DB/limiter lỗi | API limiter trả 503 với Retry-After, không tiếp tục tác vụ; kiểm tra kết nối/pool và readiness |
| Job PROCESSING treo | Worker có secret thu hồi sau 10 phút, tối đa ba lần thử; kiểm tra cron trước khi retry thủ công |
| Import mất phản hồi | Kiểm tra job/attempt cùng mã, retry cùng clientSubmissionId; không tạo mã mới để thử lại cùng lần nộp |
| Bản deploy có lỗi | Dừng mở thêm user; rollback Vercel về deployment đã biết tốt; mobile mới phải kiểm tra protocol và chặn ghi vào API cũ |
| Mất dữ liệu | Ngừng tác vụ ghi nếu cần; restore vào môi trường cách ly trước, kiểm tra user/question/attempt/media rồi mới chuyển traffic |

Mục tiêu vận hành đề xuất: RPO ≤24 giờ, RTO ≤4 giờ. Cần nghiệm thu Neon backup và lifecycle/khôi phục R2 riêng; dump DB không chứa file PDF/audio. Backup phải có quyền hạn chế, thời hạn lưu và cảnh báo quá hạn. Không đưa backup/secret vào Git.

## 6. Những điều chưa được coi là hoàn tất

- Backup/cloud restore, cảnh báo và dashboard chi phí trên tài khoản thật.
- APK/Google OAuth, upload/OCR/audio thật của build mới trên điện thoại.
- Bộ nội dung có quyền sử dụng đủ cho beta và người kiểm duyệt.
- Beta 10–20 người trong hai tuần; chính sách xóa dữ liệu, support và hồ sơ store.
- Sửa/gửi lại đóng góp bị từ chối, editor câu đã xuất bản, version tối thiểu APK, offline đầy đủ và iOS.
