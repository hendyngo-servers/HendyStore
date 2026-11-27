<?php
declare(strict_types=1);
$tempRoot=sys_get_temp_dir().'/hendy-store-test-'.bin2hex(random_bytes(6));
if (!mkdir($tempRoot,0700,true)) throw new RuntimeException('Unable to create test directory.');
putenv('APP_ENV=development'); putenv('STORAGE_PATH='.$tempRoot.'/storage'); putenv('SQLITE_PATH='.$tempRoot.'/store.sqlite');
putenv('ADMIN_EMAIL=admin@example.test'); putenv('ADMIN_PASSWORD=Hendy-Store12!');
require_once dirname(__DIR__).'/config/bootstrap.php';
$db=store_db();
$tables=$db->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
foreach (['users','products','rate_limits','app_meta'] as $table) if (!in_array($table,$tables,true)) throw new RuntimeException('Missing table: '.$table);
$q=$db->prepare("SELECT password_hash FROM users WHERE email=:email AND role='admin'"); $q->execute([':email'=>'admin@example.test']);
$hash=(string)$q->fetchColumn();
if ($hash===''||!password_verify('Hendy-Store12!',$hash)) throw new RuntimeException('Environment administrator bootstrap failed.');
$storage=storage_root(); if (!is_dir($storage)||!is_writable($storage)) throw new RuntimeException('Storage is not writable.');
if (unicode_length('Hendy-Store12!')<12) throw new RuntimeException('Password length validation failed.');
echo "Smoke test passed: schema, admin bootstrap, password hash and storage.\n";
