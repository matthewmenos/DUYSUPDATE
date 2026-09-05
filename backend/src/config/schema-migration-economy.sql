-- DUYS Schema Migration: Economy & Monetization
-- Run this ONCE against your production database.
-- Adds ledgers, ad-earnings, token claims, tips, shop listings/purchases
-- and vault swaps. Existing tables (users.points, boosts, referrals,
-- transactions, wallet_addresses) are reused.

-- 1) Points & token ledger (reason-tagged deltas)
CREATE TABLE IF NOT EXISTS point_ledger (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta NUMERIC(15, 4) NOT NULL,
  reason VARCHAR(100) NOT NULL,
  ref VARCHAR(255) DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_point_ledger_user ON point_ledger(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_point_ledger_reason ON point_ledger(reason);

-- 2) Rewarded-ad tracking (HypeLab)
CREATE TABLE IF NOT EXISTS ad_views (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_views_user ON ad_views(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hypelab_events (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(255) NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3) Points -> DUYS token claims
CREATE TABLE IF NOT EXISTS token_claims (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points_used INTEGER NOT NULL,
  tokens NUMERIC(15, 6) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  tx_hash VARCHAR(255) DEFAULT '',
  error_msg TEXT DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_claim_status CHECK (status IN ('pending', 'confirmed', 'failed', 'voided'))
);

CREATE INDEX IF NOT EXISTS idx_token_claims_user ON token_claims(user_id, created_at DESC);

-- 4) Tips (points and/or DUYS)
CREATE TABLE IF NOT EXISTS tips (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  amount_points INTEGER NOT NULL DEFAULT 0,
  amount_duys NUMERIC(15, 6) NOT NULL DEFAULT 0,
  message VARCHAR(280) DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT tips_nonzero CHECK (amount_points > 0 OR amount_duys > 0)
);

CREATE INDEX IF NOT EXISTS idx_tips_sender ON tips(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tips_recipient ON tips(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tips_post ON tips(post_id);
-- 5) Creator shop (verified users sell downloadable files for DUYS)
CREATE TABLE IF NOT EXISTS shop_listings (
  id SERIAL PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(128) NOT NULL,
  description TEXT DEFAULT '',
  file_key VARCHAR(500) NOT NULL,
  file_url TEXT NOT NULL,
  file_name VARCHAR(255) DEFAULT '',
  price_duys NUMERIC(15, 6) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_listings_seller ON shop_listings(seller_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_shop_listings_active ON shop_listings(active);

CREATE TABLE IF NOT EXISTS shop_purchases (
  id SERIAL PRIMARY KEY,
  buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES shop_listings(id) ON DELETE CASCADE,
  paid NUMERIC(15, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(buyer_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_purchases_buyer ON shop_purchases(buyer_id);
CREATE INDEX IF NOT EXISTS idx_shop_purchases_listing ON shop_purchases(listing_id);

-- 6) Vault swaps (Buy/Sell DUYS <-> USDT, deposit-based settlement)
CREATE TABLE IF NOT EXISTS swaps (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  side VARCHAR(20) NOT NULL,
  from_token VARCHAR(20) NOT NULL,
  to_token VARCHAR(20) NOT NULL,
  from_amount NUMERIC(18, 8) NOT NULL,
  to_amount NUMERIC(18, 8) NOT NULL,
  rate NUMERIC(18, 10) NOT NULL DEFAULT 0,
  spread NUMERIC(10, 4) NOT NULL DEFAULT 0,
  user_address VARCHAR(255) DEFAULT '',
  deposit_token VARCHAR(20) NOT NULL DEFAULT '',
  status VARCHAR(50) NOT NULL DEFAULT 'awaiting_deposit',
  deposit_tx VARCHAR(255) DEFAULT '',
  payout_tx VARCHAR(255) DEFAULT '',
  error_msg TEXT DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_swap_side CHECK (side IN ('buy', 'sell', 'transfer')),
  CONSTRAINT valid_swap_status CHECK (status IN
    ('awaiting_deposit', 'deposit_seen', 'settling', 'completed', 'expired', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_swaps_user ON swaps(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_swaps_status ON swaps(status);

-- 7) Economy settings (admin-tunable via app_config)
INSERT INTO app_config (key, value, description) VALUES
  ('points_ad_reward', '10', 'Points awarded per rewarded ad view'),
  ('daily_ad_cap', '50', 'Max rewarded ad completions per user per day'),
  ('claim_points_per_token', '10', 'Points required for 1 DUYS claim'),
  ('claim_min_points', '100', 'Minimum points to start a claim'),
  ('claim_max_daily', '1', 'Max claims per day (regular users)'),
  ('claim_max_daily_verified', '3', 'Max claims per day (verified users)'),
  ('points_referral_bonus', '100', 'Points credited when a referred user signs up'),
  ('referral_earn_percent', '0.01', 'Referrer earns this share of referred users earnings'),
  ('fee_usd_boost_per_day', '1.00', 'USD price per boost-day'),
  ('swap_buy_enabled', 'true', 'Enable DUYS buy swaps'),
  ('swap_sell_enabled', 'true', 'Enable DUYS sell swaps'),
  ('token_price_override_enabled', 'false', 'Use the fixed token price below'),
  ('token_price_override_rate', '0', 'Fixed DUYS-per-USDT rate when override is on')
ON CONFLICT (key) DO NOTHING;

-- 8) Trigger for swaps.updated_at
DROP TRIGGER IF EXISTS swaps_updated_at ON swaps;
CREATE TRIGGER swaps_updated_at BEFORE UPDATE ON swaps
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
