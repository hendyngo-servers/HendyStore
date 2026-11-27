CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'customer',
  created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(180) NOT NULL UNIQUE,
  title VARCHAR(180) NOT NULL,
  developer VARCHAR(160) NOT NULL,
  category VARCHAR(100) NOT NULL,
  short_description VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  platform VARCHAR(180) NOT NULL DEFAULT 'Windows, Android, Web',
  price_type VARCHAR(30) NOT NULL DEFAULT 'Free',
  icon VARCHAR(500) NOT NULL,
  cover VARCHAR(500) NOT NULL,
  screenshots_json TEXT NOT NULL,
  download_url TEXT NOT NULL,
  downloads BIGINT UNSIGNED NOT NULL DEFAULT 0,
  rating DECIMAL(2,1) NOT NULL DEFAULT 0,
  featured TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX idx_products_category_status (category, status),
  INDEX idx_products_downloads (downloads)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key CHAR(64) PRIMARY KEY,
  hits INT UNSIGNED NOT NULL DEFAULT 0,
  window_started_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_meta (
  meta_key VARCHAR(100) PRIMARY KEY,
  meta_value TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
