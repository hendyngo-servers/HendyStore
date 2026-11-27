# Hendy Store

Nền tảng App Store miễn phí, ưu tiên triển khai đa môi trường.

## Tech Stack — công nghệ đang dùng

| Lớp | Công nghệ hiện tại | Vai trò / trạng thái |
|---|---|---|
| Database | PostgreSQL trên Neon | Lưu ứng dụng, tài khoản, phiên bản, đánh giá, thư viện và lịch sử tải |
| File storage | Neon Object Storage (S3-compatible) | Bucket private hendy-store-files, lưu ảnh và package; backend dùng AWS SDK S3 |
| CDN / Edge | Cloudflare Workers / Pages proxy | Có mã proxy trong cloudflare/; chỉ thành edge/CDN production sau khi cấu hình ORIGIN_URL, DNS và deploy |
| Backend / API | PHP 8.4 + Apache, PDO | API nghiệp vụ tại api.php; chạy Docker trên Render hoặc PHP hosting/VPS |
| Frontend | HTML, CSS, JavaScript | Giao diện hiện tại; responsive, SEO cơ bản; chưa phải React/Next.js |
| Build tooling | Node.js 22, npm, esbuild | Build browser bundle tích hợp Neon |
| Authentication | Email/password trong PostgreSQL + Neon Auth (Better Auth/JWKS) | Role customer/admin; cookie HttpOnly, session, CSRF; Neon Auth cần cấu hình biến môi trường |
| Security | PDO prepared statements, CSRF, rate limit, HTTPS, secure cookies | Đã có trong code; tiếp tục tăng cường WAF và giám sát |
| Malware scanning | Chưa tích hợp VirusTotal | Cần thêm API key, job quét riêng và trạng thái quarantine trước khi public package |
| Hosting | Render Web Service + Docker | main Auto Deploy; Neon là database và object storage |
| CI | GitHub Actions | Composer validation, PHP lint, smoke test, Node build/test và secret scan |

## Lộ trình nâng cấp / công nghệ có thể tích hợp

Các công nghệ dưới đây là lựa chọn nâng cấp, không phải thành phần đã được triển khai trong runtime hiện tại:

- **Cloudflare R2:** có thể thay Neon Object Storage hoặc dùng làm kho phân phối package. Cần tạo bucket, cấp R2 access key, cấu hình S3 endpoint và kiểm thử presigned upload/download trước khi chuyển dữ liệu. Không đổi bucket production tự động.
- **Cloudflare CDN + WAF:** đặt domain qua Cloudflare, cấu hình cache riêng cho asset tĩnh, không cache API/login/admin/download và bật WAF/rate rules. Worker proxy không tự động có nghĩa WAF đã được cấu hình.
- **VirusTotal API:** tích hợp kiểm tra hash và quét package trước khi công khai. File mới phải ở trạng thái pending/quarantine đến khi có kết quả; lưu scan ID, verdict, thời điểm và phiên bản engine. Không đưa API key lên trình duyệt.
- **Node.js (Express/NestJS) hoặc Workers:** có thể tách API service sau này. Cloudflare Workers không chạy PHP/Apache; nếu chuyển backend thì phải viết lại endpoint, xác thực, storage và migration/test.
- **React/Next.js + Tailwind:** lựa chọn để thay frontend vanilla hiện tại khi cần SSR, component system và SEO nâng cao. Không mô tả là đã dùng cho đến khi frontend được chuyển đổi và build/deploy thực tế.
- **Clerk/Auth0/Supabase Auth:** là các lựa chọn thay thế Neon Auth, không bật nhiều nhà cung cấp cùng lúc nếu chưa thiết kế đồng bộ identity và role. Hiện hệ thống dùng đăng nhập email/password và tích hợp Neon Auth.
- **Observability:** tiếp tục dùng Render logs + GitHub Actions; bổ sung error tracking, uptime monitor, storage scan queue và cảnh báo quota/backup.

## Tính năng

- Trang chủ responsive, danh mục, tìm kiếm, lọc, phân trang, trang chi tiết và SEO.
- Admin CRUD sản phẩm, upload ảnh và package riêng tư.
- Miễn phí hoàn toàn: không có checkout, thanh toán, đơn hàng, webhook, xác minh giao dịch hay hoàn tiền. API từ chối sản phẩm Paid cũ.
- Nền tảng: Windows, Android, macOS, Linux và Web; không cung cấp IPA/iOS.
- Quản lý phiên bản/changelog, ảnh chụp màn hình, yêu cầu hệ thống, thư viện, đánh giá kiểm duyệt, thông báo cập nhật và lịch sử tải.
- Download grant dùng một lần và hết hạn 10 phút.
- CSRF, rate limit, PDO prepared statements, secure cookies, JWT/JWKS validation.

## Render / Docker / PHP hosting

- PHP 8.4 + Apache qua Dockerfile; Node.js 22 dùng build bundle.
- Render Blueprint: render.yaml; service HendyStore, branch main, Dockerfile ./Dockerfile, region Singapore, Auto Deploy bật.
- Thiết lập APP_URL, APP_KEY, ADMIN_EMAIL, ADMIN_PASSWORD, DATABASE_URL và biến Neon cần dùng.
- ADMIN_EMAIL phải là địa chỉ Admin riêng. ADMIN_PASSWORD tối thiểu 12 ký tự, tối đa 72 bytes. Khi đổi secret trên Render, ứng dụng sẽ đồng bộ hash vào tài khoản Admin cùng email lúc khởi động.
- Không commit secrets/.env. Render Free filesystem là ephemeral; uploads/database không được lưu local.
- Health endpoint: /api.php?action=health.

## Cloudflare Workers và Pages

PHP/Apache không chạy trực tiếp trên Workers/Pages. Mô hình hiện tại là Cloudflare làm edge proxy/CDN, PHP vẫn chạy tại Render hoặc VPS:
- Worker reverse proxy: cloudflare/worker.js; deploy với Wrangler, đặt ORIGIN_URL là URL HTTPS của Render/VPS.
- Pages Advanced Mode Worker: cloudflare/pages/public/_worker.js; Pages phục vụ static assets và proxy route động/PHP về ORIGIN_URL.
- Pages output folder: cloudflare/pages/public. Chưa có bản chuyển toàn bộ PHP templates thành Pages-native; Pages không phải PHP runtime.
- Không cache API, login, admin hoặc file tải xuống riêng tư.

## Neon

1. Database production đã chọn cho HendyStore: project sparkling-grass-08962862, branch production, database Hendy_Store.
2. Sử dụng pooled PostgreSQL connection string có SSL; không hiển thị hoặc commit connection string.
3. Bucket private hendy-store-files; credentials lưu trong Render environment.
4. Chạy schema/migration additive; không xóa bảng hoặc dữ liệu người dùng/ứng dụng hiện có.

## Kiểm thử & triển khai

1. npm ci && npm run build && npm test
2. composer validate --no-check-publish && composer install
3. php -l api.php && php -l config/bootstrap.php && php -l features/api.php && php tests/smoke.php
4. Build Docker, deploy Render, chờ health check ok:true.
5. Xác minh Admin login, tạo sản phẩm draft, upload package test, publish, kiểm tra download và lịch sử.
6. Chỉ sau khi Render healthy mới deploy Cloudflare Worker/Pages và kiểm tra login, admin, upload/download qua domain.
7. Chạy E2E trên PostgreSQL/Neon thật; smoke test SQLite không thay thế kiểm thử production.

## Vận hành an toàn

- Quét malware và xác minh quyền phân phối trước khi public package.
- Thay thông tin placeholder trong legal notice bằng thông tin pháp lý/liên hệ thật.
- Theo dõi Neon quota, Render logs, Cloudflare analytics và backup/restore.
