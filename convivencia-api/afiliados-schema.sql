-- Material Educativo Chile - módulo de vendedores. SOLO desarrollo; no aplicar en producción sin validación.
-- Ninguna tabla cambia el cobro de Mercado Pago ni el otorgamiento de Drive.
CREATE TABLE IF NOT EXISTS store_affiliate_sellers (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL CHECK(code ~ '^[A-Z0-9_-]{4,24}$'),
  display_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'Chile',
  password_hash TEXT,
  password_salt TEXT,
  commission_bps INT NOT NULL DEFAULT 1000 CHECK(commission_bps BETWEEN 0 AND 10000),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS store_affiliate_sellers_email_unique ON store_affiliate_sellers(lower(contact_email));

-- Una atribución por pedido. Se valida en el servidor antes de guardar.
CREATE TABLE IF NOT EXISTS store_affiliate_attributions (
  order_id BIGINT PRIMARY KEY REFERENCES store_orders(id) ON DELETE RESTRICT,
  seller_id BIGINT NOT NULL REFERENCES store_affiliate_sellers(id),
  seller_code_snapshot TEXT NOT NULL,
  commission_bps_snapshot INT NOT NULL CHECK(commission_bps_snapshot BETWEEN 0 AND 10000),
  referral_seen_at TIMESTAMPTZ NOT NULL,
  attributed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(referral_seen_at <= attributed_at)
);
CREATE INDEX IF NOT EXISTS idx_store_affiliate_attributions_seller ON store_affiliate_attributions(seller_id);

-- Una línea de comisión por cada ítem de pedido, nunca dos veces para el mismo ítem.
CREATE TABLE IF NOT EXISTS store_affiliate_commissions (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES store_orders(id) ON DELETE RESTRICT,
  order_item_id BIGINT NOT NULL UNIQUE REFERENCES store_order_items(id) ON DELETE RESTRICT,
  seller_id BIGINT NOT NULL REFERENCES store_affiliate_sellers(id),
  item_title TEXT NOT NULL,
  sale_amount_clp INT NOT NULL CHECK(sale_amount_clp >= 0),
  rate_bps INT NOT NULL CHECK(rate_bps BETWEEN 0 AND 10000),
  commission_clp INT NOT NULL CHECK(commission_clp >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','reversed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT,
  CHECK((status='reversed')=(reversed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_store_affiliate_commissions_seller_status ON store_affiliate_commissions(seller_id,status,created_at);

CREATE TABLE IF NOT EXISTS store_affiliate_payouts (
  id BIGSERIAL PRIMARY KEY,
  seller_id BIGINT NOT NULL REFERENCES store_affiliate_sellers(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_clp INT NOT NULL CHECK(total_clp >= 0),
  transfer_reference TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by BIGINT REFERENCES users(id),
  receipt_filename TEXT,
  receipt_mime TEXT,
  receipt_data BYTEA,
  CHECK(period_end >= period_start)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_payout_period ON store_affiliate_payouts(seller_id,period_start,period_end);
CREATE TABLE IF NOT EXISTS store_affiliate_payout_lines (
  payout_id BIGINT NOT NULL REFERENCES store_affiliate_payouts(id) ON DELETE RESTRICT,
  commission_id BIGINT NOT NULL UNIQUE REFERENCES store_affiliate_commissions(id) ON DELETE RESTRICT,
  PRIMARY KEY (payout_id,commission_id)
);

CREATE TABLE IF NOT EXISTS store_affiliate_sessions (
  token_hash TEXT PRIMARY KEY,
  seller_id BIGINT NOT NULL REFERENCES store_affiliate_sellers(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_affiliate_sessions_seller ON store_affiliate_sessions(seller_id);
