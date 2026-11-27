# Hendy Store — Render Free + Neon

Hendy Store là cửa hàng ứng dụng PHP/Apache với trang chủ responsive, danh mục, trang chi tiết SEO, bảng quản trị, upload gói cài đặt và luồng download. Bản triển khai này dùng Render Free cho Web Service và Neon cho dữ liệu, xác thực, lưu tệp, AI Gateway, Realtime và Functions.

> **Trạng thái mã nguồn:** đã chuẩn bị cấu hình Render Free, Docker multi-stage, Neon infrastructure file, PostgreSQL schema, API lưu trữ S3 và build bundle Auth/Realtime. Chưa thể chạy Neon CLI hoặc triển khai lên tài khoản từ môi trường hiện tại vì DNS tới npm registry trả về EAI_AGAIN. Chưa có kết quả Neon deploy, Docker build trên Render hoặc end-to-end runtime; không coi hệ thống đã hoạt động trên production cho tới khi các bước kiểm chứng ở cuối hoàn tất.

## 1. Kiến trúc

| Thành phần | Vai trò |
|---|---|
| Render Free Web Service | PHP 8.3 + Apache, giao diện website, API và quản trị |
| Neon PostgreSQL | Sản phẩm, tài khoản liên kết, lượt tải, giới hạn truy cập và PHP sessions |
| Neon Managed Auth | Email/password và bearer JWT cho phiên người dùng |
| Neon Object Storage | Ảnh, APK, ZIP, EXE và gói ứng dụng; bucket private |
| Neon AI Gateway | Tạo nháp mô tả ứng dụng từ thông tin quản trị nhập |
| Neon Realtime | Live SQL query của danh mục public |
| Neon Function storeapi | Health check các dịch vụ Neon và seal truy vấn realtime |

**Không dùng persistent disk trên Render Free.** Dữ liệu không được ghi vào filesystem của Web Service để lưu lâu dài. PHP sessions được lưu trong bảng Postgres; upload ảnh/gói nằm trong Neon Object Storage; database nằm trên Neon. Render Free có thể spin down khi không có traffic và filesystem local sẽ mất dữ liệu khi service restart, redeploy hoặc spin down. Xem giới hạn hiện hành tại https://render.com/docs/free.

## 2. Các tính năng trong mã nguồn

- Trang chủ, tìm kiếm, lọc danh mục, sắp xếp, phân trang, nổi bật, trang chi tiết và metadata SEO.
- Quản trị tạo/sửa/xóa/ẩn/công khai ứng dụng.
- Upload JPG/PNG/WEBP tối đa 5 MB.
- Upload APK/APKS/XAPK/ZIP/7Z/RAR/EXE/MSI/DMG/PKG/DEB/RPM/TAR/GZ/PDF tối đa 200 MB, theo giới hạn MAX_UPLOAD_BYTES.
- File được kiểm tra phần mở rộng, MIME, kích thước, ảnh và tên token ngẫu nhiên; lưu vào bucket private. API stream ảnh/gói qua server, không đưa credential S3 ra browser.
- Download qua /api.php?action=download_redirect&slug=...; chỉ cho ứng dụng đang public và không phải sản phẩm Paid. Link ngoài chỉ nhận HTTPS. Download package nội bộ được stream từ Object Storage và tăng lượt tải.
- CSRF, session cookie HttpOnly/SameSite/Secure, rate limit, truy vấn PDO tham số hóa và HTTP security headers.
- Neon Auth JWT được kiểm tra bằng JWKS server-side; hồ sơ Neon Auth liên kết vào bảng users theo subject/email. Trang quản trị vẫn hỗ trợ tài khoản admin do ADMIN_EMAIL/ADMIN_PASSWORD tạo.
- PHP sessions dùng Postgres nên tồn tại qua các lần Render spin down/redeploy.
- Nút AI viết mô tả trong admin gọi Neon AI Gateway. Người quản trị phải đọc và xác minh nội dung AI trước khi lưu.
- Neon Realtime phát danh mục public; REST API vẫn là fallback khi Realtime mất kết nối.
- Health endpoint của PHP kiểm tra kết nối Postgres, Object Storage và admin. Neon Function /health kiểm tra Postgres, Object Storage, Auth, AI Gateway và Realtime.

## 3. Cấu trúc bổ sung

~~~text
Hendy-Store/
├── api.php
├── config/bootstrap.php
├── database/schema.postgres.sql
├── neon.ts
├── neon/functions/storeapi.ts
├── src/neon-browser.js
├── js/neon-client.bundle.js       # npm run build tạo ra
├── scripts/build.mjs
├── scripts/smoke.mjs
├── package.json
├── composer.json
├── Dockerfile
├── docker-entrypoint.sh
├── render.yaml                    # plan: free, không gắn disk
└── .env.example
~~~

database/schema.mysql.sql được giữ lại để tham khảo/khả năng tương thích bản cũ. Production target trong Blueprint này là Neon PostgreSQL.

## 4. Thiết lập Neon trên máy của anh

Chạy trong thư mục gốc của repository, sau khi đã cài Node.js 22 trở lên, npm và Composer 2.

### 4.1. Tạo file môi trường cục bộ

PowerShell:

~~~powershell
Copy-Item .env.example .env.local
~~~

Điền trước APP_URL bằng đúng URL HTTPS Render sẽ cấp. Nếu tên dịch vụ là hendy-store, URL thường có dạng https://hendy-store.onrender.com; dùng domain thực tế do Render hiển thị, không tự đoán URL nếu Render cấp hậu tố khác.

Tạo APP_KEY:

~~~powershell
php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
~~~

Điền ADMIN_EMAIL, ADMIN_PASSWORD riêng. Mật khẩu quản trị mới tối thiểu 12 ký tự và tối đa 72 byte (bcrypt). Không dùng lại mật khẩu của email, Neon hoặc tài khoản GitHub.

### 4.2. Cài Neon CLI và liên kết project production

~~~powershell
npm i -g neon@latest
~~~

Nếu lệnh cài global thất bại, dùng CLI qua npx:

~~~powershell
npx neon@latest --version
~~~

Nếu lệnh Neon mở trình duyệt để đăng nhập, hoàn tất đăng nhập trong browser trước khi tiếp tục. Nếu cửa sổ đăng nhập timeout hoặc không hoàn tất, chạy neon login rồi thử lại.

Liên kết repository này với đúng project và branch anh đã cung cấp:

~~~powershell
neon init -y --org-id org-silent-waterfall-43882566 --project-id sparkling-grass-08962862 --branch production --services postgres,auth,ai-gateway,object-storage,functions,realtime
~~~

### 4.3. Provision dịch vụ Neon

~~~powershell
neon deploy
~~~

Neon CLI đọc neon.ts, áp dụng cấu hình lên branch production và kéo các biến dịch vụ vào .env.local (hoặc .env nếu anh đang dùng tệp đó). Các dịch vụ được khai báo gồm:

Nếu muốn tạo schema PostgreSQL trước khi chạy Web Service, có thể dùng psql (lệnh không in connection string ra màn hình):

~~~powershell
$dbLine = Get-Content .env.local | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $dbLine) { throw "DATABASE_URL not found in .env.local" }
$env:DATABASE_URL = $dbLine.Substring("DATABASE_URL=".Length).Trim().Trim('"').Trim("'")
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f database/schema.postgres.sql
Remove-Item Env:DATABASE_URL
~~~

Ứng dụng cũng tự tạo/cập nhật schema theo cách idempotent khi API/health chạy lần đầu; không cần tạo lại bảng nếu đã tồn tại.

- Postgres — URL pooled DATABASE_URL.
- Managed Auth — NEON_AUTH_BASE_URL, NEON_AUTH_JWKS_URL.
- Object Storage — AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, AWS_REGION.
- AI Gateway — NEON_AI_GATEWAY_BASE_URL, NEON_AI_GATEWAY_TOKEN.
- Realtime — NEON_REALTIME_URL, NEON_REALTIME_SECRET.
- Functions — Function storeapi và biến môi trường runtime tương ứng.

Không commit .env, .env.local hoặc bất kỳ file nào chứa credential. .gitignore và .dockerignore đã loại chúng khỏi Git/Docker build.

### 4.4. Lấy URL Neon Function

Function có slug storeapi. Sau khi deploy, lấy HTTPS invocation URL từ kết quả deploy/Neon Console (Functions của branch production) và dùng URL đó cho biến Render:

~~~text
NEON_STORE_FUNCTION_URL=https://<function-invocation-url>
~~~

Không thêm path /health vào biến này. Code tự gọi /health hoặc /catalog-live. Không dùng URL nội bộ PostgreSQL làm Function URL.

### 4.5. Cấu hình domain tin cậy trong Neon Auth

Thêm URL HTTPS Render thực tế làm trusted/allowed origin trong cấu hình Neon Auth của branch. Đảm bảo Auth được phép phục vụ email/password sign-in trên domain đó. NEON_AUTH_PUBLIC_SIGNUP=false mặc định chỉ ẩn nút đăng ký trên UI Hendy Store; muốn khóa đăng ký ở cấp dịch vụ thì cần tắt public sign-up trong cấu hình Managed Auth của Neon, không chỉ dựa vào biến UI.

Realtime được cấu hình preview.realtime.allowedOrigins lấy từ APP_URL trong môi trường khi chạy neon deploy. Nếu thay domain sau này, cập nhật APP_URL rồi chạy lại neon deploy để cập nhật origin của Realtime.

## 5. Build và kiểm thử trước khi deploy

~~~powershell
npm install
npm run build
npm test
composer validate --no-check-publish
composer install
php -l api.php
php -l config/bootstrap.php
php -l subpage/index.php
php tests/smoke.php
~~~

npm run build tạo js/neon-client.bundle.js từ Neon Auth/Realtime browser SDK. Docker multi-stage chạy lại build này trong lúc build image; không yêu cầu commit bundle đã sinh.

Smoke test PHP dùng SQLite tạm thời chỉ để xác nhận bootstrap schema/admin/session trong CI. Nó không thay cho kiểm thử PostgreSQL thật.

## 6. Triển khai Render Free

1. Mở Render Dashboard.
2. Chọn New → Blueprint và kết nối repository ngogiaidy56-eng/Hendy-Store.
3. Render đọc render.yaml, tạo một Docker Web Service gói Free. Blueprint không khai báo persistent disk.
4. Khi Render hỏi các giá trị sync:false, điền:
   - APP_URL, ADMIN_EMAIL, ADMIN_PASSWORD
   - DATABASE_URL (dùng pooled URL từ Neon, có SSL)
   - NEON_AUTH_BASE_URL, NEON_AUTH_JWKS_URL
   - AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3
   - NEON_AI_GATEWAY_BASE_URL, NEON_AI_GATEWAY_TOKEN
   - NEON_REALTIME_URL, NEON_REALTIME_SECRET
   - NEON_STORE_FUNCTION_URL (HTTPS invocation URL của Function)
5. Giữ APP_KEY do Render sinh tự động. Không dán secret vào source code hoặc commit.
6. Deploy Docker service. Chờ build hoàn tất và health check thành công.
7. Mở https://<render-domain>/api.php?action=health. Response cần có ok:true, database:postgresql, storage:neon-object-storage, và admin count lớn hơn 0.

Render Free có cold start sau thời gian idle, vì vậy lần truy cập đầu sau khi ngủ có thể chậm. Gói Free không phù hợp nếu cần availability/SLA liên tục; có thể chuyển sang gói trả phí sau này mà không cần thay đổi nơi lưu database/file.

## 7. Kiểm chứng end-to-end sau khi Neon và Render đã deploy

### PHP Web Service

~~~powershell
Invoke-RestMethod "https://<render-domain>/api.php?action=health"
~~~

### Neon Function

~~~powershell
Invoke-RestMethod "https://<function-invocation-url>/health"
~~~

checks cần báo true cho postgres, objectStorage, auth, aiGateway, realtime. Nếu một dịch vụ thất bại, xem Functions logs/Neon Console và Render logs; không đưa nội dung biến bí mật vào issue hoặc chat.

### Object Storage và download

1. Đăng nhập /admin/.
2. Tải một ảnh test và một file ZIP nhỏ.
3. Lưu sản phẩm ở trạng thái draft, sau đó thêm HTTPS/package URL và công khai.
4. Mở trang chi tiết, bấm Tải xuống.
5. Xác nhận file tải đúng checksum, lượt tải tăng, ảnh vẫn hiện sau khi Render restart/redeploy.

### Auth

1. Thêm Render URL vào trusted origins của Neon Auth.
2. Bật đăng ký ở Neon Auth chỉ khi đã sẵn sàng mở tài khoản; nếu bật UI sign-up, đặt NEON_AUTH_PUBLIC_SIGNUP=true trên Render.
3. Đăng nhập bằng Neon Auth, tải lại trang và gọi bootstrap/products. Backend cần xác thực JWT qua JWKS và map đúng hồ sơ.
4. Kiểm tra admin chỉ đăng nhập bằng email/mật khẩu quản trị đã cấu hình; không tự gán role admin từ client token.

### AI Gateway và Realtime

1. Mở admin, nhập tên, nhà phát triển, danh mục và mô tả ngắn, sau đó bấm AI viết mô tả. Đọc lại kết quả trước khi lưu.
2. Mở hai browser ở trang cửa hàng, thêm/cập nhật một sản phẩm từ admin; catalog sẽ nhận live update qua Realtime. REST API vẫn là fallback khi Realtime disconnects.

## 8. Giới hạn chi phí và bảo mật cần lưu ý

- Render Free và Neon Free là hai hạn mức riêng. Neon Free hiện công bố 1 GB Postgres/project, 5 GB Object Storage, 100 CU-hours/project/tháng và quota riêng cho Auth/Functions. Theo dõi quota trước khi tải nhiều file dung lượng lớn.
- Neon AI Gateway được tính usage theo model/token; có thể yêu cầu nạp credits trước khi gọi model. Nút AI không phải tính năng miễn phí vô hạn.
- Realtime hiện là tính năng public preview/beta; kiểm tra giới hạn và trạng thái mới nhất trong Neon Console trước khi phụ thuộc vào nó cho quy trình quan trọng.
- Render Free filesystem là ephemeral. Không thêm database SQLite hoặc upload file local làm production persistence; không gắn disk vào Free plan.
- Paid Store: giá bán VND, tạo đơn chuyển khoản, xác minh SePay webhook HMAC-SHA256 với timestamp, chống transaction trùng, đối soát đúng tài khoản/mã đơn/số tiền và chỉ cấp quyền tải khi giao dịch khớp.
- Refund: người mua gửi yêu cầu; admin duyệt/từ chối và chỉ ghi nhận đã hoàn sau khi chuyển khoản thủ công ngoài ứng dụng và có mã giao dịch thực tế. Chưa tích hợp API chi tiền hoàn tự động.
- Checkout tự khóa khi thiếu `SEPAY_WEBHOOK_SECRET`, `SEPAY_BANK_CODE` hoặc `SEPAY_BANK_ACCOUNT`.
- iOS/IPA đã bị loại khỏi nhận diện hệ điều hành và định dạng upload.
- Phải thay placeholder ở legal-notice/index.html bằng tên pháp lý, địa chỉ liên hệ và email hỗ trợ thực tế trước khi mở website cho công chúng.
- Kiểm tra quyền phân phối và quét malware cho từng package trước khi công khai. Mã nguồn không tuyên bố phần mềm được chứng nhận an toàn.
- Đổi mật khẩu Neon/Postgres nếu credential đã được chia sẻ bên ngoài hệ thống quản lý bí mật. Dùng Render Environment Variables cho runtime, không lưu .env.local vào GitHub.

## 9. Trạng thái xác minh và những phần chưa thể xác nhận

Các tệp mã nguồn/config đã được chuẩn bị và lưu trên nhánh feature/render-free-neon. Tuy nhiên trong môi trường phát triển hiện tại, truy cập npm registry bị lỗi DNS EAI_AGAIN, vì vậy chưa thể cài Neon CLI/npm packages, chạy lệnh neon init, thực hiện neon deploy, build Docker image hoặc chạy E2E trên Neon/Render. Cần chạy các bước trên trong máy có kết nối mạng và hoàn tất Neon login nếu CLI yêu cầu. Không coi service là healthy cho tới khi cả hai health endpoints trả ok:true và upload/download/Auth/AI/Realtime đã được thử thực tế.


## 10. Store Ecosystem module (feature/store-ecosystem)

The additive Store Ecosystem module provides:

- OS-aware package selection for Windows, macOS, Android, Linux and universal builds, with a visible fallback when no compatible package is published.
- Version records per product with platform, architecture, minimum OS, package size and release notes/changelog.
- Product screenshot gallery, optional HTTPS video link, minimum system requirements and publisher-provided privacy notes.
- Authenticated 1–5 star reviews with moderation; only approved reviews affect the public average. Admins can publish a developer/publisher reply.
- Account library, version update notifications when a new current version is published, and the user's download history.
- Store management at /admin/store-features.php and personal library at /library/.

The module creates only new `app_*` tables and does not delete or rewrite existing users/products. Schema creation is idempotent and invoked when a Store Ecosystem API route is first used. The explicit additive PostgreSQL migration is also available at `database/migrations/20261128_store_ecosystem.sql`.

**Distribution and payment limits:** an iOS IPA is not a one-click public install; use App Store, TestFlight or MDM distribution as appropriate. Paid checkout, payment verification, refunds and paid-download entitlements are not implemented by this module; Paid products remain locked by the existing application. A free download is added to the user's library only when the user is signed in at download time. Anonymous download history is aggregated without exposing raw IP addresses.

Run CI on the `feature/store-ecosystem` branch before merging. Deploying the branch to Render/Neon is a separate operation and has not been performed by this repository change.


Storefront ranking filters include the most popular free and paid products. Related-app suggestions are ranked from published apps in the same category. Paid purchase and entitlement workflows remain locked until a verified payment integration is added.
