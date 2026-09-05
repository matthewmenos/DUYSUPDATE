/**
 * Open Graph link preview fetcher — SSRF-guarded port of the legacy
 * `DUYS/duys/services/link_preview.py`.
 *
 * Network access is constrained: http(s) only, public hosts only
 * (private/loopback/link-local/multicast/reserved ranges are rejected),
 * short timeout, capped response size, and the final redirected URL host
 * is validated too (guards redirect-based SSRF).
 */
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

const TIMEOUT_MS = 4000;
const MAX_BYTES = 600_000;
const UA = 'DUYSBot/1.0 (+link-preview)';
const URL_RE = /https?:\/\/[^\s<>"]+/i;

const PRIVATE_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/** True when every resolved address is a public, routable IP. */
async function isPublicHost(host) {
  try {
    const records = await lookup(host, { all: true });
    if (!records.length) return false;
    return records.every(({ address }) => {
      if (isIP(address) === 0) return false;
      if (PRIVATE_RE.test(address)) return false;
      if (address === '::1' || /^fc/.test(address) || /^fd/.test(address)) return false;
      if (address === '0.0.0.0' || address === '::') return false;
      return true;
    });
  } catch {
    return false;
  }
}

/** Extract the first URL from text (trailing punctuation trimmed). */
export function firstUrl(text) {
  if (!text) return null;
  const m = URL_RE.exec(String(text));
  if (!m) return null;
  return m[0].replace(/[),.!?;:]+$/, '');
}

/** Extract a meta tag value matching any of the given names. */
function metaTag(html, names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // property="og:title" content="..." (either attribute order)
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i')
    ];
    for (const re of patterns) {
      const m = re.exec(html);
      if (m && m[1] && m[1].trim()) return m[1].trim();
    }
  }
  return '';
}

/**
 * Fetch an OG preview for a URL. Never throws — returns a preview dict or null.
 */
export async function fetch(url) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname) return null;
    if (!(await isPublicHost(parsed.hostname))) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let resp;
    try {
      resp = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }
      });
    } finally {
      clearTimeout(timer);
    }

    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.includes('html')) return null;

    // Validate the final redirected host too.
    const finalUrl = new URL(resp.url);
    if (!(await isPublicHost(finalUrl.hostname))) return null;

    const body = await resp.text();
    const html = body.slice(0, MAX_BYTES);

    let title = metaTag(html, ['og:title', 'twitter:title']);
    if (!title) {
      const mt = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
      if (mt) title = mt[1].trim();
    }
    const description = metaTag(html, ['og:description', 'twitter:description', 'description']);
    let image = metaTag(html, ['og:image', 'twitter:image', 'twitter:image:src']);
    if (image) {
      try {
        image = new URL(image, finalUrl).href;
        if (!/^https?:$/.test(new URL(image).protocol)) image = '';
      } catch {
        image = '';
      }
    }

    if (!(title || description || image)) return null;

    return {
      url: parsed.href,
      title: String(title).slice(0, 200),
      description: String(description).slice(0, 300),
      image: String(image).slice(0, 500),
      domain: (finalUrl.hostname || '').replace(/^www\./, '')
    };
  } catch {
    return null;
  }
}

export default { firstUrl, fetch };