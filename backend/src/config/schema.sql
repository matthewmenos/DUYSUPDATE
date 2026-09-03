-- DUYS PostgreSQL Database Schema
-- Unified schema replacing dual SQLite architecture

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- Users & Authentication
-- ============================================================================

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  google_id VARCHAR(255) UNIQUE,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT DEFAULT '',
  username VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  bio TEXT DEFAULT '',
  location VARCHAR(255) DEFAULT '',
  website VARCHAR(255) DEFAULT '',
  avatar_url TEXT DEFAULT '',
  banner_url TEXT DEFAULT '',
  
  -- Economy
  points INTEGER NOT NULL DEFAULT 0,
  duys_tokens NUMERIC(15, 2) NOT NULL DEFAULT 0,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  
  -- Verification & Status
  verified_badge VARCHAR(50) DEFAULT '',
  verified_badge_expires TIMESTAMP,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  is_banned BOOLEAN NOT NULL DEFAULT false,
  
  -- Security
  twofa_secret TEXT DEFAULT '',
  twofa_enabled BOOLEAN NOT NULL DEFAULT false,
  
  -- Profile
  referred_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  wallet_address VARCHAR(255) DEFAULT '',
  ringtone_url TEXT DEFAULT '',
  theme VARCHAR(50) DEFAULT 'dark',
  last_seen TIMESTAMP,
  profile_slug VARCHAR(255) DEFAULT '',
  pinned_post_id INTEGER,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT valid_verified_badge CHECK (verified_badge IN ('', 'blue', 'gold', 'grey'))
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_verified_badge ON users(verified_badge);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- ============================================================================
-- Social Graph
-- ============================================================================

CREATE TABLE follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, followee_id),
  CONSTRAINT no_self_follow CHECK (follower_id != followee_id)
);

CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_followee ON follows(followee_id);

-- ============================================================================
-- Posts & Content
-- ============================================================================

CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(50) NOT NULL DEFAULT 'text',
  body TEXT DEFAULT '',
  title VARCHAR(500) DEFAULT '',
  channel_id INTEGER,
  repost_of INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  quote_of INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  
  -- Boost
  is_sponsored BOOLEAN NOT NULL DEFAULT false,
  boost_until TIMESTAMP,
  cta VARCHAR(255) DEFAULT '',
  landing_url TEXT DEFAULT '',
  
  -- Exclusive Content
  is_exclusive BOOLEAN NOT NULL DEFAULT false,
  unlock_price NUMERIC(15, 2) NOT NULL DEFAULT 0,
  
  -- Scheduling
  scheduled_at TIMESTAMP,
  
  -- Engagement metrics
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  repost_count INTEGER NOT NULL DEFAULT 0,
  quote_count INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  share_count INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP,
  
  CONSTRAINT valid_kind CHECK (kind IN ('text', 'image', 'video', 'poll', 'article'))
);

CREATE INDEX idx_posts_author ON posts(author_id);
CREATE INDEX idx_posts_channel ON posts(channel_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_scheduled ON posts(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX idx_posts_deleted ON posts(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- Media & Attachments
-- ============================================================================

CREATE TABLE media (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key VARCHAR(500) NOT NULL,
  url TEXT NOT NULL,
  mime VARCHAR(100) DEFAULT '',
  kind VARCHAR(50) DEFAULT 'image',
  width INTEGER,
  height INTEGER,
  duration INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT valid_media_kind CHECK (kind IN ('image', 'video', 'audio'))
);

CREATE INDEX idx_media_post ON media(post_id);
CREATE INDEX idx_media_owner ON media(owner_id);

-- ============================================================================
-- Engagement
-- ============================================================================

CREATE TABLE likes (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX idx_likes_post ON likes(post_id);
CREATE INDEX idx_likes_user ON likes(user_id);

CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  like_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX idx_comments_post ON comments(post_id);
CREATE INDEX idx_comments_author ON comments(author_id);

CREATE TABLE comment_likes (
  id SERIAL PRIMARY KEY,
  comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(comment_id, user_id)
);

CREATE INDEX idx_comment_likes_comment ON comment_likes(comment_id);
CREATE INDEX idx_comment_likes_user ON comment_likes(user_id);

CREATE TABLE post_unlocks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  paid NUMERIC(15, 2) NOT NULL DEFAULT 0,
  unlocked_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);

CREATE INDEX idx_post_unlocks_user ON post_unlocks(user_id);
CREATE INDEX idx_post_unlocks_post ON post_unlocks(post_id);

-- ============================================================================
-- Polls
-- ============================================================================

CREATE TABLE poll_options (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  label VARCHAR(500) NOT NULL,
  votes INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_poll_options_post ON poll_options(post_id);

CREATE TABLE poll_votes (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX idx_poll_votes_post ON poll_votes(post_id);
CREATE INDEX idx_poll_votes_user ON poll_votes(user_id);

-- ============================================================================
-- Link Previews & Hashtags
-- ============================================================================

CREATE TABLE link_previews (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title VARCHAR(255) DEFAULT '',
  description TEXT DEFAULT '',
  image TEXT DEFAULT '',
  domain VARCHAR(255) DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(post_id)
);

CREATE INDEX idx_link_previews_post ON link_previews(post_id);

CREATE TABLE hashtags (
  tag VARCHAR(255) PRIMARY KEY,
  post_count INTEGER NOT NULL DEFAULT 0,
  last_used TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE post_hashtags (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag VARCHAR(255) NOT NULL REFERENCES hashtags(tag) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, tag)
);

CREATE INDEX idx_post_hashtags_post ON post_hashtags(post_id);
CREATE INDEX idx_post_hashtags_tag ON post_hashtags(tag);

-- ============================================================================
-- Stories
-- ============================================================================

CREATE TABLE stories (
  id SERIAL PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_key VARCHAR(500) DEFAULT '',
  media_url TEXT NOT NULL,
  media_kind VARCHAR(50) DEFAULT 'image',
  caption TEXT DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '1 day'),
  
  CONSTRAINT valid_story_media_kind CHECK (media_kind IN ('image', 'video'))
);

CREATE INDEX idx_stories_author ON stories(author_id);
CREATE INDEX idx_stories_expires_at ON stories(expires_at);

CREATE TABLE story_views (
  id SERIAL PRIMARY KEY,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(story_id, user_id)
);

CREATE INDEX idx_story_views_story ON story_views(story_id);
CREATE INDEX idx_story_views_user ON story_views(user_id);

CREATE TABLE story_reactions (
  id SERIAL PRIMARY KEY,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(story_id, user_id)
);

CREATE INDEX idx_story_reactions_story ON story_reactions(story_id);
CREATE INDEX idx_story_reactions_user ON story_reactions(user_id);

-- ============================================================================
-- Live Streaming
-- ============================================================================

CREATE TABLE rooms (
  id SERIAL PRIMARY KEY,
  host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(50) NOT NULL DEFAULT 'video',
  title VARCHAR(500) DEFAULT '',
  status VARCHAR(50) NOT NULL DEFAULT 'live',
  viewer_peak INTEGER NOT NULL DEFAULT 0,
  current_viewers INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP,
  
  CONSTRAINT valid_room_kind CHECK (kind IN ('video', 'space')),
  CONSTRAINT valid_room_status CHECK (status IN ('live', 'ended'))
);

CREATE INDEX idx_rooms_host ON rooms(host_id);
CREATE INDEX idx_rooms_status ON rooms(status, created_at DESC);

CREATE TABLE room_messages (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_room_messages_room ON room_messages(room_id);
CREATE INDEX idx_room_messages_user ON room_messages(user_id);
CREATE INDEX idx_room_messages_created_at ON room_messages(created_at DESC);

-- ============================================================================
-- Channels
-- ============================================================================

CREATE TABLE channels (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  handle VARCHAR(255) UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  banner_url TEXT DEFAULT '',
  invite_token VARCHAR(255) DEFAULT '',
  is_private BOOLEAN NOT NULL DEFAULT false,
  pinned_post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  subscriber_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channels_owner ON channels(owner_id);
CREATE INDEX idx_channels_handle ON channels(handle);
CREATE INDEX idx_channels_invite_token ON channels(invite_token);

CREATE TABLE channel_subscriptions (
  id SERIAL PRIMARY KEY,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(channel_id, user_id)
);

CREATE INDEX idx_channel_subscriptions_channel ON channel_subscriptions(channel_id);
CREATE INDEX idx_channel_subscriptions_user ON channel_subscriptions(user_id);

CREATE TABLE channel_members (
  id SERIAL PRIMARY KEY,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(channel_id, user_id),
  CONSTRAINT valid_role CHECK (role IN ('owner', 'moderator', 'member'))
);

CREATE INDEX idx_channel_members_channel ON channel_members(channel_id);
CREATE INDEX idx_channel_members_user ON channel_members(user_id);

-- ============================================================================
-- Direct Messaging
-- ============================================================================

CREATE TABLE conversations (
  id SERIAL PRIMARY KEY,
  participant_1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT different_participants CHECK (participant_1_id != participant_2_id),
  CONSTRAINT ordered_participants CHECK (participant_1_id < participant_2_id),
  UNIQUE(participant_1_id, participant_2_id)
);

CREATE INDEX idx_conversations_p1 ON conversations(participant_1_id);
CREATE INDEX idx_conversations_p2 ON conversations(participant_2_id);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  read_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_read ON messages(read_at) WHERE read_at IS NULL;

-- ============================================================================
-- Notifications
-- ============================================================================

CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT DEFAULT '',
  entity_type VARCHAR(50),
  entity_id INTEGER,
  read_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT valid_kind CHECK (kind IN ('like', 'comment', 'follow', 'mention', 
                                        'repost', 'quote', 'message', 'subscription', 
                                        'verification', 'payment', 'system'))
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_read ON notifications(user_id, read_at) WHERE read_at IS NULL;

-- ============================================================================
-- Verification & Identity
-- ============================================================================

CREATE TABLE verifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  data JSONB DEFAULT '{}',
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT valid_kind CHECK (kind IN ('email', 'phone', 'id', 'face')),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected', 'expired'))
);

CREATE INDEX idx_verifications_user ON verifications(user_id, created_at DESC);
CREATE INDEX idx_verifications_status ON verifications(status);

-- ============================================================================
-- Wallet & Transactions
-- ============================================================================

CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(50) NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  balance_after NUMERIC(15, 2) NOT NULL,
  description TEXT DEFAULT '',
  reference_id VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT valid_kind CHECK (kind IN ('deposit', 'withdrawal', 'purchase', 'refund', 
                                        'unlock', 'subscription', 'referral', 'boost'))
);

CREATE INDEX idx_transactions_user ON transactions(user_id, created_at DESC);
CREATE INDEX idx_transactions_kind ON transactions(kind);
CREATE INDEX idx_transactions_reference ON transactions(reference_id);

CREATE TABLE wallet_addresses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address VARCHAR(255) NOT NULL,
  blockchain VARCHAR(50) NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  primary_wallet BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, address)
);

CREATE INDEX idx_wallet_addresses_user ON wallet_addresses(user_id);

-- ============================================================================
-- Boosts & Promotions
-- ============================================================================

CREATE TABLE boosts (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  advertiser_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  budget NUMERIC(15, 2) NOT NULL,
  spent NUMERIC(15, 2) NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  cta VARCHAR(255) DEFAULT '',
  landing_url TEXT DEFAULT '',
  starts_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMP NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT valid_boost_status CHECK (status IN ('pending', 'active', 'paused', 'ended'))
);

CREATE INDEX idx_boosts_advertiser ON boosts(advertiser_id);
CREATE INDEX idx_boosts_status ON boosts(status);
CREATE INDEX idx_boosts_ends_at ON boosts(ends_at);

-- ============================================================================
-- Referrals
-- ============================================================================

CREATE TABLE referrals (
  id SERIAL PRIMARY KEY,
  referrer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_given NUMERIC(15, 2) NOT NULL DEFAULT 0,
  reward_redeemed NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(referrer_id, referred_user_id)
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX idx_referrals_referred ON referrals(referred_user_id);

-- ============================================================================
-- Reports & Moderation
-- ============================================================================

CREATE TABLE reports (
  id SERIAL PRIMARY KEY,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  entity_id INTEGER NOT NULL,
  reason VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action_taken VARCHAR(255),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT valid_entity_type CHECK (entity_type IN ('user', 'post', 'comment', 'message')),
  CONSTRAINT valid_report_status CHECK (status IN ('pending', 'reviewing', 'dismissed', 'actioned'))
);

CREATE INDEX idx_reports_reporter ON reports(reporter_id);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_entity ON reports(entity_type, entity_id);

-- ============================================================================
-- Admin & Logging
-- ============================================================================

CREATE TABLE admin_logs (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INTEGER,
  details JSONB DEFAULT '{}',
  ip_address INET,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_logs_admin ON admin_logs(admin_id, created_at DESC);
CREATE INDEX idx_admin_logs_action ON admin_logs(action);

CREATE TABLE feature_flags (
  key VARCHAR(255) PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Triggers for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER posts_updated_at BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER comments_updated_at BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER channels_updated_at BEFORE UPDATE ON channels
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER messages_updated_at BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER verifications_updated_at BEFORE UPDATE ON verifications
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER boosts_updated_at BEFORE UPDATE ON boosts
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER feature_flags_updated_at BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
