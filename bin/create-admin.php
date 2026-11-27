<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/config/bootstrap.php';

try {
    $db = store_db();
    $email = strtolower(trim((string) env_value('ADMIN_EMAIL', '')));
    $password = (string) env_value('ADMIN_PASSWORD', '');
    if ($email === '' || $password === '') {
        fwrite(STDERR, "Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment or .env file first.\n");
        exit(1);
    }
    ensure_environment_admin($db);
    fwrite(STDOUT, "Administrator account is ready for {$email}.\n");
} catch (Throwable $error) {
    fwrite(STDERR, "Admin setup failed: {$error->getMessage()}\n");
    exit(1);
}
