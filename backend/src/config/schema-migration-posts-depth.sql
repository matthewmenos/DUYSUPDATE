-- DUYS Schema Migration: Posts Depth
-- Run this ONCE against your production database.
-- Adds pinning support + per-user deduped post views (poll/exclusive/schedule/link_previews tables already exist).

-- 1) Pinned posts (profile pinning — one active pin per author)
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_posts_pinned ON posts(author_id, is_pinned)
  WHERE is_pinned = true;

-- 2) Deduped post views (one view per (post, user))
CREATE TABLE IF NOT EXISTS post_views (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_views_post ON post_views(post_id);
CREATE INDEX IF NOT EXISTS idx_post_views_user ON post_views(user_id);

-- 3) Hashtag fuzzy lookup support (used by the search overlay + linkify)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_hashtags_tag_trgm ON hashtags USING gin (tag gin_trgm_ops);