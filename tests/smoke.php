<?php
declare(strict_types=1);
$tempRoot=sys_get_temp_dir().'/hendy-store-test-'.bin2hex(random_bytes(6));
if (!mkdir($tempRoot,0700,true)) throw new RuntimeException('Unable to create test directory.');
putenv('APP_ENV=development'); putenv('STORAGE_PATH='.$tempRoot.'/storage'); putenv('SQLITE_PATH='.$tempRoot.'/store.sqlite');
putenv('ADMIN_EMAIL=admin@example.test'); putenv('ADMIN_PASSWORD=Hendy-Store12!');
require_once dirname(__DIR__).'/config/bootstrap.php';
$db=store_db();
if (!is_subclass_of(NeonPostgresSessionHandler::class, SessionUpdateTimestampHandlerInterface::class)) {
    throw new RuntimeException('Neon session handler must implement PHP strict session ID validation and timestamp renewal.');
}
$sessionTestDb = new PDO('sqlite::memory:');
$sessionTestDb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$sessionTestDb->exec('CREATE TABLE app_sessions(session_id TEXT PRIMARY KEY,session_data TEXT NOT NULL,expires_at INTEGER NOT NULL)');
$sessionHandler = new NeonPostgresSessionHandler($sessionTestDb);
$sessionPayload = 'csrf_token|s:32:"session-test-token";';
if (!$sessionHandler->write('session-test-id', $sessionPayload)
    || !$sessionHandler->validateId('session-test-id')
    || $sessionHandler->read('session-test-id') !== $sessionPayload
    || !$sessionHandler->updateTimestamp('session-test-id', $sessionPayload)
    || !$sessionHandler->validateId('session-test-id')) {
    throw new RuntimeException('Neon Postgres session read/write/strict-validation/timestamp renewal failed.');
}
if (!$sessionHandler->destroy('session-test-id') || $sessionHandler->validateId('session-test-id')) {
    throw new RuntimeException('Neon session destruction must invalidate the previous session ID.');
}
$tables=$db->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
foreach (['users','products','rate_limits','app_meta'] as $table) if (!in_array($table,$tables,true)) throw new RuntimeException('Missing table: '.$table);
$q=$db->prepare("SELECT password_hash FROM users WHERE email=:email AND role='admin'"); $q->execute([':email'=>'admin@example.test']);
$hash=(string)$q->fetchColumn();
if ($hash===''||!password_verify('Hendy-Store12!',$hash)) throw new RuntimeException('Environment administrator bootstrap failed.');

// A changed Render secret must update an already-created admin account.
$rotatedPassword = 'Hendy-Store12!Rotated';
putenv('ADMIN_PASSWORD='.$rotatedPassword);
$_ENV['ADMIN_PASSWORD'] = $rotatedPassword;
ensure_environment_admin($db);
$q=$db->prepare("SELECT password_hash FROM users WHERE lower(email)=:email AND role='admin'");
$q->execute([':email'=>'admin@example.test']);
$rotatedHash=(string)$q->fetchColumn();
if ($rotatedHash==='' || !password_verify($rotatedPassword,$rotatedHash)) {
    throw new RuntimeException('Existing administrator password synchronization failed.');
}
$adminCount=(int)$db->query("SELECT COUNT(*) FROM users WHERE role='admin'")->fetchColumn();
if ($adminCount !== 1) throw new RuntimeException('Administrator bootstrap created a duplicate admin account.');
$storage=storage_root(); if (!is_dir($storage)||!is_writable($storage)) throw new RuntimeException('Storage is not writable.');
if (unicode_length('Hendy-Store12!')<12) throw new RuntimeException('Password length validation failed.');
echo "Smoke test passed: schema, admin bootstrap, password hash and storage.\n";
