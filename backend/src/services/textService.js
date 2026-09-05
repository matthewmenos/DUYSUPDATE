/**
 * Text utilities — ported 1:1 from legacy DUYS `services/text.py`.
 * Server-side extraction helpers for hashtag indexing, @mention
 * notifications and link-preview URL detection. (Client-side rendering
 * linkify lives in the React components, not here.)
 */

// A URL, an @mention, or a #hashtag (mentions/hashtags must not follow a word char)
const MENTION_RE = /(?<![\w@])@([A-Za-z0-9_]{1,30})/g;
const HASHTAG_RE = /(?<![\w#])#([A-Za-z0-9_]{1,50})/g;
const URL_RE = /https?:\/\/[^\s<>"]+/i;

/**
 * Extract unique @mentions (usernames, without the @).
 */
export function extractMentions(text) {
  if (!text) return [];
  const seen = new Set();
  for (const m of String(text).matchAll(MENTION_RE)) seen.add(m[1].toLowerCase());
  return [...seen];
}

/**
 * Extract unique #hashtags (without the #, lowercased).
 */
export function extractHashtags(text) {
  if (!text) return [];
  const seen = new Set();
  for (const m of String(text).matchAll(HASHTAG_RE)) seen.add(m[1].toLowerCase());
  return [...seen];
}

/**
 * Return the first URL in the text (with trailing punctuation trimmed),
 * or null when there is none.
 */
export function firstUrl(text) {
  if (!text) return null;
  const m = URL_RE.exec(String(text));
  if (!m) return null;
  return m[0].replace(/[),.!?;:]+$/, '');
}

/**
 * Trim trailing punctuation from a full-match URL token (kept for parity with
 * the legacy `_trim_trailing_punct`; used by the client-side linkify too).
 */
export function trimTrailingPunct(url) {
  return url.replace(/[),.!?;:]+$/, '');
}

export default { extractMentions, extractHashtags, firstUrl, trimTrailingPunct };