-- Additive migration. Existing users, products and sessions are preserved.
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_amount_vnd BIGINT NOT NULL DEFAULT 0 CHECK (price_amount_vnd >= 0);
ALTER TABLE app_download_grants ADD COLUMN IF NOT EXISTS order_id BIGINT NULL;
CREATE TABLE IF NOT EXISTS app_orders (
 id BIGSERIAL PRIMARY KEY, order_code VARCHAR(40) NOT NULL UNIQUE, payment_code VARCHAR(40) NOT NULL UNIQUE,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 version_id BIGINT NULL REFERENCES app_versions(id) ON DELETE SET NULL, amount_vnd BIGINT NOT NULL CHECK(amount_vnd > 0),
 status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','expired','cancelled','refund_requested','refunded')),
 payment_provider VARCHAR(24) NOT NULL DEFAULT 'sepay', expires_at TIMESTAMP NOT NULL, paid_at TIMESTAMP NULL,
 created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_app_orders_user ON app_orders(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS app_payment_transactions (
 id BIGSERIAL PRIMARY KEY, provider VARCHAR(24) NOT NULL, provider_transaction_id VARCHAR(120) NOT NULL,
 order_id BIGINT NULL REFERENCES app_orders(id) ON DELETE SET NULL, amount_vnd BIGINT NOT NULL,
 account_number VARCHAR(80) NOT NULL DEFAULT '', transfer_type VARCHAR(20) NOT NULL DEFAULT '',
 payment_code VARCHAR(40) NOT NULL DEFAULT '', reference_text TEXT NOT NULL DEFAULT '', payload_json TEXT NOT NULL,
 status VARCHAR(24) NOT NULL, created_at TIMESTAMP NOT NULL, UNIQUE(provider, provider_transaction_id)
);
CREATE TABLE IF NOT EXISTS app_refund_requests (
 id BIGSERIAL PRIMARY KEY, order_id BIGINT NOT NULL UNIQUE REFERENCES app_orders(id) ON DELETE RESTRICT,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, reason TEXT NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','rejected','refunded')),
 refund_reference VARCHAR(160) NOT NULL DEFAULT '', admin_note TEXT NOT NULL DEFAULT '',
 requested_at TIMESTAMP NOT NULL, resolved_at TIMESTAMP NULL, updated_at TIMESTAMP NOT NULL
);
