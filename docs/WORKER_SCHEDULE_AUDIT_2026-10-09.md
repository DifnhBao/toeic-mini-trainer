# Đọc lại lịch worker trước rollout — 09/10/2026

Đợt này chỉ đọc workflow, lịch chạy, job và log đã có; không dispatch/rerun, không gọi POST worker hoặc thay Vercel/GitHub secret. Khóa gốc không còn bản trên máy không đồng nghĩa khóa đã mất ở server/GitHub. Bản kiểm tra readiness với khóa riêng được ghi ở `RELEASE_CANDIDATE_FFE179E_2026-10-09.md` và không thay bằng chứng cron thật.

## Bằng chứng

Remote `master` có `.github/workflows/ingestion-worker.yml`, blob `b312744892bad1927b2217ec473cbef687d09b5a`; lịch khai báo phút 17 mỗi giờ. Workflow lấy WORKER_URL/WORKER_SECRET từ hai GitHub secret, GET `/api/internal/ready`, chỉ khi HTTP ok mới POST worker; redirect bị từ chối và có timeout. Hiện script không kiểm tra JSON `ready=true`, không lưu receipt body worker.

API collection Actions lọc event=schedule tại khoảng 22h14 Việt Nam trả năm lượt gần nhất, cùng source master `5e0ebc8893bace680700dcaa52dd43c80487ce6a`:

| Run | Thời gian tạo UTC | Kết quả |
| --- | --- | --- |
| 37908880706 | 09/10 09:04:04 | success |
| 37873245577 | 09/10 02:09:46 | success |
| 37846018390 | 08/10 21:20:01 | success |
| 37802206388 | 08/10 15:36:52 | success |
| 37743276785 | 08/10 07:24:54 | success |

Đọc riêng [run 37908880706](https://github.com/DifnhBao/toeic-mini-trainer/actions/runs/37908880706): job drain `113748929226`, ba bước completed/success. Log có script thực thi kiểm tra HTTP readiness và worker, URL/secret bị GitHub mask. Điều này chứng minh lượt 16h04 Việt Nam không gặp lỗi HTTP theo script ở URL đã cấu hình, **không chứng minh** URL secret là domain/deployment hiện đang nghiệm thu, có job được xử lý, nội dung OCR đúng hoặc body paused/queued ra sao. Không tải/decrypt khóa hoặc commit raw log.

Năm lượt đọc được có khoảng cách nhiều giờ dù cron khai báo giờ/lần; chưa xác định nguyên nhân hoặc trạng thái enabled hiện tại. Công cụ không hỗ trợ endpoint metadata workflow được thử, nên không coi đó là chứng cứ workflow bị tắt. [GitHub Docs về schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) xác nhận lịch có thể trễ hoặc bị bỏ khi tải cao và chạy trên nhánh mặc định. Đó là khả năng chung, không phải chẩn đoán nguyên nhân của repository này.

## Cổng còn mở

1. Xác nhận URL worker trỏ môi trường mong muốn và khóa server/GitHub tương ứng, không cần gửi giá trị khóa vào chat. Chưa xoay khóa cũ; nếu cần phục hồi quyền vận hành/escrow thì chuẩn bị cập nhật hai bên và điểm rollback được duyệt riêng.
2. Lượt worker thật mới cần quyền phù hợp vì POST có thể ghi trạng thái job/counter và gọi provider. Không dispatch chỉ để đổi trạng thái “chưa kiểm chứng”. Cần receipt an toàn gồm readiness/body paused/queued và kết quả job, không log PDF/transcript/key/response thô.
3. Trước đổi domain, tạm dừng tác vụ AI cũ và xác nhận invocation cũ kết thúc theo runbook fence/cache. HTTP 200 hoặc cron lịch sử success không thay cổng này.
4. Chưa cam kết phục hồi trong một giờ: một lượt chỉ xử lý lượng job giới hạn, lịch thực tế chưa chứng minh giờ/lần. Cần đo job tuổi lớn nhất/backlog, cảnh báo quá hạn và người xử lý trước beta; không tự bật dịch vụ báo lỗi hoặc gửi thông báo bên ngoài.
