-- DUYS Schema Migration: Social Depth (Phase 3)
-- Run this ONCE against your production database.
-- Adds group conversations, message reactions, blocks, mutes, message pins,
-- channel verifications, and live-room speaker/heart tracking. All tables are
-- additive — safe to run alongside existing schema.sql.

-- ============================================================================
-- 1) Message reactions (1:1 direct messages)
-- ============================================================================
CREATE TABLE IF NOT EXISTS message_reactions (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);

-- ============================================================================
-- 2) Message pins (pinned messages in a 1:1 conversation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS message_pins (
  message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  pinned_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pinned_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3) Conversation blocks & mutes for 1:1 messaging
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversation_blocks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_blocks_user ON conversation_blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_blocks_blocked ON conversation_blocks(blocked_id);

CREATE TABLE IF NOT EXISTS conversation_mutes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, conversation_id)
);
-- ============================================================================
-- 4) Group conversations
-- ============================================================================
CREATE TABLE IF NOT EXISTS group_conversations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_token VARCHAR(64) UNIQUE DEFAULT '',
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_badge VARCHAR(20) DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_conversations_invite ON group_conversations(invite_token);
CREATE INDEX IF NOT EXISTS idx_group_conversations_created ON group_conversations(created_at DESC);

CREATE TABLE IF NOT EXISTS group_members (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  muted BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, user_id),
  CONSTRAINT valid_group_member_role CHECK (role IN ('owner', 'admin', 'member'))
);

CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);

CREATE TABLE IF NOT EXISTS group_messages (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  reply_to INTEGER REFERENCES group_messages(id) ON DELETE SET NULL,
  read_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_group_messages_sender ON group_messages(sender_id);

CREATE TABLE IF NOT EXISTS group_message_reactions (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_message_reactions_msg ON group_message_reactions(message_id);

-- ============================================================================
-- 5) Channel depth: mutes + verifications
-- ============================================================================
CREATE TABLE IF NOT EXISTS channel_mutes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_mutes_user ON channel_mutes(user_id);

CREATE TABLE IF NOT EXISTS channel_verifications (
  id SERIAL PRIMARY KEY,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge VARCHAR(20) NOT NULL DEFAULT 'blue',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(channel_id, user_id),
  CONSTRAINT valid_channel_verify_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_channel_verifications_channel ON channel_verifications(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_verifications_user ON channel_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_verifications_status ON channel_verifications(status);

-- ============================================================================
-- 6) Group verification (self-apply + admin review)
-- ============================================================================
CREATE TABLE IF NOT EXISTS group_verifications (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge VARCHAR(20) NOT NULL DEFAULT 'blue',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, user_id),
  CONSTRAINT valid_group_verify_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_group_verifications_group ON group_verifications(group_id);
CREATE INDEX IF NOT EXISTS idx_group_verifications_user ON group_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_group_verifications_status ON group_verifications(status);

-- ============================================================================
-- 7) Channel view tracking (parity with legacy /c/<handle>/view/<post_id>)
-- ============================================================================

-- ============================================================================
-- 8) Live Spaces: speakers + hearts
-- ============================================================================
CREATE TABLE IF NOT EXISTS room_speakers (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_speakers_room ON room_speakers(room_id);
CREATE INDEX IF NOT EXISTS idx_room_speakers_user ON room_speakers(user_id);

CREATE TABLE IF NOT EXISTS room_hearts (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_hearts_room ON room_hearts(room_id);

-- ============================================================================
-- 9) WebRTC calls (signaling queue — server is a relay, not a TURN/STUN server)
-- ============================================================================
CREATE TABLE IF NOT EXISTS calls (
  id VARCHAR(64) PRIMARY KEY,
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
  caller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL DEFAULT 'voice',
  status VARCHAR(20) NOT NULL DEFAULT 'ringing',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP,
  CONSTRAINT valid_call_kind CHECK (kind IN ('voice', 'video')),
  CONSTRAINT valid_call_status CHECK (status IN ('ringing', 'active', 'ended', 'declined'))
);

CREATE INDEX IF NOT EXISTS idx_calls_caller ON calls(caller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status, created_at);

CREATE TABLE IF NOT EXISTS call_signals (
  id SERIAL PRIMARY KEY,
  call_id VARCHAR(64) NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL,
  data TEXT NOT NULL,
  emitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  delivered BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_call_signals_call ON call_signals(call_id);
CREATE INDEX IF NOT EXISTS idx_call_signals_to ON call_signals(to_user_id, delivered);