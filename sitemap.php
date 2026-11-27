<?php
declare(strict_types=1);
require_once __DIR__ . '/config/bootstrap.php';
$base = app_base_url();
header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=900');
$urls = [$base.'/', $base.'/legal-notice/', $base.'/privacy/', $base.'/terms-of-use/', $base.'/developer-policy/'];
try {
    $db=store_db();
    $rows=$db->query("SELECT slug FROM products WHERE status='published' ORDER BY updated_at DESC LIMIT 50000")->fetchAll();
    foreach ($rows as $row) $urls[]=$base.'/apps/'.rawurlencode((string)$row['slug']);
} catch (Throwable $error) { error_log('[Hendy Store sitemap] '.$error->getMessage()); }
echo "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
foreach (array_unique($urls) as $url) echo '  <url><loc>'.htmlspecialchars($url,ENT_XML1|ENT_QUOTES,'UTF-8')."</loc></url>\n";
echo "</urlset>\n";
