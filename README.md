# Hendy Store

App Store miễn phí, triển khai đa môi trường.

## Tính năng
- Trang chủ responsive, danh mục, tìm kiếm, lọc, phân trang, trang chi tiết và SEO.
- Admin CRUD sản phẩm, upload ảnh và package riêng tư.
- Miễn phí hoàn toàn: không có checkout, thanh toán, đơn hàng, webhook, xác minh giao dịch hay hoàn tiền. API từ chối giá Paid cũ.
- Nền tảng: Windows, Android, macOS, Linux và Web; không cung cấp IPA/iOS.
- Quản lý phiên bản/changelog, ảnh chụp màn hình, yêu cầu hệ thống, thư viện, đánh giá kiểm duyệt, thông báo cập nhật và lịch sử tải.
- Neon PostgreSQL + Neon Object Storage; download grant dùng một lần và hết hạn 10 phút.
- CSRF, rate limit, PDO prepared statements, secure cookies, JWT/JWKS validation.

## Render / Docker / PHP hosting
- PHP 8.3 + Apache qua Dockerfile; Render Blueprint `render.yaml`.
- Kết nối repository `hendyngo-servers/HendyStore`, branch `main`, Dockerfile `./Dockerfile`, region Singapore.
- Thiết lập APP_URL, APP_KEY, ADMIN_EMAIL, ADMIN_PASSWORD, DATABASE_URL và các biến Neon cần dùng.
- Không commit secrets/.env. Render Free filesystem là ephemeral; uploads/database không được lưu local.
- Health endpoint: `/api.php?action=health`.

## Cloudflare Workers và Pages
PHP/Apache không chạy trực tiếp trên Workers/Pages. Mô hình hỗ trợ là Cloudflare làm edge proxy/CDN, PHP vẫn chạy tại Render hoặc VPS:
- Worker reverse proxy: `cloudflare/worker.js`; deploy với Wrangler, đặt `ORIGIN_URL` (secret/variable) là URL HTTPS của Render/VPS.
- Pages Advanced Mode Worker: `cloudflare/pages/_worker.js`; Pages phục vụ static assets nếu có, route động và PHP proxy về `ORIGIN_URL`.
- Pages output folder: `cloudflare/pages/public`. Chưa có static rewrite toàn bộ PHP templates thành Pages-native; vì vậy Pages không phải runtime thay thế PHP.
- Cần kiểm tra login, admin, upload/download, API và cache headers qua domain Cloudflare sau deploy.

## Neon
1. Tạo Neon PostgreSQL database/branch và bucket private `hendy-store-files`.
2. Áp dụng `database/schema.postgres.sql`; schema ứng dụng có migration idempotent.
3. Cấu hình DATABASE_URL pooled có SSL; Object Storage credentials/endpoint; Neon Auth trusted origins.
4. Bật AI Gateway/Realtime/Functions chỉ khi thực sự cấu hình đủ endpoint và secret.

## Kiểm thử & triển khai
1. `npm ci && npm run build && npm test`
2. `composer validate --no-check-publish && composer install`
3. `php -l api.php && php -l config/bootstrap.php && php -l features/api.php && php tests/smoke.php`
4. Build Docker, deploy Render, chờ health check `ok:true`.
5. Tạo sản phẩm draft, upload package test, publish, xác minh download và lưu lịch sử.
6. Deploy Cloudflare Worker/Pages proxy sau khi Render origin đã healthy.
7. Chạy E2E trên PostgreSQL/Neon thật; smoke test SQLite không thay thế kiểm thử production.

## Vận hành an toàn
- Quét malware và xác minh quyền phân phối trước khi public package.
- Thay thông tin placeholder trong legal notice bằng thông tin pháp lý/liên hệ thật.
- Theo dõi Neon quota, Render logs, Cloudflare analytics và backup/restore.
