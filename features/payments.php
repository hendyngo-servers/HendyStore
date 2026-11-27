<?php
declare(strict_types=1);

/**
 * Incoming SePay transfer processing. A paid entitlement is created only when
 * the signed event matches an outstanding order, bank account and exact amount.
 * Outgoing refunds remain an explicit manual transfer workflow.
 */
function hendystore_payment_schema(PDO $db): void
{
    static $ready = false;
    if ($ready) return;
    $driver = $db->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($driver === 'pgsql') {
        $db->exec('ALTER TABLE products ADD COLUMN IF NOT EXISTS price_amount_vnd BIGINT NOT NULL DEFAULT 0');
        $db->exec('ALTER TABLE app_download_grants ADD COLUMN IF NOT EXISTS order_id BIGINT NULL');
    } elseif ($driver === 'sqlite') {
        $columns = $db->query('PRAGMA table_info(products)')->fetchAll(PDO::FETCH_COLUMN, 1);
        if (!in_array('price_amount_vnd', $columns, true)) $db->exec('ALTER TABLE products ADD COLUMN price_amount_vnd BIGINT NOT NULL DEFAULT 0');
        $columns = $db->query('PRAGMA table_info(app_download_grants)')->fetchAll(PDO::FETCH_COLUMN, 1);
        if (!in_array('order_id', $columns, true)) $db->exec('ALTER TABLE app_download_grants ADD COLUMN order_id BIGINT NULL');
    }
    $id = $driver === 'pgsql' ? 'BIGSERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $db->exec("CREATE TABLE IF NOT EXISTS app_orders (
        id $id, order_code VARCHAR(40) NOT NULL UNIQUE, payment_code VARCHAR(40) NOT NULL UNIQUE,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        version_id BIGINT NULL, amount_vnd BIGINT NOT NULL CHECK(amount_vnd > 0),
        status VARCHAR(24) NOT NULL DEFAULT 'pending'
          CHECK(status IN ('pending','paid','expired','cancelled','refund_requested','refunded')),
        payment_provider VARCHAR(24) NOT NULL DEFAULT 'sepay',
        expires_at TIMESTAMP NOT NULL, paid_at TIMESTAMP NULL, created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL
    )");
    $db->exec("CREATE TABLE IF NOT EXISTS app_payment_transactions (
        id $id, provider VARCHAR(24) NOT NULL, provider_transaction_id VARCHAR(120) NOT NULL,
        order_id BIGINT NULL REFERENCES app_orders(id) ON DELETE SET NULL, amount_vnd BIGINT NOT NULL,
        account_number VARCHAR(80) NOT NULL DEFAULT '', transfer_type VARCHAR(20) NOT NULL DEFAULT '',
        payment_code VARCHAR(40) NOT NULL DEFAULT '', reference_text TEXT NOT NULL DEFAULT '',
        payload_json TEXT NOT NULL, status VARCHAR(24) NOT NULL, created_at TIMESTAMP NOT NULL,
        UNIQUE(provider, provider_transaction_id)
    )");
    $db->exec("CREATE TABLE IF NOT EXISTS app_refund_requests (
        id $id, order_id BIGINT NOT NULL UNIQUE REFERENCES app_orders(id) ON DELETE RESTRICT,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, reason TEXT NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','rejected','refunded')),
        refund_reference VARCHAR(160) NOT NULL DEFAULT '', admin_note TEXT NOT NULL DEFAULT '',
        requested_at TIMESTAMP NOT NULL, resolved_at TIMESTAMP NULL, updated_at TIMESTAMP NOT NULL
    )");
    $db->exec('CREATE INDEX IF NOT EXISTS idx_app_orders_user ON app_orders(user_id, created_at DESC)');
    $db->exec('CREATE INDEX IF NOT EXISTS idx_app_orders_status_expiry ON app_orders(status, expires_at)');
    $db->exec('CREATE INDEX IF NOT EXISTS idx_app_transactions_order ON app_payment_transactions(order_id, created_at DESC)');
    $db->exec('CREATE INDEX IF NOT EXISTS idx_app_refunds_status ON app_refund_requests(status, requested_at)');
    $ready = true;
}

function hendystore_payment_config(): array
{
    $bank = trim((string)env_value('SEPAY_BANK_CODE', ''));
    $account = preg_replace('/\s+/', '', (string)env_value('SEPAY_BANK_ACCOUNT', '')) ?? '';
    $secret = trim((string)env_value('SEPAY_WEBHOOK_SECRET', ''));
    return [
        'enabled' => $bank !== '' && $account !== '' && $secret !== '',
        'bankCode' => $bank,
        'bankName' => trim((string)env_value('SEPAY_BANK_NAME', '')),
        'accountNumber' => $account,
        'accountName' => trim((string)env_value('SEPAY_ACCOUNT_NAME', '')),
    ];
}

function hendystore_sepay_signature_valid(string $body, string $timestamp, string $signature, string $secret, ?int $now = null): bool
{
    if ($secret === '' || !ctype_digit($timestamp)) return false;
    $seconds = (int)$timestamp;
    if ($seconds > 1000000000000) $seconds = (int)floor($seconds / 1000);
    if (abs(($now ?? time()) - $seconds) > 300) return false;
    $signature = preg_replace('/^sha256=/i', '', trim($signature)) ?? '';
    if (!preg_match('/^[a-f0-9]{64}$/i', $signature)) return false;
    return hash_equals(strtolower(hash_hmac('sha256', $timestamp . '.' . $body, $secret)), strtolower($signature));
}

function hendystore_sepay_webhook(PDO $db): never
{
    require_method('POST');
    hendystore_payment_schema($db);
    $body = file_get_contents('php://input');
    if (!is_string($body) || $body === '' || strlen($body) > 65536) json_response(['success' => false, 'error' => 'Payload không hợp lệ.'], 400);
    $timestamp = (string)($_SERVER['HTTP_X_SEPAY_TIMESTAMP'] ?? '');
    $signature = (string)($_SERVER['HTTP_X_SEPAY_SIGNATURE'] ?? '');
    $secret = (string)env_value('SEPAY_WEBHOOK_SECRET', '');
    if (!hendystore_sepay_signature_valid($body, $timestamp, $signature, $secret)) {
        json_response(['success' => false, 'error' => 'Chữ ký webhook không hợp lệ.'], $secret === '' ? 503 : 401);
    }
    $payload = json_decode($body, true);
    if (!is_array($payload)) json_response(['success' => false, 'error' => 'JSON không hợp lệ.'], 400);
    $transactionId = trim((string)($payload['id'] ?? ''));
    $amount = (int)($payload['transferAmount'] ?? 0);
    $transferType = strtolower(trim((string)($payload['transferType'] ?? '')));
    $account = preg_replace('/\s+/', '', (string)($payload['accountNumber'] ?? '')) ?? '';
    $expectedAccount = hendystore_payment_config()['accountNumber'];
    $paymentCode = strtoupper(trim((string)($payload['code'] ?? '')));
    if ($transactionId === '' || strlen($transactionId) > 120 || $amount < 1) {
        json_response(['success' => false, 'error' => 'Thiếu mã giao dịch hoặc số tiền.'], 422);
    }

    try {
        $db->beginTransaction();
        $duplicate = $db->prepare("SELECT id FROM app_payment_transactions WHERE provider = 'sepay' AND provider_transaction_id = :tx LIMIT 1");
        $duplicate->execute([':tx' => $transactionId]);
        if ($duplicate->fetchColumn()) {
            $db->commit();
            json_response(['success' => true, 'duplicate' => true]);
        }

        $order = null;
        $status = 'unmatched';
        if ($transferType === 'in' && $expectedAccount !== '' && hash_equals($expectedAccount, $account)
            && preg_match('/^HND[A-F0-9]{10}$/', $paymentCode)) {
            $lock = $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'pgsql' ? ' FOR UPDATE' : '';
            $find = $db->prepare("SELECT id, order_code, user_id, product_id, version_id, amount_vnd, status, expires_at
                FROM app_orders WHERE payment_code = :code LIMIT 1" . $lock);
            $find->execute([':code' => $paymentCode]);
            $order = $find->fetch() ?: null;
        }

        if ($order && $order['status'] === 'pending' && strtotime((string)$order['expires_at'] . ' UTC') >= time()) {
            $status = (int)$order['amount_vnd'] === $amount ? 'matched' : 'amount_mismatch';
        } elseif ($order && $order['status'] === 'pending') {
            $status = 'expired';
            $db->prepare("UPDATE app_orders SET status = 'expired', updated_at = :now WHERE id = :id AND status = 'pending'")
                ->execute([':now' => gmdate('Y-m-d H:i:s'), ':id' => (int)$order['id']]);
        } elseif ($order) {
            $status = 'order_already_settled';
        }

        $insert = $db->prepare("INSERT INTO app_payment_transactions
            (provider, provider_transaction_id, order_id, amount_vnd, account_number, transfer_type, payment_code, reference_text, payload_json, status, created_at)
            VALUES ('sepay', :tx, :order_id, :amount, :account, :transfer_type, :code, :reference, :payload, :status, :created)");
        $insert->execute([
            ':tx' => $transactionId,
            ':order_id' => $order ? (int)$order['id'] : null,
            ':amount' => $amount,
            ':account' => $account,
            ':transfer_type' => $transferType,
            ':code' => $paymentCode,
            ':reference' => (string)($payload['content'] ?? ''),
            ':payload' => $body,
            ':status' => $status,
            ':created' => gmdate('Y-m-d H:i:s'),
        ]);

        if ($status === 'matched' && $order) {
            $now = gmdate('Y-m-d H:i:s');
            $paid = $db->prepare("UPDATE app_orders SET status = 'paid', paid_at = :now, updated_at = :now WHERE id = :id AND status = 'pending'");
            $paid->execute([':now' => $now, ':id' => (int)$order['id']]);
            if ($paid->rowCount() === 1) {
                $library = $db->prepare("INSERT INTO app_user_library(user_id, product_id, source, last_version_id, last_platform, created_at, updated_at)
                    VALUES(:uid, :pid, 'purchase', :vid, 'unknown', :now, :now)
                    ON CONFLICT(user_id, product_id) DO UPDATE SET source = 'purchase',
                    last_version_id = COALESCE(EXCLUDED.last_version_id, app_user_library.last_version_id), updated_at = EXCLUDED.updated_at");
                $library->execute([
                    ':uid' => (int)$order['user_id'], ':pid' => (int)$order['product_id'],
                    ':vid' => $order['version_id'] ? (int)$order['version_id'] : null, ':now' => $now,
                ]);
                $notify = $db->prepare("INSERT INTO app_user_notifications(user_id, product_id, version_id, notification_type, title, message, created_at)
                    VALUES(:uid, :pid, :vid, 'purchase_paid', 'Thanh toán thành công', :message, :now)");
                $notify->execute([
                    ':uid' => (int)$order['user_id'], ':pid' => (int)$order['product_id'],
                    ':vid' => $order['version_id'] ? (int)$order['version_id'] : null,
                    ':message' => 'Đơn ' . (string)$order['order_code'] . ' đã được xác minh. Quyền tải đã được cấp.',
                    ':now' => $now,
                ]);
            }
        }
        $db->commit();
        json_response(['success' => true, 'status' => $status]);
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        error_log('[HendyStore SePay] ' . get_class($error));
        json_response(['success' => false, 'error' => 'Webhook processing thất bại.'], 500);
    }
}

function hendystore_payment_api(PDO $db, string $action, string $method): bool
{
    $routes = ['store_payment_create', 'store_payment_orders', 'store_refund_request', 'store_admin_orders', 'store_admin_refund'];
    if (!in_array($action, $routes, true)) return false;
    hendystore_payment_schema($db);

    switch ($action) {
        case 'store_payment_create': {
            require_method('POST'); require_csrf();
            $user = current_user($db);
            if (!$user) json_response(['ok' => false, 'error' => 'Đăng nhập để mua sản phẩm.'], 401);
            $config = hendystore_payment_config();
            if (!$config['enabled']) json_response(['ok' => false, 'error' => 'Thanh toán chưa được cấu hình; checkout đang khóa.'], 503);
            $input = request_data();
            $query = $db->prepare("SELECT id, title, price_type, price_amount_vnd, status FROM products WHERE slug = :slug LIMIT 1");
            $query->execute([':slug' => trim((string)($input['slug'] ?? ''))]);
            $product = $query->fetch();
            if (!$product || $product['status'] !== 'published' || $product['price_type'] !== 'Paid' || (int)$product['price_amount_vnd'] < 1000) {
                json_response(['ok' => false, 'error' => 'Sản phẩm Paid chưa có giá bán hợp lệ.'], 422);
            }
            $versionId = max(0, (int)($input['version_id'] ?? 0));
            if ($versionId > 0) {
                $version = $db->prepare('SELECT id FROM app_versions WHERE id = :id AND product_id = :pid LIMIT 1');
                $version->execute([':id' => $versionId, ':pid' => (int)$product['id']]);
                if (!$version->fetchColumn()) json_response(['ok' => false, 'error' => 'Phiên bản không thuộc sản phẩm.'], 422);
            }
            $now = gmdate('Y-m-d H:i:s');
            $expires = gmdate('Y-m-d H:i:s', time() + 900);
            $orderCode = 'HDS-' . gmdate('ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
            $paymentCode = 'HND' . strtoupper(bin2hex(random_bytes(5)));
            $insert = $db->prepare("INSERT INTO app_orders(order_code, payment_code, user_id, product_id, version_id, amount_vnd, status, payment_provider, expires_at, created_at, updated_at)
                VALUES(:order, :code, :user_id, :product_id, :version_id, :amount, 'pending', 'sepay', :expires, :now, :now)");
            $insert->execute([
                ':order' => $orderCode, ':code' => $paymentCode, ':user_id' => (int)$user['id'],
                ':product_id' => (int)$product['id'], ':version_id' => $versionId > 0 ? $versionId : null,
                ':amount' => (int)$product['price_amount_vnd'], ':expires' => $expires, ':now' => $now,
            ]);
            json_response(['ok' => true, 'data' => [
                'orderCode' => $orderCode, 'paymentCode' => $paymentCode, 'productTitle' => (string)$product['title'],
                'amountVnd' => (int)$product['price_amount_vnd'], 'bankCode' => $config['bankCode'],
                'bankName' => $config['bankName'], 'accountNumber' => $config['accountNumber'],
                'accountName' => $config['accountName'], 'expiresAt' => $expires,
            ]]);
            break;
        }
        case 'store_payment_orders': {
            require_method('GET');
            $user = current_user($db);
            if (!$user) json_response(['ok' => false, 'error' => 'Đăng nhập để xem đơn hàng.'], 401);
            $query = $db->prepare("SELECT o.order_code, o.payment_code, o.amount_vnd, o.status, o.expires_at, o.paid_at, o.created_at, p.title AS product_title
                FROM app_orders o JOIN products p ON p.id = o.product_id WHERE o.user_id = :uid ORDER BY o.created_at DESC LIMIT 100");
            $query->execute([':uid' => (int)$user['id']]);
            json_response(['ok' => true, 'data' => $query->fetchAll()]);
            break;
        }
        case 'store_refund_request': {
            require_method('POST'); require_csrf();
            $user = current_user($db);
            if (!$user) json_response(['ok' => false, 'error' => 'Đăng nhập để gửi yêu cầu hoàn tiền.'], 401);
            $input = request_data();
            $orderCode = trim((string)($input['order_code'] ?? ''));
            $reason = trim((string)($input['reason'] ?? ''));
            if ($orderCode === '' || strlen($reason) < 10 || strlen($reason) > 2000) json_response(['ok' => false, 'error' => 'Lý do phải từ 10 đến 2.000 ký tự.'], 422);
            $query = $db->prepare("SELECT id FROM app_orders WHERE order_code = :code AND user_id = :uid AND status = 'paid' LIMIT 1");
            $query->execute([':code' => $orderCode, ':uid' => (int)$user['id']]);
            $orderId = (int)$query->fetchColumn();
            if (!$orderId) json_response(['ok' => false, 'error' => 'Không tìm thấy đơn đã thanh toán đủ điều kiện.'], 404);
            $now = gmdate('Y-m-d H:i:s');
            try {
                $insert = $db->prepare("INSERT INTO app_refund_requests(order_id, user_id, reason, status, requested_at, updated_at)
                    VALUES(:order_id, :uid, :reason, 'requested', :now, :now)");
                $insert->execute([':order_id' => $orderId, ':uid' => (int)$user['id'], ':reason' => $reason, ':now' => $now]);
            } catch (PDOException $error) {
                json_response(['ok' => false, 'error' => 'Đơn hàng đã có yêu cầu hoàn tiền.'], 409);
            }
            $db->prepare("UPDATE app_orders SET status = 'refund_requested', updated_at = :now WHERE id = :id")
                ->execute([':now' => $now, ':id' => $orderId]);
            json_response(['ok' => true, 'message' => 'Đã nhận yêu cầu hoàn tiền.']);
            break;
        }
        case 'store_admin_orders': {
            require_method('GET'); require_admin($db);
            $query = $db->query("SELECT o.id, o.order_code, o.payment_code, o.amount_vnd, o.status, o.created_at, o.paid_at,
                p.title AS product_title, u.email AS buyer_email, r.id AS refund_id, r.status AS refund_status, r.reason AS refund_reason
                FROM app_orders o JOIN products p ON p.id=o.product_id JOIN users u ON u.id=o.user_id
                LEFT JOIN app_refund_requests r ON r.order_id=o.id ORDER BY o.created_at DESC LIMIT 250");
            json_response(['ok' => true, 'data' => $query->fetchAll()]);
            break;
        }
        case 'store_admin_refund': {
            require_method('POST'); require_admin($db); require_csrf();
            $input = request_data();
            $refundId = (int)($input['refund_id'] ?? 0);
            $decision = (string)($input['decision'] ?? '');
            $reference = trim((string)($input['refund_reference'] ?? ''));
            $query = $db->prepare('SELECT order_id, status FROM app_refund_requests WHERE id = :id LIMIT 1');
            $query->execute([':id' => $refundId]);
            $refund = $query->fetch();
            if (!$refund) json_response(['ok' => false, 'error' => 'Không tìm thấy yêu cầu hoàn tiền.'], 404);
            $now = gmdate('Y-m-d H:i:s');
            if ($decision === 'approve' || $decision === 'reject') {
                $status = $decision === 'approve' ? 'approved' : 'rejected';
                $db->prepare('UPDATE app_refund_requests SET status = :status, resolved_at = :now, updated_at = :now WHERE id = :id')
                    ->execute([':status' => $status, ':now' => $now, ':id' => $refundId]);
                if ($decision === 'reject') {
                    $db->prepare("UPDATE app_orders SET status = 'paid', updated_at = :now WHERE id = :id AND status = 'refund_requested'")
                        ->execute([':now' => $now, ':id' => (int)$refund['order_id']]);
                }
                json_response(['ok' => true, 'status' => $status]);
            }
            if ($decision === 'mark_refunded') {
                if ($refund['status'] !== 'approved' || $reference === '') json_response(['ok' => false, 'error' => 'Chỉ ghi nhận hoàn tiền sau khi đã chuyển và nhập mã giao dịch thực tế.'], 422);
                $db->beginTransaction();
                $update = $db->prepare("UPDATE app_refund_requests SET status = 'refunded', refund_reference = :reference, resolved_at = :now, updated_at = :now WHERE id = :id AND status = 'approved'");
                $update->execute([':reference' => $reference, ':now' => $now, ':id' => $refundId]);
                if ($update->rowCount() !== 1) { $db->rollBack(); json_response(['ok' => false, 'error' => 'Yêu cầu refund đã thay đổi.'], 409); }
                $db->prepare("UPDATE app_orders SET status = 'refunded', updated_at = :now WHERE id = :id")
                    ->execute([':now' => $now, ':id' => (int)$refund['order_id']]);
                $db->commit();
                json_response(['ok' => true, 'status' => 'refunded']);
            }
            json_response(['ok' => false, 'error' => 'Thao tác không hợp lệ.'], 422);
        }
    }
    return true;
}
