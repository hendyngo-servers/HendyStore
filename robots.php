<?php
declare(strict_types=1);
require_once __DIR__ . '/config/bootstrap.php';
$base = app_base_url();
header('Content-Type: text/plain; charset=utf-8');
echo "User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /config/\nDisallow: /database/\nDisallow: /storage/\nDisallow: /api.php\nDisallow: /bin/\nSitemap: {$base}/sitemap.xml\n";
