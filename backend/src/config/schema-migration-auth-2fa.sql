-- DUYS Schema Migration: 2FA, App Config, Referrals
-- Run this ONCE against your production database.

-- App config for announcement banner, Google OAuth toggle
CREATE TABLE IF NOT EXISTS app_config (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Default announcement (empty = no banner)
INSERT INTO app_config (key, value, description)
VALUES ('announcement_text', '', 'Text for the top announcement banner on auth pages')
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_config (key, value, description)
VALUES ('announcement_enabled', 'false', 'Enable/disable the announcement banner')
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_config (key, value, description)
VALUES ('google_enabled', 'true', 'Enable Google OAuth login')
ON CONFLICT (key) DO NOTHING;

-- Referral column already exists in schema.sql (referred_by INTEGER REFERENCES users(id))
-- Ensure index exists for referral lookups
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);
CREATE INDEX IF NOT EXISTS idx_users_twofa_enabled ON users(twofa_enabled);

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER app_config_updated_at BEFORE UPDATE ON app_config
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
