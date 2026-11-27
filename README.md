# Hendy Store — Public App Marketplace

Bộ mã nguồn website cửa hàng ứng dụng theo phong cách Microsoft Store / Google Play. Nền tảng gồm giao diện responsive, danh mục ứng dụng, tìm kiếm, trang chi tiết sản phẩm, SEO, API PHP, khu vực quản trị và cơ chế lưu tệp riêng.

> **Trạng thái:** đã hoàn thiện mã nguồn và kiểm tra cú pháp PHP/JavaScript, cấu hình YAML và các thiết lập triển khai. Chưa thể xác nhận hoạt động end-to-end trên hosting thật từ môi trường đóng gói này. Trước khi mở cho công chúng, phải điền thông tin đơn vị vận hành, cấu hình bí mật, triển khai database/storage bền vững và tự kiểm thử theo checklist bên dưới.

## 1. Tính năng

- Trang chủ responsive, danh mục, tìm kiếm, sắp xếp, phân trang và ứng dụng nổi bật.
- Trang sản phẩm có URL thân thiện `/apps/ten-ung-dung`, Open Graph, canonical và JSON-LD.
- Sitemap XML tự sinh từ các sản phẩm đang công khai; robots.txt tự lấy domain từ `APP_URL`.
- API PHP dùng PDO, hỗ trợ SQLite và MySQL, truy vấn tham số hóa.
- Quản trị viên có thể tạo, sửa, ẩn, công khai và xóa sản phẩm; ảnh chụp màn hình đã khai báo được giữ nguyên khi chỉnh sửa sản phẩm.
- Tải ảnh JPG/PNG/WEBP; ảnh lưu ở storage riêng và được phân phối qua API.
- Tải gói APK/APKS/XAPK/ZIP/7Z/RAR/EXE/MSI/DMG/PKG/DEB/RPM/TAR/GZ/PDF tối đa 200 MB; gói nằm ngoài webroot, được tải qua API và hỗ trợ streaming cho tệp lớn.
- Download counter, giới hạn tốc độ đăng nhập/đăng ký/tải xuống, session cookie bảo vệ, CSRF, CSP và các HTTP security headers.
- Đăng ký tài khoản khách hàng tắt mặc định. Admin vẫn đăng nhập bình thường.
- GitHub Actions kiểm tra cú pháp PHP/JavaScript và chạy smoke test SQLite (schema, bootstrap admin, password hash và storage).
- Dữ liệu mẫu giả lập không được tự tạo ở bản mới. Bản nâng cấp có migration đưa các mẫu cũ không có liên kết tải về bản nháp và xóa số liệu giả.

## 2. Cấu trúc chính

```text
web-hosting/
├── index.php                 # Trang chủ có metadata SEO
├── api.php                   # API và luồng tải tệp
├── sitemap.php               # Sitemap sinh theo sản phẩm đã công khai
├── robots.php                # Robots theo APP_URL
├── subpage/index.php         # Trang chi tiết SSR/SEO
├── legal-notice/index.html   # Thông tin pháp lý (cần điền thông tin thật)
├── privacy/index.html        # Chính sách quyền riêng tư
├── terms-of-use/index.html   # Điều khoản sử dụng
├── developer-policy/index.html
├── admin/index.php           # Bảng quản trị
├── admin/admin.js
├── config/bootstrap.php      # Env, session, PDO, validation, rate limits
├── database/schema.mysql.sql
├── storage/                  # Storage riêng, bị chặn truy cập web
├── css/
├── js/
├── g/fonts.css              # Font stack cục bộ, không phụ thuộc CDN
├── images/                   # Ảnh mặc định và ảnh legacy còn được tham chiếu
├── Dockerfile
├── docker-entrypoint.sh
├── render.yaml
└── .env.example
```

Các thư mục placeholder không dùng (`webcard/`, `bundles/`, `website/`, `g/static/`) và trang HTML trùng lặp đã được loại bỏ. Các ảnh kích thước legacy vẫn được giữ để không làm hỏng dữ liệu sản phẩm của những lần triển khai trước.

## 3. Yêu cầu môi trường

- PHP 8.2 trở lên.
- PHP extensions: `PDO`, `pdo_sqlite` hoặc `pdo_mysql` tùy database, `fileinfo`, `mbstring` (mã có fallback một phần nếu thiếu mbstring). Dockerfile cài cả SQLite/MySQL PDO và OPcache.
- Apache 2.4 với `mod_rewrite`, `mod_headers`, `AllowOverride All`; hoặc cấu hình Nginx tương đương (mẫu bên dưới).
- HTTPS bắt buộc khi vận hành công khai.
- Đủ dung lượng đĩa, backup database và thư mục storage định kỳ.

## 4. Cài trên hosting PHP/Apache

1. Tải và giải nén toàn bộ thư mục lên Document Root của domain.
2. Sao chép `.env.example` thành `.env` ở thư mục gốc. Không đưa `.env` lên Git.
3. Tạo secret:

   ```bash
   openssl rand -hex 32
   ```

   Dán kết quả vào `APP_KEY`.
4. Điền tối thiểu:

   ```dotenv
   APP_ENV=production
   STORE_NAME="Hendy Store"
   APP_URL=https://ten-mien-cua-ban.vn
   APP_KEY=chuoi-bi-mat-ngau-nhien-64-ky-tu-hex
   ADMIN_EMAIL=email-quan-tri-cua-ban
   ADMIN_PASSWORD=mat-khau-rieng-toi-thieu-12-ky-tu
   ALLOW_REGISTRATION=false
   FORCE_SECURE_COOKIES=true
   FORCE_HTTPS=true
   TRUST_PROXY_HEADERS=false
   ```

5. Cấu hình SQLite mặc định hoặc MySQL. Ví dụ MySQL:

   ```dotenv
   DB_DSN="mysql:host=127.0.0.1;dbname=hendy_store;charset=utf8mb4"
   DB_USER=ten_database_user
   DB_PASSWORD=mat_khau_database
   STORAGE_PATH=/duong-dan-rieng/khong-public/hendy-store
   ```

   Với SQLite, có thể đặt `SQLITE_PATH=/duong-dan-rieng/hendy-store.sqlite`. Nếu để trống, ứng dụng dùng `storage/hendy-store.sqlite`.

6. Bảo đảm `STORAGE_PATH` hoặc thư mục `storage/` ghi được bởi user chạy PHP. Không đặt storage trong thư mục public nếu máy chủ không chặn truy cập trực tiếp.
7. Mở `https://ten-mien-cua-ban.vn/api.php?action=health`. Kết quả cần là JSON `ok: true`, `database: connected`, `storage: writable` và có ít nhất một quản trị viên.
8. Đăng nhập tại `https://ten-mien-cua-ban.vn/admin/`, tạo ứng dụng thật, tải ảnh và gói cài đặt, sau đó công khai. Mật khẩu được kiểm tra tối thiểu 12 ký tự Unicode và tối đa 72 byte (giới hạn an toàn cho thuật toán băm mặc định). Đổi mật khẩu admin bằng CLI: `php bin/reset-admin-password.php admin@ten-mien-cua-ban.vn` (nhập mật khẩu mới tại prompt; chạy trên máy/SSH có quyền truy cập database và `.env`).

Quản trị viên đầu tiên được tạo tự động khi API/health chạy lần đầu với `ADMIN_EMAIL` và `ADMIN_PASSWORD` hợp lệ. Không dùng mật khẩu mẫu, không gửi bí mật qua chat, không commit `.env`.

### Nếu dùng Nginx

`.htaccess` không có tác dụng trên Nginx. Thiết lập tương đương trong server block và kiểm tra PHP-FPM. Ví dụ các quy tắc cần có:

```nginx
index index.php index.html;
client_max_body_size 212m;

location ~ ^/apps/([a-z0-9-]+)/?$ {
    rewrite ^/apps/([a-z0-9-]+)/?$ /subpage/index.php?slug=$1 last;
}
location = /sitemap.xml { rewrite ^ /sitemap.php last; }
location = /robots.txt  { rewrite ^ /robots.php last; }

location ~ ^/(config|database|storage|bin)/ { deny all; }
location ~ /\. { deny all; }
location ~ \.php$ {
    try_files $uri =404;
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    fastcgi_pass unix:/run/php/php-fpm.sock;
}
```

Đường dẫn socket PHP-FPM tùy nhà cung cấp hosting. Đảm bảo Nginx không phục vụ nội dung trong `storage/`, `config/`, `database/`, `bin/` hay `.env` dưới dạng file tĩnh. Cấu hình TLS/redirect HTTPS ở hosting hoặc reverse proxy; không phục vụ trang quản trị hoặc thông tin đăng nhập qua HTTP.

## 5. Triển khai trên Render

Repository đã có `render.yaml` và Dockerfile. Blueprint tạo một Docker Web Service, một persistent disk 2 GB tại `/var/data`, cấu hình SQLite tại `/var/data/hendy-store/hendy-store.sqlite`, bật HTTPS cookie và tắt đăng ký công khai.

1. Tạo repository GitHub mới tên `Hendy-Store` (khuyến nghị để trống, không tự thêm README/LICENSE/.gitignore), sau đó đẩy mã nguồn:

   ```bash
   git init -b main
   git add .
   git commit -m "Initial Hendy Store release"
   git remote add origin https://github.com/ngogiaidy56-eng/Hendy-Store.git
   git push -u origin main
   ```

   Tệp `.gitignore` đã chặn `.env`, database SQLite và toàn bộ nội dung upload trong `storage/`; chỉ giữ `storage/.htaccess` cần thiết.
2. Tạo Blueprint mới trên Render và chọn repository có `render.yaml`.
3. Khi Render yêu cầu giá trị cho `APP_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, hãy nhập domain HTTPS thật (hoặc domain `onrender.com` được cấp) và thông tin quản trị thực tế. `APP_URL` là bắt buộc trong production để tránh Host-header poisoning/canonical giả; mật khẩu mới phải có ít nhất 12 ký tự và tối đa 72 byte.
4. Giữ `APP_KEY` do Render tự sinh. Không xóa persistent disk sau khi cửa hàng có dữ liệu.
5. Deploy, mở Logs và đợi health check `/api.php?action=health` thành công.
6. Gắn custom domain trong Render, cấu hình DNS theo thông tin Render cung cấp, cập nhật `APP_URL` thành domain HTTPS thật rồi kiểm thử lại canonical/robots/sitemap.
7. Tạo backup định kỳ cho persistent disk. Render disk làm dữ liệu filesystem tồn tại qua deploy/restart; không nên dùng cấu hình một SQLite disk cho nhiều instance/scale ngang. Khi cần nhiều instance, chuyển database sang dịch vụ database dùng chung và media/package sang object storage.

Docker image lắng nghe cổng `PORT` (Render mặc định 10000). Không đổi `PORT` nếu chưa đổi cấu hình dịch vụ tương ứng. Render edge tự chuyển HTTP sang HTTPS; với hosting khác, PHP tự chuyển các trang động sang HTTPS. Nếu chạy sau proxy, `TRUST_PROXY_HEADERS=true` chỉ nên bật khi proxy do anh kiểm soát. Health endpoint luôn chạy kiểm tra database/storage thật thay vì chỉ trả redirect.


## 6. Quản trị sản phẩm

Truy cập `/admin/` và đăng nhập bằng tài khoản được tạo từ biến môi trường.

- **Biểu tượng/ảnh bìa:** JPG, PNG hoặc WEBP, tối đa 5 MB mỗi ảnh.
- **Gói cài đặt:** một trong các định dạng được liệt kê, tối đa 200 MB.
- **Liên kết ngoài:** chỉ chấp nhận HTTPS.
- **Slug:** chữ thường, số và dấu gạch ngang; phải duy nhất.
- **Công khai:** bắt buộc có HTTPS download URL hoặc gói tải lên hợp lệ.
- **Điểm đánh giá:** mặc định 0 (chưa đánh giá). Chỉ điền điểm khi có dữ liệu xác thực; bản này chưa có hệ thống đánh giá/review của người dùng.
- **Paid:** checkout, thanh toán và cấp quyền tải chưa được tích hợp. Sản phẩm Paid chỉ được lưu ở trạng thái bản nháp; không dùng bản này để thu tiền.

Quản trị viên phải xác minh quyền phát hành/phân phối, quét malware, kiểm tra chữ ký số và thử tải/cài trên thiết bị sạch trước khi công khai. Mã nguồn không bao gồm antivirus sandbox hoặc chứng nhận an toàn tự động.

## 7. API

| Endpoint | Mục đích |
|---|---|
| `GET /api.php?action=health` | Health check, database/storage/admin readiness |
| `GET /api.php?action=bootstrap` | Cấu hình cửa hàng, danh mục, nổi bật, CSRF/session |
| `GET /api.php?action=products&q=&category=&sort=&page=` | Tìm kiếm và phân trang |
| `GET /api.php?action=product&slug=` | Chi tiết sản phẩm và sản phẩm liên quan |
| `GET /api.php?action=media&file=` | Phục vụ ảnh đã upload theo mã tệp an toàn |
| `POST /api.php?action=login` | Đăng nhập, cần `X-CSRF-Token` |
| `POST /api.php?action=logout` | Đăng xuất, cần `X-CSRF-Token` |
| `POST /api.php?action=download` | Mở liên kết tải hoặc tạo URL tải package, cần CSRF |
| `GET /api.php?action=download_file&slug=` | Tải gói riêng từ storage |
| `GET/POST/PUT/DELETE /api.php?action=admin_products` | CRUD sản phẩm, yêu cầu admin; thao tác ghi cần CSRF |
| `POST /api.php?action=admin_upload` | Upload ảnh/package, yêu cầu admin và CSRF |

## 8. Những việc bắt buộc trước khi bật public traffic

- Điền tên pháp lý, địa chỉ liên hệ và email hỗ trợ/tiếp nhận khiếu nại ở `legal-notice/index.html`; thay toàn bộ placeholder `[BỔ SUNG...]` bằng dữ liệu thật. Không mở public traffic khi trang pháp lý còn placeholder.
- Rà soát nghĩa vụ pháp lý hiện hành đối với mô hình website và phạm vi sản phẩm tại quốc gia hoạt động. Các trang điều khoản/chính sách trong mã nguồn là bản khởi tạo, không phải tư vấn pháp lý hay xác nhận đã hoàn tất thủ tục.
- Chỉ công khai ứng dụng đã xác minh quyền phân phối và kiểm tra gói cài đặt; không để sản phẩm demo/placeholder ngoài cửa hàng.
- Cấu hình HTTPS, `APP_URL`, `APP_KEY`, admin secret, persistent storage và backup.
- Kiểm tra URL tải, ảnh, mobile, 404, sitemap, robots, trang quyền riêng tư và quy trình gỡ nội dung.
- Giữ `ALLOW_REGISTRATION=false` vì chưa có xác minh email, khôi phục mật khẩu và quy trình chống tài khoản giả. Không bật trước khi bổ sung các luồng này.
- Không bật bán ứng dụng trả phí trước khi có cổng thanh toán, đơn hàng, biên nhận, hoàn tiền, cấp quyền và đối soát.

## 9. Kiểm tra mã nguồn

Các kiểm tra đã chạy trong môi trường đóng gói:

```bash
php -l config/bootstrap.php
php -l api.php
php -l index.php
php -l subpage/index.php
php -l sitemap.php
php -l robots.php
node --check js/custom.261126163157.js
node --check admin/admin.js
```

Môi trường đóng gói không có PDO SQLite/MySQL và không có Docker daemon, vì vậy chưa thể chạy kiểm thử end-to-end database/upload/download hoặc build container tại đây. Sau khi deploy, thực hiện checklist ở mục 8 và xác nhận trực tiếp qua Render Logs/health endpoint trước khi công bố URL.
