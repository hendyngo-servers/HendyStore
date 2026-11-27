<?php
declare(strict_types=1);
require_once __DIR__ . '/../features/api.php';

if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
    fwrite(STDERR, "PDO SQLite is required for this test.\n");
    exit(1);
}
$db = new PDO('sqlite::memory:');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec('CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, password_hash TEXT, role TEXT, created_at TEXT)');
$db->exec('CREATE TABLE products(id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, title TEXT)');
$db->exec('CREATE TABLE app_meta(meta_key TEXT PRIMARY KEY, meta_value TEXT NOT NULL)');
hendystore_feature_schema($db);
hendystore_feature_schema($db);

$expected = [
    'app_product_specs', 'app_product_screenshots', 'app_versions',
    'app_product_reviews', 'app_user_library', 'app_download_history',
    'app_user_notifications', 'app_download_grants',
];
$actual = $db->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
foreach ($expected as $table) {
    if (!in_array($table, $actual, true)) {
        throw new RuntimeException('Missing table: ' . $table);
    }
}
$columns = $db->query('PRAGMA table_info(app_user_library)')->fetchAll(PDO::FETCH_COLUMN, 1);
if (!in_array('last_platform', $columns, true)) {
    throw new RuntimeException('The user library must track the last platform.');
}
if (!hendystore_feature_safe_package_url('https://downloads.example.org/app.apk')) {
    throw new RuntimeException('HTTPS package URL should be accepted.');
}
if (hendystore_feature_safe_package_url('http://downloads.example.org/app.apk')) {
    throw new RuntimeException('Non-HTTPS package URL must be rejected.');
}
echo "Store Ecosystem schema smoke test passed: additive tables, repeatable schema setup and HTTPS package validation.\n";
