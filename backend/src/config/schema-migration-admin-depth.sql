-- Phase 4: Admin & Verification depth
-- verification_requests: badge applications + face/id moderation queue
CREATE TABLE IF NOT EXISTS verification_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  requested_badge VARCHAR(50) DEFAULT '',
  cost_paid INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  admin_notes TEXT DEFAULT '',
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_vr_type CHECK (type IN ('badge', 'face', 'id')),
  CONSTRAINT valid_vr_status CHECK (status IN ('pending', 'approved', 'rejected'))
);
CREATE INDEX IF NOT EXISTS idx_vr_user_type ON verification_requests(user_id, type);
CREATE INDEX IF NOT EXISTS idx_vr_status ON verification_requests(status);
CREATE INDEX IF NOT EXISTS idx_vr_created_at ON verification_requests(created_at DESC);

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('badge_verification', true, 'Allow users to request verified badges'),
  ('face_verification', true, 'Allow users to submit face verification photos'),
  ('economy_controls', true, 'Allow admins to adjust user points/tokens')
ON CONFLICT DO NOTHING;