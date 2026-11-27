<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/config/bootstrap.php';

$email = strtolower(trim((string) ($argv[1] ?? '')));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "Usage: php bin/reset-admin-password.php admin@example.com\n");
    exit(2);
}

$canHide = DIRECTORY_SEPARATOR !== '\\' && function_exists('shell_exec') && function_exists('posix_isatty') && posix_isatty(STDIN);
if ($canHide) {
    shell_exec('stty -echo');
    fwrite(STDOUT, "New admin password (12+ characters, max 72 bytes): ");
    $password = trim((string) fgets(STDIN));
    shell_exec('stty echo');
    fwrite(STDOUT, "\n");
} else {
    fwrite(STDOUT, "Enter new admin password (12+ characters, max 72 bytes): ");
    $password = trim((string) fgets(STDIN));
}

if (unicode_length($password) < 12 || strlen($password) > 72) {
    fwrite(STDERR, "Password must contain at least 12 characters and no more than 72 bytes.\n");
    exit(2);
}

try {
    $db = store_db();
    $stmt = $db->prepare("UPDATE users SET password_hash = :hash WHERE email = :email AND role = 'admin'");
    $stmt->execute([':hash' => password_hash($password, PASSWORD_DEFAULT), ':email' => $email]);
    if ($stmt->rowCount() !== 1) {
        fwrite(STDERR, "Admin account not found or password unchanged.\n");
        exit(1);
    }
    fwrite(STDOUT, "Admin password updated for {$email}. Log out other sessions by rotating session storage or wait for expiry.\n");
} catch (Throwable $error) {
    fwrite(STDERR, "Password reset failed: {$error->getMessage()}\n");
    exit(1);
}
