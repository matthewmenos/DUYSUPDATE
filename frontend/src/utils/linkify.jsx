import React, { Fragment } from 'react';
import { Link } from 'react-router-dom';

/**
 * linkify — render post/comment text with @mentions, #hashtags and URLs
 * turned into clickable elements. Ported from legacy DUYS `text.py linkify`
 * (client-side rendering, injected into React nodes rather than HTML).
 */
const TOKEN_RE = /(https?:\/\/[^\s<>"]+)|(?<![\w@])@([A-Za-z0-9_]{1,30})|(?<![\w#])#([A-Za-z0-9_]{1,50})/g;

/** Trim trailing punctuation from an auto-detected URL token. */
export function trimTrailing(url) {
  return url.replace(/[),.!?;:]+$/, '');
}

function truncateUrl(url) {
  return url.length <= 60 ? url : `${url.slice(0, 57)}…`;
}

/**
 * Render `text` as an array of React nodes with mentions/hashtags/URLs linked.
 */
export function renderLinkified(text) {
  if (!text) return null;
  const out = [];
  let last = 0;
  let key = 0;

  for (const m of String(text).matchAll(TOKEN_RE)) {
    if (m.index > last) {
      out.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>);
    }
    if (m[1]) {
      const url = trimTrailing(m[1]);
      out.push(
        <a
          key={key++}
          href={url}
          target="_blank"
          rel="noopener nofollow"
          className="link-ext text-blue-400 hover:underline break-all"
        >
          {truncateUrl(url)}
        </a>
      );
    } else if (m[2]) {
      out.push(
        <Link key={key++} to={`/profile/${m[2].toLowerCase()}`} className="link-mention text-blue-400 hover:underline">
          @{m[2]}
        </Link>
      );
    } else if (m[3]) {
      out.push(
        <Link key={key++} to={`/explore?tag=${encodeURIComponent(m[3].toLowerCase())}`} className="link-tag text-blue-400 hover:underline">
          #{m[3]}
        </Link>
      );
    }
    last = m.index + m[0].length;
  }

  if (last < text.length) {
    out.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  }
  return out;
}

export default renderLinkified;