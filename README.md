# Hendy Store

Nền tảng App Store miễn phí, ưu tiên triển khai đa môi trường.

## Tech Stack — công nghệ đang dùng

| Lớp | Công nghệ hiện tại | Vai trò / trạng thái |
|---|---|---|
| Database | PostgreSQL trên Neon | Lưu ứng dụng, tài khoản, phiên bản, đánh giá, thư viện và lịch sử tải |
| File storage | Cloudflare R2 + Neon legacy fallback | Production Render now writes new objects to the private EU R2 bucket `hendy-store`; old Neon objects remain readable during reconciliation |
| CDN / Edge | Cloudflare Workers / Pages proxy | Có mã proxy trong cloudflare/; chỉ thành edge/CDN production sau khi cấu hình ORIGIN_URL, DNS và deploy |
| Backend / API | PHP 8.4 + Apache, PDO; optional Cloudflare Workers API adapter | PHP remains the business API and Neon data owner. Worker proxies to the Render origin, optionally probes an isolated D1 binding, and may cache the anonymous public catalogue in KV |
| Frontend | Existing HTML/CSS/JavaScript + optional Next.js 16.4.6, React 19.3.1, Tailwind CSS 4.3.5 | Existing production pages remain; new SSR Next storefront source has Render Docker and Cloudflare Workers/OpenNext deployment targets, not yet deployed |
| Build tooling | Node.js 22, npm, esbuild | Build browser bundle tích hợp Neon |
| Authentication | Neon Auth (Managed Better Auth/JWKS) + PHP session fallback cho Admin | Email/password; Google OAuth UI có feature flag; role customer/admin; HttpOnly, CSRF |
| Security | PDO prepared statements, CSRF, rate limit, HTTPS, secure cookies | Đã có trong code; tiếp tục tăng cường WAF và giám sát |
| Malware scanning | PHP server-side SHA-256 + VirusTotal API | `features/security.php` checks private packages and blocks publication until scan and Admin moderation pass. No Python parser/antivirus worker is deployed or included |
| Hosting | Render Docker + optional Cloudflare Workers/Pages | Render remains the current production origin. Cloudflare targets are manually dispatched and need account credentials/bindings before deployment |
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

## Kiến trúc và phương án triển khai

- [Kiến trúc Cloudflare + Render + Neon](docs/architecture/target-architecture.md)
- [Phân phối ứng dụng Windows 10/11](docs/architecture/windows-distribution.md)

Đây là thiết kế triển khai theo từng giai đoạn; code hoặc binding trong Git không đồng nghĩa Worker, Pages, R2, KV, D1 hay custom domain đã được triển khai và kiểm thử.

## Tính năng

- Trang chủ responsive, danh mục, tìm kiếm, lọc, phân trang, trang chi tiết và SEO.
- Admin CRUD sản phẩm, upload ảnh và package riêng tư.
- Miễn phí hoàn toàn: không có checkout, thanh toán, đơn hàng, webhook, xác minh giao dịch hay hoàn tiền. API từ chối sản phẩm Paid cũ.
- Nền tảng: Windows, Android, macOS, Linux và Web; không cung cấp IPA/iOS.
- Quản lý phiên bản/changelog, ảnh chụp màn hình, yêu cầu hệ thống, thư viện, đánh giá kiểm duyệt, thông báo cập nhật và lịch sử tải.
- Download grant dùng một lần và hết hạn 10 phút.
- CSRF, rate limit, PDO prepared statements, secure cookies, JWT/JWKS validation.
- Google sign-in uses Neon Managed Better Auth social OAuth; the button stays hidden until a production OAuth client is configured and GOOGLE_OAUTH_ENABLED=true. The dedicated /admin login remains email/password and does not inherit Admin role from a matching Google email.

## Render / Docker / PHP hosting

- PHP 8.4 + Apache qua Dockerfile; Node.js 22 dùng build bundle.
- Render Blueprint: render.yaml; service HendyStore, branch main, Dockerfile ./Dockerfile, region Singapore, Auto Deploy bật.
- Thiết lập APP_URL, APP_KEY, ADMIN_EMAIL, ADMIN_PASSWORD, DATABASE_URL và biến Neon cần dùng.
- ADMIN_EMAIL phải là địa chỉ Admin riêng. ADMIN_PASSWORD tối thiểu 12 ký tự, tối đa 72 bytes. Khi đổi secret trên Render, ứng dụng sẽ đồng bộ hash vào tài khoản Admin cùng email lúc khởi động.
- Không commit secrets/.env. Render Free filesystem là ephemeral; uploads/database không được lưu local.
- Health endpoint: /api.php?action=health.

## Cloudflare Workers và Pages

PHP/Apache và Neon PostgreSQL tiếp tục chạy trên Render. Cloudflare cung cấp lớp edge và các điểm triển khai độc lập:
- API Worker: `cloudflare/platform-worker`, cập nhật Worker có sẵn `hendy-platform-api`; hostname `workers.dev` chỉ được ghi nhận sau khi deployment trả về URL thực tế. Neon được gọi qua HTTPS Render origin.
- Next.js SSR: `apps/storefront-next`, build bằng OpenNext. Target Worker `hendystore-next` vẫn bị khóa đến khi cấp quyền Workers Admin; canonical URL tiếp tục là Render URL cho đến khi hostname Cloudflare được triển khai và xác minh.
- Pages: `cloudflare/pages/public`, project `hendystore-pages`, phục vụ static assets và proxy route động/PHP về Render qua biến thường `ORIGIN_URL` trong `cloudflare/pages/wrangler.toml`.
- R2 EU `hendy-store` được khai báo thành binding native trong API Worker. Workflow tìm/gắn hoặc tạo KV `hendystore-catalog-cache` và D1 `hendystore-edge-db`; D1 không sao chép dữ liệu Neon.
- `GET /api/v2/platform/health` chỉ chạy kiểm tra read-only. `POST /api/v2/platform/probe` mới chạy R2/KV put-get-delete và D1 `SELECT 1`, yêu cầu secret `PLATFORM_HEALTH_TOKEN`.
- Tài khoản Cloudflare hiện chưa có Zone/domain tùy chỉnh; dùng `workers.dev` và `pages.dev` sau khi deploy, chỉ thêm custom domain khi Zone có sẵn.
- GitHub Actions deploy chỉ chạy thủ công qua workflow `Deploy HendyStore platform targets`; các target gồm `provision`, `worker`, `next`, `pages`, `all`.

Để bật deploy CI, thêm repository secret `CLOUDFLARE_API_TOKEN` tại GitHub Settings → Secrets and variables → Actions. Để chạy write-probe, thêm secret `CF_PLATFORM_HEALTH_TOKEN` (có thể tạo ngẫu nhiên cục bộ bằng `openssl rand -hex 32`). Account ID là giá trị công khai đã đặt trong Wrangler config, không cần lưu thành secret. Không gửi token qua chat hoặc commit vào mã nguồn.

## Neon Data API — danh mục công khai

- Data API production được cấu hình qua biến Render `NEON_DATA_API_URL`; URL không phải bí mật, nhưng không đưa Neon API key hoặc mật khẩu database vào frontend.
- Trình duyệt dùng JWT Neon Auth của tài khoản đã đăng nhập hoặc anonymous JWT có thời hạn ngắn để đọc view `public.api_public_catalog`.
- View chỉ trả metadata của sản phẩm đã xuất bản; loại trừ URL gói cài đặt, tài khoản, phiên đăng nhập, đơn hàng, thanh toán, thư viện và lịch sử tải.
- Vai trò Data API chỉ được `SELECT` trên view này, không có quyền trực tiếp trên 17 bảng nghiệp vụ hiện có.
- `api.php` vẫn xử lý hồ sơ, Admin, chi tiết sản phẩm, upload, đánh giá, thư viện và tải xuống. Danh mục tự fallback về PHP API khi Data API không sẵn sàng.
- `NEON_AUTH_PUBLIC_SIGNUP=true` điều khiển tab đăng ký khách hàng; Neon Auth vẫn bắt buộc xác minh email. Giữ `ALLOW_REGISTRATION=false` cho luồng đăng ký PHP cũ.

## Multi-cloud development and deployment

The multi-cloud adapter code and deployment targets are documented in [docs/architecture/multi-cloud-platform.md](docs/architecture/multi-cloud-platform.md).

- Object Storage providers: neon, cloudfly, r2 and generic s3. Select exactly one provider for new writes. Keep the legacy Neon bucket available for read fallback until object counts, sizes and SHA-256 checks have been reconciled.
- Database: Neon PostgreSQL remains the canonical business database behind the Render PHP origin. Cloudflare Workers call the HTTPS origin directly. The Worker database adapter exposes only the origin and optional D1 binding. D1 is a separate optional edge database and does not mirror Neon.
- D1 is an independent SQLite database for optional edge-local data/probes. It is not an automatic mirror of Neon PostgreSQL; no dual-write or automatic migration is enabled.
- Next storefront: apps/storefront-next. Build for Render with its Dockerfile and the optional render.next.yaml Blueprint, or build for Cloudflare Workers through OpenNext. Cloudflare documents vinext as its recommended default for new Next.js applications; it is actively developed and may have compatibility gaps, so this project keeps OpenNext as the broad-compatibility path until the exact feature set is verified.
- Cloudflare API Worker: cloudflare/platform-worker. It proxies the existing PHP API and provides platform health/capabilities. It does not bypass PHP auth/CSRF or replace all PHP business logic.
- Cloudflare deployment is manual through GitHub Actions → Deploy HendyStore platform targets. The provision target creates/binds only resources explicitly selected through repository variables; it does not delete resources or migrate user/application/order data.
- Store credentials only in GitHub Actions Secrets, Render Environment or Cloudflare Secrets. Never commit .env, database URLs, S3 secret keys, API tokens or signing keys.

Production business data remains on Render + Neon. Cloudflare uses workers.dev/pages.dev until a Zone is attached. Source/configuration in Git is not proof that a Worker, Pages site, R2 bucket, D1 database or KV namespace is live.

## Neon

1. Database production đã chọn cho HendyStore: project sparkling-grass-08962862, branch production, database Hendy_Store.
2. Sử dụng pooled PostgreSQL connection string có SSL; không hiển thị hoặc commit connection string.
3. Bucket private hendy-store-files; credentials lưu trong Render environment.
4. Chạy schema/migration additive; không xóa bảng hoặc dữ liệu người dùng/ứng dụng hiện có.

## Trust, Safety & Developer Console

HendyStore adds a private developer release pipeline and an admin moderation queue:

- Developer profiles must be approved by an administrator before package submission.
- New developer releases are created as `pending`; they are not listed in the public catalogue.
- Package uploads use short-lived presigned PUT URLs to the private `hendy-store-files` bucket. The PHP application does not proxy the large upload body.
- The PHP backend reads the private stored object, calculates SHA-256 and calls VirusTotal from `features/security.php`. Only a `clean` scan can enter manual approval; no separate Python worker is involved.
- Admin approval re-checks file existence, SHA-256, and malware scan after the five-minute upload URL has expired (six-minute minimum age for presigned uploads).
- Public app details disclose only the verified SHA-256 and package size for an approved release. Package object keys and provider credentials remain private.
- Admin moderation: `/admin/security.php`. Developer Console: `/developer/`.

### Production configuration

1. Set `VIRUSTOTAL_API_KEY` in Render Environment. Do not put it in HTML, JavaScript, Git, or browser requests. If this key is absent or VirusTotal does not return a clean scan, the release stays blocked.
2. Keep `hendy-store-files` private with public access blocked. Configure bucket CORS for the exact Storefront origin (for example `https://hendystore.onrender.com`), method `PUT`, allowed header `*`, expose `ETag`, and a short max age. Do not enable anonymous object reads.
3. Set `MAX_DIRECT_UPLOAD_BYTES=681574400` (650 MiB) or a lower operational limit. The Developer Console uploads directly to Object Storage; the legacy Admin multipart upload remains capped separately.
4. Confirm `NEON_AUTH_BASE_URL` and `NEON_AUTH_JWKS_URL` refer to the same Neon Auth project/domain, and allow the Storefront origin in Neon Auth.
5. New additive tables and the `app_versions.release_track` / `app_security_packages.upload_method` columns are initialized by the API module. Do not drop existing tables or user/order data.

### Product limitations / integrations

- Windows, macOS, Android and Linux downloads are selected from the published production build. iOS packages can be submitted for private review, but direct IPA sideload is intentionally blocked; distribute iOS apps through App Store, TestFlight or MDM.
- Alpha/Beta/Production metadata is stored; Alpha/Beta releases are excluded from the public Storefront. Approved Production version history is available to developers, and a previously approved build can be restored. Tester cohort / invitation distribution is not included yet.
- Current analytics include product views, download preparation/completion and submitted crash reports. Install/uninstall telemetry requires an SDK in each native app and is not inferred from downloads.
- HendyStore is currently a free-only catalogue; a paid-app ranking is therefore not applicable.
- Code signing is not active yet. `CODE_SIGNING_SERVICE_URL` and `CODE_SIGNING_SERVICE_TOKEN` are placeholders for a separate HSM/Key Vault signing adapter. Never upload .p12/.pfx/.keystore private keys to the public app package bucket.

## S3-Compatible Object Storage

Production currently uses **Cloudflare R2** for new object writes, while Neon PostgreSQL remains the business database.

- Provider: `OBJECT_STORAGE_PROVIDER=r2`
- Bucket: `hendy-store` (EU jurisdiction, private; public r2.dev disabled)
- Endpoint: `https://918ff2f016938fc978ed23b96505b21e.eu.r2.cloudflarestorage.com`
- Signing region: `auto`, path-style addressing enabled.
- CORS: only `https://hendystore.onrender.com`, method `PUT`, header `*`, expose `ETag`, max age 300 seconds.
- Render stores the bucket-scoped Object Read & Write S3 credentials. Access keys are never committed or sent to browser code.
- The Neon object-storage credentials and read fallback remain enabled while old `media/` and `packages/` objects are being reconciled. New writes go to R2 only.
- CloudFly S3 and generic S3 remain selectable adapters, but they are not the current production provider.

The production health endpoint has returned `ok:true` with `database=postgresql` and `storage=s3-compatible:r2`. This verifies PostgreSQL connectivity and the R2 bucket probe; an application-level package upload/download round trip is a separate test.

See [CloudFly Object Storage setup and migration](docs/cloudfly-object-storage.md) and [Cloudflare + Render + Neon architecture](docs/architecture/target-architecture.md).

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
