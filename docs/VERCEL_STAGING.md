# Triển khai API staging trên Vercel Hobby

Phạm vi: staging cá nhân/phi thương mại, dùng **Neon và R2 hiện có**. Tài liệu
này chuẩn bị cấu hình; chưa triển khai, chưa chạy migration trên database hiện
tại, chưa tạo GitHub/Vercel secrets và chưa xác nhận APK hoạt động trên 4G.

## Ranh giới an toàn

- Vercel Hobby chỉ cho mục đích cá nhân/phi thương mại. Trước khi phục vụ người
  dùng trả phí hoặc mục đích thương mại, đánh giá lại gói/hosting.
- Không có database staging tách biệt theo lựa chọn hiện tại. Mọi tác vụ trên
  Vercel, kể cả import PDF, sẽ ghi vào Neon đang dùng. Chỉ thử với tài khoản và
  dữ liệu được phép, sao lưu trước khi chạy migration, và **không chạy seed**.
- GitHub Actions `schedule` có thể trễ hoặc bỏ lượt; đây là cơ chế quét phục hồi
  cho nhóm thử nghiệm, không phải queue có SLA. Mỗi lượt đánh thức tối đa một job.
- `maxDuration = 300` cần Fluid Compute. Kiểm tra nó đang bật trong Vercel
  Project Settings → Functions trước deploy. Nếu bị tắt, Hobby chỉ cho cấu hình
  ngắn hơn; không tự nâng gói. Job PDF/AI vượt 300 giây cần worker riêng.

## 1. Chuẩn bị tài khoản và OAuth

1. Trong Google Cloud project `551102657146`, Android OAuth Client phải có
   package `com.toeicminitrainer.app` và SHA-1 của EAS keystore
   `4F:4E:5C:C7:EA:EA:DF:0D:57:D3:44:F0:21:A4:11:DE:AE:5C:56:81`.
   Android Client ID dùng để đăng ký APK; native code xin ID token cho **Web**
   Client ID. Nếu đổi signing key hoặc phân phối qua Google Play, đăng ký thêm
   SHA-1 của APK/chứng chỉ tương ứng.
2. Khi có domain staging cố định, thêm chính xác
   `https://<domain>/api/auth/callback/google` vào Authorized redirect URIs
   của Web OAuth Client dùng cho web. Giữ các URI cũ còn cần dùng; không đưa
   Client Secret vào mobile. Nếu OAuth consent ở trạng thái Testing, thêm Gmail
   thử nghiệm vào Test users.
3. Xác nhận Neon/R2 hiện tại đã được sao lưu hoặc có phương án khôi phục trước
   khi cho staging ghi dữ liệu. Từ Neon Console lấy **pooled connection string**
   cho runtime Vercel (`-pooler` trong host); đừng tự sửa password/URL bằng tay.
   `.env` local đang dùng direct URL và được giữ nguyên. Dùng cùng database,
   chỉ khác endpoint kết nối.

## 2. Tạo Vercel project

- Import repository với **Root Directory là gốc repo**, không phải `mobile/`;
  framework Next.js. Dùng một domain ổn định cho API staging. `vercel.json`
  đặt Function region `sin1` (Singapore) và không khai báo Vercel cron.
- Workspace hiện chưa khai báo Git remote. Cần kết nối một GitHub repository
  (hoặc cung cấp remote sẵn có) trước khi Vercel Git import và GitHub Actions
  cron có thể hoạt động. Không tự tạo repo/commit/push thay chủ dự án.
- Bật Fluid Compute; kiểm tra deployment summary cho region `sin1` và thời
  lượng Function 300 giây. Không thay đổi gói Hobby tự động.
- Dùng Vercel **Production environment cho domain staging ổn định**. Không đưa
  `DATABASE_URL`/R2/Gemini secrets của Neon hiện tại vào Vercel Preview
  environments: preview deployments của nhánh/PR không được phép thao tác trên
  cùng dữ liệu. Không cấu hình migration trong Vercel Build Command.
- Build Command dùng `npm run build`, hiện chạy `prisma generate && next build`
  để tránh Prisma Client cũ trong cache Vercel. Không chạy seed/migrate tự động.

Thiết lập các biến sau trong Vercel Environment Variables (scope Production của
project staging), không commit giá trị vào Git:

| Nhóm | Biến |
| --- | --- |
| Neon | `DATABASE_URL` = pooled URL của **cùng** database hiện tại |
| Web OAuth/Auth.js | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL=https://<domain>` |
| Mobile API | `GOOGLE_MOBILE_WEB_CLIENT_ID` = Web Client ID cùng project, `MOBILE_JWT_SECRET` độc lập (ít nhất 32 ký tự) |
| AI | `GEMINI_API_KEY` |
| R2 private | `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`, `OBJECT_STORAGE_FORCE_PATH_STYLE` |
| Worker | `INGESTION_WORKER_SECRET` ngẫu nhiên, ít nhất 32 ký tự |

`GOOGLE_ANDROID_CLIENT_ID` là thông tin kiểm toán package/SHA-1; backend không
dùng nó làm audience. `APPLE_CLIENT_ID` chỉ cần khi bật luồng iOS. Không đặt
server secrets trong `EXPO_PUBLIC_*` hoặc GitHub workflow file. Không tự đặt
`NODE_ENV`; Vercel sẽ dùng production. CORS của R2 cho upload web phải cho phép
đúng origin staging, `PUT` và `Content-Type`; bucket vẫn private. Lifecycle
chỉ xóa prefix `pending/`, không xóa `ready/`.

## 3. Migration và kiểm tra staging

Migration index mới ở `prisma/migrations/20260927120000_add_foreign_key_indexes/`
**chưa được chạy**. Sau khi xem diff, xác nhận backup/khả năng restore và chọn
thời điểm phù hợp, người vận hành chạy thủ công `npx prisma migrate status`,
rồi `npx prisma migrate deploy` từ môi trường tin cậy trỏ đúng Neon. Không dùng
`migrate dev`, `db push` hoặc `db seed` trên database này. Nếu chưa có backup,
dừng tại đây và không mở staging ghi dữ liệu.

Sau deploy, kiểm tra:

1. `GET /api/internal/ready` với `Authorization: Bearer <INGESTION_WORKER_SECRET>`
   trả `{ "ready": true }`; 401 khi thiếu/sai secret, 503 khi Neon/R2 không sẵn
   sàng. Endpoint không trả credentials hay chi tiết kết nối.
2. Trên điện thoại qua 4G, API dùng HTTPS hợp lệ; thử Google login, tạo/nộp bài,
   xem lịch sử và file R2 bằng tài khoản thử nghiệm. Không coi build thành công
   là bằng chứng cho bước này.
3. Ghi deployment ID, commit SHA, region, URL, kết quả kiểm tra và cách rollback
   bản code. Rollback code không tự rollback migration; chỉ dùng migration mới
   đã review hoặc restore từ backup khi thật sự cần.

## 4. GitHub Actions quét job PENDING

Workflow `.github/workflows/ingestion-worker.yml` chạy mỗi giờ vào phút 17
(và cho phép chạy tay; giảm tần suất để tiết kiệm GitHub Actions trên repo
private), kiểm tra readiness rồi gọi
`POST /api/internal/ingestions/drain` qua HTTPS. Nếu Neon/R2 không sẵn sàng,
workflow dừng trước khi claim job. Tạo hai repository secrets trong GitHub Actions
trước khi bật lịch:

- `INGESTION_WORKER_URL` = `https://<domain>/api/internal/ingestions/drain`.
- `INGESTION_WORKER_SECRET` = **cùng giá trị** với Vercel, không phải
  `MOBILE_JWT_SECRET` hay `NEXTAUTH_SECRET`.

Trong GitHub Billing → Budgets and alerts, chủ tài khoản đặt giới hạn chi tiêu
Actions ở mức $0 nếu giao diện cho phép và bật **Stop usage when budget limit is
reached** cùng cảnh báo dùng hết quota. Giới hạn này phải được xác nhận trên tài
khoản GitHub; cấu hình workflow trong repo không thể tự áp đặt ngân sách.

Endpoint yêu cầu Bearer secret, tìm job PENDING cũ nhất và dùng `after()` để
chạy nó trong giới hạn Function. Job PROCESSING bị ngắt quá 10 phút được đưa
về PENDING nếu còn lượt; job đã đủ 3 lượt được đánh FAILED. Việc claim PENDING
trong database là atomic nên lệnh gọi trùng không chạy cùng job hai lần.
Theo dõi workflow thất bại, job FAILED và thời gian chờ PENDING; GitHub không
bảo đảm lịch chạy đúng phút hoặc không bỏ lượt. Workflow chỉ hoạt động theo
lịch sau khi file có trên default branch và secrets được cấu hình.

## 5. EAS APK preview

Trong EAS environment `preview` của `mobile/eas.json`, đặt
`EXPO_PUBLIC_API_URL=https://<domain>` và
`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` bằng Web Client ID project `551102657146`.
Android Client ID mới có thể ghi ở `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` để
kiểm toán; native Android dùng Web ID trong `configure()`. Build lại APK sau
khi thêm native module; `.env.local` trên máy không phải nguồn cấu hình của
EAS cloud build. Kiểm tra APK khi Metro và máy tính đã tắt.

Nguồn tham khảo: [Vercel Function limits](https://vercel.com/docs/functions/limitations),
[Vercel Hobby terms](https://vercel.com/legal/terms),
[Vercel region configuration](https://vercel.com/docs/functions/configuring-functions/region),
[Prisma trên Vercel](https://www.prisma.io/docs/orm/v7/prisma-client/deployment/serverless/deploy-to-vercel),
[GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
