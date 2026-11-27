<?php
declare(strict_types=1);

require_once __DIR__ . '/config/bootstrap.php';

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$action = (string) ($_GET['action'] ?? $_POST['action'] ?? 'bootstrap');

function serve_media_file(): never
{
    require_method('GET');
    $token = (string) ($_GET['file'] ?? '');
    if (!valid_media_token($token)) {
        http_response_code(404);
        exit;
    }
    try {
        $object = neon_storage_get('media/' . $token);
        $mime = (string) ($object['ContentType'] ?? 'application/octet-stream');
        if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
            http_response_code(415);
            exit;
        }
        $body = $object['Body'];
        $length = $object['ContentLength'] ?? (is_object($body) && method_exists($body, 'getSize') ? $body->getSize() : null);
        header('Content-Type: ' . $mime);
        if (is_numeric($length)) header('Content-Length: ' . (string) $length);
        header('Cache-Control: public, max-age=86400');
        header('X-Content-Type-Options: nosniff');
        while (is_object($body) && method_exists($body, 'eof') && !$body->eof()) {
            echo $body->read(1024 * 1024);
            if (connection_aborted()) break;
        }
        exit;
    } catch (Throwable $error) {
        error_log('[Hendy Store media] Storage read failed: ' . get_class($error));
        http_response_code(404);
        exit;
    }
}

function serve_package(PDO $db): never
{
    require_method('GET');
    $slug = trim((string) ($_GET['slug'] ?? ''));
    $stmt = $db->prepare("SELECT slug, price_type, download_url FROM products WHERE slug = :slug AND status = 'published' LIMIT 1");
    $stmt->execute([':slug' => $slug]);
    $product = $stmt->fetch();
    if (!$product || $product['price_type'] === 'Paid' || !str_starts_with((string) $product['download_url'], 'file:')) {
        http_response_code(404);
        exit;
    }
    $token = substr((string) $product['download_url'], 5);
    if (!valid_package_token($token)) {
        http_response_code(404);
        exit;
    }

    rate_limit_or_fail($db, 'package-download', 80, 3600);
    try {
        $object = neon_storage_get('packages/' . $token);
    } catch (Throwable $error) {
        error_log('[Hendy Store download] Object Storage read failed: ' . get_class($error));
        http_response_code(404);
        exit;
    }

    $update = $db->prepare('UPDATE products SET downloads = downloads + 1 WHERE slug = :slug');
    $update->execute([':slug' => $slug]);
    $extension = strtolower(pathinfo($token, PATHINFO_EXTENSION));
    $contentType = (string) ($object['ContentType'] ?? 'application/octet-stream');
    if (!preg_match('/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i', $contentType)) $contentType = 'application/octet-stream';
    $body = $object['Body'];
    $length = $object['ContentLength'] ?? (is_object($body) && method_exists($body, 'getSize') ? $body->getSize() : null);

    @set_time_limit(0);
    header('Content-Type: ' . $contentType);
    if (is_numeric($length)) header('Content-Length: ' . (string) $length);
    header('Content-Disposition: attachment; filename="' . preg_replace('/[^a-zA-Z0-9._-]/', '-', $slug) . '.' . $extension . '"');
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Accel-Buffering: no');
    while (is_object($body) && method_exists($body, 'eof') && !$body->eof()) {
        echo $body->read(1024 * 1024);
        if (connection_aborted()) break;
    }
    exit;
}

function admin_upload(PDO $db): never
{
    require_method('POST');
    require_admin($db);
    require_csrf();

    $kind = (string) ($_POST['kind'] ?? '');
    $file = $_FILES['file'] ?? null;
    if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string) ($file['tmp_name'] ?? ''))) {
        json_response(['ok' => false, 'error' => 'Không nhận được tệp tải lên hợp lệ.'], 422);
    }

    $size = (int) ($file['size'] ?? 0);
    $originalName = (string) ($file['name'] ?? 'file');
    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $tmp = (string) $file['tmp_name'];

    if ($kind === 'media') {
        if ($size < 1 || $size > 5 * 1024 * 1024) {
            json_response(['ok' => false, 'error' => 'Ảnh phải có dung lượng tối đa 5 MB.'], 422);
        }
        $image = @getimagesize($tmp);
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($tmp) ?: '';
        $allowed = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
        if (!$image || !isset($allowed[$extension]) || $mime !== $allowed[$extension]) {
            json_response(['ok' => false, 'error' => 'Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP hợp lệ.'], 422);
        }
        if (($image[0] ?? 0) > 8000 || ($image[1] ?? 0) > 8000 || (($image[0] ?? 0) * ($image[1] ?? 0)) > 30000000) {
            json_response(['ok' => false, 'error' => 'Kích thước ảnh vượt giới hạn an toàn.'], 422);
        }
        $token = bin2hex(random_bytes(16)) . '.' . $extension;
        try {
            neon_storage_put('media/' . $token, $tmp, $mime);
        } catch (Throwable $error) {
            error_log('[Hendy Store upload] Image upload failed: ' . get_class($error));
            json_response(['ok' => false, 'error' => 'Không thể lưu ảnh vào Neon Object Storage. Kiểm tra cấu hình bucket.'], 503);
        }
        json_response(['ok' => true, 'data' => ['path' => 'media:' . $token, 'size' => $size]]);
    }

    if ($kind === 'package') {
        $allowedExtensions = ['apk','apks','xapk','zip','7z','rar','exe','msi','dmg','pkg','deb','rpm','tar','gz','pdf','ipa','appx','msix','appimage'];
        $maxBytes = min(200 * 1024 * 1024, (int) env_value('MAX_UPLOAD_BYTES', (string) (200 * 1024 * 1024)));
        if (!in_array($extension, $allowedExtensions, true) || $size < 1 || $size > $maxBytes) {
            json_response(['ok' => false, 'error' => 'Gói tải phải thuộc định dạng được hỗ trợ và không vượt quá 200 MB.'], 422);
        }
        $token = bin2hex(random_bytes(16)) . '.' . $extension;
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($tmp) ?: 'application/octet-stream';
        if ($mime === 'text/plain' || $mime === 'application/x-empty') $mime = 'application/octet-stream';
        try {
            neon_storage_put('packages/' . $token, $tmp, $mime);
        } catch (Throwable $error) {
            error_log('[Hendy Store upload] Package upload failed: ' . get_class($error));
            json_response(['ok' => false, 'error' => 'Không thể lưu gói cài đặt vào Neon Object Storage. Kiểm tra cấu hình bucket.'], 503);
        }
        json_response(['ok' => true, 'data' => ['path' => 'file:' . $token, 'size' => $size, 'sha256' => hash_file('sha256', $tmp)]]);
    }

    json_response(['ok' => false, 'error' => 'Loại tệp tải lên không hợp lệ.'], 422);
}

try {
    if ($action === 'media') {
        serve_media_file();
    }

    $db = store_db();
    if ($action === 'health') {
        require_method('GET');
        try {
            app_base_url();
        } catch (Throwable $configurationError) {
            json_response(['ok' => false, 'status' => 'configuration_required', 'error' => 'Set APP_URL to the public HTTPS domain before launch.'], 503);
        }
        $db->query('SELECT 1')->fetchColumn();
        $storage = neon_storage_probe();
        $adminCount = (int) $db->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn();
        if ($adminCount < 1) {
            json_response(['ok' => false, 'status' => 'setup_required', 'error' => 'Configure ADMIN_EMAIL and ADMIN_PASSWORD before opening the store.'], 503);
        }
        if (!$storage) {
            json_response(['ok' => false, 'status' => 'storage_unavailable', 'error' => 'Neon Object Storage is not reachable.'], 503);
        }
        $published = (int) $db->query("SELECT COUNT(*) FROM products WHERE status = 'published'")->fetchColumn();
        header('Cache-Control: no-store');
        json_response(['ok' => true, 'status' => 'healthy', 'service' => 'hendy-store', 'database' => 'postgresql', 'storage' => 'neon-object-storage', 'auth' => env_value('NEON_AUTH_BASE_URL') !== null, 'administrators' => $adminCount, 'publishedProducts' => $published]);
    }
    if ($action === 'download_file') {
        serve_package($db);
    }

    store_session();

    require_once __DIR__ . '/features/api.php';
    if (hendystore_feature_api($db, $action, $method)) {
        exit;
    }

    switch ($action) {
        case 'client_config':
            require_method('GET');
            json_response(['ok' => true, 'data' => [
                'authUrl' => env_value('NEON_AUTH_BASE_URL'),
                'realtimeUrl' => env_value('NEON_REALTIME_URL'),
                'functionUrl' => env_value('NEON_STORE_FUNCTION_URL'),
                'authEnabled' => env_value('NEON_AUTH_BASE_URL') !== null,
                'realtimeEnabled' => env_value('NEON_REALTIME_URL') !== null && env_value('NEON_STORE_FUNCTION_URL') !== null,
            ]]);
            break;

        case 'bootstrap':
            require_method('GET');
            $user = current_user($db);
            $categories = $db->query("SELECT DISTINCT category FROM products WHERE status = 'published' ORDER BY category ASC")->fetchAll(PDO::FETCH_COLUMN);
            $featured = $db->query("SELECT * FROM products WHERE status = 'published' AND featured = 1 ORDER BY updated_at DESC LIMIT 4")->fetchAll();
            json_response([
                'ok' => true,
                'data' => [
                    'categories' => $categories,
                    'featured' => array_map('present_product', $featured),
                    'user' => $user,
                    'csrfToken' => csrf_token(),
                    'storeName' => env_value('STORE_NAME', 'Hendy Store'),
                    'registrationEnabled' => env_bool('ALLOW_REGISTRATION', false),
                    'neonAuthEnabled' => env_value('NEON_AUTH_BASE_URL') !== null,
                    'neonAuthPublicSignup' => env_bool('NEON_AUTH_PUBLIC_SIGNUP', false),
                    'realtimeEnabled' => env_value('NEON_REALTIME_URL') !== null && env_value('NEON_STORE_FUNCTION_URL') !== null,
                ],
            ]);
            break;

        case 'products':
            require_method('GET');
            $q = trim((string) ($_GET['q'] ?? ''));
            $q = mb_substr_safe($q, 100);
            $category = mb_substr_safe(trim((string) ($_GET['category'] ?? '')), 100);
            $sort = (string) ($_GET['sort'] ?? 'popular');
            $page = min(100000, max(1, (int) ($_GET['page'] ?? 1)));
            $limit = min(48, max(1, (int) ($_GET['limit'] ?? 24)));
            $where = ["status = 'published'"];
            $params = [];
            if ($q !== '') {
                $where[] = '(title LIKE :q1 OR developer LIKE :q2 OR short_description LIKE :q3 OR description LIKE :q4)';
                $needle = '%' . $q . '%';
                $params[':q1'] = $needle;
                $params[':q2'] = $needle;
                $params[':q3'] = $needle;
                $params[':q4'] = $needle;
            }
            if ($category !== '' && $category !== 'Tất cả') {
                $where[] = 'category = :category';
                $params[':category'] = $category;
            }
            $order = match ($sort) {
                'newest' => 'created_at DESC',
                'rating' => 'rating DESC, downloads DESC',
                'name' => 'title ASC',
                default => 'featured DESC, downloads DESC, rating DESC',
            };
            $whereSql = implode(' AND ', $where);
            $count = $db->prepare("SELECT COUNT(*) FROM products WHERE $whereSql");
            $count->execute($params);
            $total = (int) $count->fetchColumn();
            $stmt = $db->prepare("SELECT * FROM products WHERE $whereSql ORDER BY $order LIMIT :limit OFFSET :offset");
            foreach ($params as $key => $value) {
                $stmt->bindValue($key, $value);
            }
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', ($page - 1) * $limit, PDO::PARAM_INT);
            $stmt->execute();
            json_response([
                'ok' => true,
                'data' => array_map('present_product', $stmt->fetchAll()),
                'meta' => ['page' => $page, 'limit' => $limit, 'total' => $total, 'pages' => (int) ceil($total / $limit)],
            ]);
            break;

        case 'product':
            require_method('GET');
            $slug = trim((string) ($_GET['slug'] ?? ''));
            if ($slug === '' || strlen($slug) > 180) {
                json_response(['ok' => false, 'error' => 'Mã ứng dụng không hợp lệ.'], 400);
            }
            $stmt = $db->prepare("SELECT * FROM products WHERE slug = :slug AND status = 'published' LIMIT 1");
            $stmt->execute([':slug' => $slug]);
            $product = $stmt->fetch();
            if (!$product) {
                json_response(['ok' => false, 'error' => 'Không tìm thấy ứng dụng.'], 404);
            }
            $related = $db->prepare("SELECT * FROM products WHERE category = :category AND slug != :slug AND status = 'published' ORDER BY downloads DESC LIMIT 4");
            $related->execute([':category' => $product['category'], ':slug' => $slug]);
            json_response(['ok' => true, 'data' => present_product($product, true), 'related' => array_map('present_product', $related->fetchAll())]);
            break;

        case 'login':
            require_method('POST');
            require_csrf();
            $input = request_data();
            $email = strtolower(trim((string) ($input['email'] ?? '')));
            $password = (string) ($input['password'] ?? '');
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190 || strlen($password) > 1024) {
                json_response(['ok' => false, 'error' => 'Email hoặc mật khẩu không chính xác.'], 401);
            }
            rate_limit_or_fail($db, 'login-ip', 30, 900);
            rate_limit_or_fail($db, 'login-account-' . $email, 8, 900);
            $stmt = $db->prepare('SELECT id, name, email, password_hash, role FROM users WHERE email = :email LIMIT 1');
            $stmt->execute([':email' => $email]);
            $account = $stmt->fetch();
            if (!$account || !password_verify($password, $account['password_hash'])) {
                password_verify($password, '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');
                json_response(['ok' => false, 'error' => 'Email hoặc mật khẩu không chính xác.'], 401);
            }
            session_regenerate_id(true);
            $_SESSION['user_id'] = (int) $account['id'];
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
            json_response(['ok' => true, 'data' => ['user' => public_user($account), 'csrfToken' => csrf_token()]]);
            break;

        case 'register':
            require_method('POST');
            require_csrf();
            if (!env_bool('ALLOW_REGISTRATION', false)) {
                json_response(['ok' => false, 'error' => 'Đăng ký tài khoản hiện đang tạm khóa. Vui lòng liên hệ đơn vị vận hành.'], 403);
            }
            rate_limit_or_fail($db, 'register', 4, 3600);
            $input = request_data();
            $name = trim((string) ($input['name'] ?? ''));
            $email = strtolower(trim((string) ($input['email'] ?? '')));
            $password = (string) ($input['password'] ?? '');
            if (unicode_length($name) < 2 || unicode_length($name) > 80) {
                json_response(['ok' => false, 'error' => 'Tên phải có từ 2 đến 80 ký tự.'], 422);
            }
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
                json_response(['ok' => false, 'error' => 'Email không hợp lệ.'], 422);
            }
            if (unicode_length($password) < 12 || strlen($password) > 72) {
                json_response(['ok' => false, 'error' => 'Mật khẩu cần tối thiểu 12 ký tự và không vượt quá 72 byte.'], 422);
            }
            try {
                $insert = $db->prepare('INSERT INTO users (name, email, password_hash, role, created_at) VALUES (:name, :email, :hash, :role, :created)');
                $insert->execute([':name' => $name, ':email' => $email, ':hash' => password_hash($password, PASSWORD_DEFAULT), ':role' => 'customer', ':created' => date('Y-m-d H:i:s')]);
            } catch (PDOException $error) {
                if ((string) $error->getCode() === '23000' || str_contains(strtolower($error->getMessage()), 'unique')) {
                    json_response(['ok' => false, 'error' => 'Email này đã được sử dụng.'], 409);
                }
                throw $error;
            }
            session_regenerate_id(true);
            $_SESSION['user_id'] = (int) $db->lastInsertId();
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
            json_response(['ok' => true, 'data' => ['user' => ['id' => (int) $_SESSION['user_id'], 'name' => $name, 'email' => $email, 'role' => 'customer'], 'csrfToken' => csrf_token()]], 201);
            break;

        case 'logout':
            require_method('POST');
            require_csrf();
            $_SESSION = [];
            if (ini_get('session.use_cookies')) {
                $params = session_get_cookie_params();
                setcookie(session_name(), '', [
                    'expires' => time() - 42000,
                    'path' => $params['path'],
                    'domain' => $params['domain'],
                    'secure' => $params['secure'],
                    'httponly' => $params['httponly'],
                    'samesite' => 'Lax',
                ]);
            }
            session_destroy();
            json_response(['ok' => true]);
            break;

        case 'download':
            require_method('POST');
            require_csrf();
            rate_limit_or_fail($db, 'download', 80, 3600);
            $input = request_data();
            $slug = trim((string) ($input['slug'] ?? ''));
            $stmt = $db->prepare("SELECT id, price_type, download_url FROM products WHERE slug = :slug AND status = 'published' LIMIT 1");
            $stmt->execute([':slug' => $slug]);
            $product = $stmt->fetch();
            if (!$product || $product['price_type'] === 'Paid' || !$product['download_url']) {
                json_response(['ok' => false, 'error' => 'Ứng dụng chưa có liên kết tải miễn phí hợp lệ.'], 404);
            }
            if (str_starts_with((string) $product['download_url'], 'file:')) {
                $token = substr((string) $product['download_url'], 5);
                if (!valid_package_token($token) || !neon_storage_exists('packages/' . $token)) {
                    json_response(['ok' => false, 'error' => 'Gói tải hiện không khả dụng.'], 404);
                }
                json_response(['ok' => true, 'data' => ['url' => 'api.php?action=download_file&slug=' . rawurlencode($slug)]]);
            }
            $externalUrl = (string) $product['download_url'];
            if (!filter_var($externalUrl, FILTER_VALIDATE_URL) || strtolower((string) parse_url($externalUrl, PHP_URL_SCHEME)) !== 'https') {
                json_response(['ok' => false, 'error' => 'Liên kết tải của sản phẩm cần được quản trị viên cập nhật sang HTTPS.'], 409);
            }
            $update = $db->prepare('UPDATE products SET downloads = downloads + 1 WHERE id = :id');
            $update->execute([':id' => $product['id']]);
            json_response(['ok' => true, 'data' => ['url' => $product['download_url']]]);
            break;


        case 'download_redirect':
            require_method('GET');
            rate_limit_or_fail($db, 'download-redirect', 80, 3600);
            $slug = trim((string) ($_GET['slug'] ?? ''));
            $stmt = $db->prepare("SELECT id, price_type, download_url FROM products WHERE slug = :slug AND status = 'published' LIMIT 1");
            $stmt->execute([':slug' => $slug]);
            $product = $stmt->fetch();
            if (!$product || $product['price_type'] === 'Paid' || trim((string) $product['download_url']) === '') {
                http_response_code(404);
                exit;
            }
            $downloadUrl = (string) $product['download_url'];
            if (str_starts_with($downloadUrl, 'file:')) {
                $token = substr($downloadUrl, 5);
                if (!valid_package_token($token) || !neon_storage_exists('packages/' . $token)) {
                    http_response_code(404);
                    exit;
                }
                header('Cache-Control: no-store');
                header('Location: ' . app_base_url() . '/api.php?action=download_file&slug=' . rawurlencode($slug), true, 302);
                exit;
            }
            $parts = parse_url($downloadUrl);
            if (!filter_var($downloadUrl, FILTER_VALIDATE_URL) || strtolower((string) ($parts['scheme'] ?? '')) !== 'https' || empty($parts['host']) || isset($parts['user']) || isset($parts['pass'])) {
                http_response_code(409);
                exit;
            }
            $update = $db->prepare('UPDATE products SET downloads = downloads + 1 WHERE id = :id');
            $update->execute([':id' => $product['id']]);
            header('Cache-Control: no-store');
            header('Location: ' . $downloadUrl, true, 302);
            exit;

        case 'ai_product_copy':
            require_method('POST');
            require_admin($db);
            require_csrf();
            $input = request_data();
            $title = trim((string) ($input['title'] ?? ''));
            $developer = trim((string) ($input['developer'] ?? ''));
            $category = trim((string) ($input['category'] ?? ''));
            $short = trim((string) ($input['shortDescription'] ?? ''));
            if ($title === '' || unicode_length($title) > 180 || unicode_length($short) > 255 || unicode_length($developer) > 160 || unicode_length($category) > 100) {
                json_response(['ok' => false, 'error' => 'Thông tin ứng dụng không hợp lệ.'], 422);
            }
            try {
                $description = neon_ai_completion(
                    'Bạn là biên tập viên cửa hàng ứng dụng. Viết phần giới thiệu tiếng Việt trung thực, không bịa tính năng, không khẳng định an toàn/chứng nhận khi không có chứng cứ. Viết 2-4 đoạn, rõ công dụng, đối tượng và lưu ý cài đặt.',
                    "Tên ứng dụng: {$title}\nNhà phát triển: {$developer}\nDanh mục: {$category}\nMô tả ngắn đã được quản trị viên cung cấp: {$short}\nHãy tạo mô tả chi tiết phù hợp từ dữ kiện này. Nếu thiếu thông tin, diễn đạt thận trọng và không tự bịa."
                );
                json_response(['ok' => true, 'data' => ['description' => $description]]);
            } catch (Throwable $error) {
                error_log('[Hendy Store AI copy] ' . $error->getMessage());
                json_response(['ok' => false, 'error' => $error->getMessage()], 503);
            }

        case 'admin_upload':
            admin_upload($db);
            break;

        case 'admin_products':
            require_admin($db);
            if ($method === 'GET') {
                $rows = $db->query('SELECT * FROM products ORDER BY updated_at DESC')->fetchAll();
                $adminRows = array_map(static function (array $product): array {
                    $row = present_product($product, true);
                    $row['downloadUrl'] = $product['download_url'];
                    return $row;
                }, $rows);
                json_response(['ok' => true, 'data' => $adminRows]);
            }
            require_csrf();
            $input = request_data();
            if ($method === 'POST') {
                $product = validate_product_input($input);
                $now = date('Y-m-d H:i:s');
                try {
                    $stmt = $db->prepare('INSERT INTO products (slug,title,developer,category,short_description,description,version,platform,price_type,icon,cover,screenshots_json,download_url,downloads,rating,featured,status,created_at,updated_at) VALUES (:slug,:title,:developer,:category,:short_description,:description,:version,:platform,:price_type,:icon,:cover,:screenshots_json,:download_url,0,:rating,:featured,:status,:created_at,:updated_at)');
                    $stmt->execute($product + [':created_at' => $now, ':updated_at' => $now]);
                } catch (PDOException $error) {
                    if ((string) $error->getCode() === '23000' || str_contains(strtolower($error->getMessage()), 'unique')) {
                        json_response(['ok' => false, 'error' => 'Slug này đã tồn tại. Hãy chọn slug khác.'], 409);
                    }
                    throw $error;
                }
                json_response(['ok' => true, 'data' => ['id' => (int) $db->lastInsertId()]], 201);
            }
            if ($method === 'PUT') {
                $id = (int) ($input['id'] ?? 0);
                if ($id < 1) {
                    json_response(['ok' => false, 'error' => 'ID sản phẩm không hợp lệ.'], 422);
                }
                $product = validate_product_input($input);
                $product[':id'] = $id;
                $product[':updated_at'] = date('Y-m-d H:i:s');
                try {
                    $stmt = $db->prepare('UPDATE products SET slug=:slug,title=:title,developer=:developer,category=:category,short_description=:short_description,description=:description,version=:version,platform=:platform,price_type=:price_type,icon=:icon,cover=:cover,screenshots_json=:screenshots_json,download_url=:download_url,rating=:rating,featured=:featured,status=:status,updated_at=:updated_at WHERE id=:id');
                    $stmt->execute($product);
                } catch (PDOException $error) {
                    if ((string) $error->getCode() === '23000' || str_contains(strtolower($error->getMessage()), 'unique')) {
                        json_response(['ok' => false, 'error' => 'Slug này đã tồn tại. Hãy chọn slug khác.'], 409);
                    }
                    throw $error;
                }
                json_response(['ok' => true]);
            }
            if ($method === 'DELETE') {
                $id = (int) ($input['id'] ?? 0);
                if ($id < 1) {
                    json_response(['ok' => false, 'error' => 'ID sản phẩm không hợp lệ.'], 422);
                }
                $stmt = $db->prepare('DELETE FROM products WHERE id = :id');
                $stmt->execute([':id' => $id]);
                json_response(['ok' => true, 'data' => ['deleted' => $stmt->rowCount() > 0]]);
            }
            header('Allow: GET, POST, PUT, DELETE');
            json_response(['ok' => false, 'error' => 'Phương thức không được hỗ trợ.'], 405);
            break;

        case 'me':
            require_method('GET');
            json_response(['ok' => true, 'data' => ['user' => current_user($db), 'csrfToken' => csrf_token()]]);
            break;

        default:
            json_response(['ok' => false, 'error' => 'API action không tồn tại.'], 404);
    }
} catch (Throwable $error) {
    error_log('[Hendy Store API] ' . $error->getMessage());
    json_response(['ok' => false, 'error' => 'Máy chủ gặp sự cố. Vui lòng thử lại sau.'], 500);
}
