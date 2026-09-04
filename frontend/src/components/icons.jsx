import React from 'react';

/** DUYS inline SVG icon set — ported1:1 from the legacy app's `_macros.html` (Feather-style, no emojis).
 *  Each icon renders as an inline SVG with `stroke="currentColor"` so it inherits text color.
 */
const PATHS = {
  home: <><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  explore: <><circle cx="12" cy="12" r="9" /><path d="m15 9-2 4-4 2 2-4z" /></>,
  bell: <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  broadcast: <><circle cx="12" cy="12" r="2" /><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><circle cx="16" cy="14" r="1.4" /></>,
  coins: <><circle cx="9" cy="9" r="6" /><path d="M16.5 8.5a6 6 0 1 1-5 10" /></>,
  gift: <><rect x="3" y="9" width="18" height="12" rx="1" /><path d="M3 13h18M12 9v12M12 9S10 3 7.5 4.5 9 9 12 9s6.5.5 4.5-4.5S12 9 12 9" /></>,
  verify: <><path d="m9 12 2 2 4-4" /><path d="M12 2 14.5 4.5 18 4l-.5 3.5L21 9l-2 3 2 3-3.5 1.5L18 20l-3.5-.5L12 22l-2.5-2.5L6 20l.5-3.5L3 15l2-3-2-3 3.5-1.5L6 4l3.5.5z" /></>,
  boost: <><polyline points="22 7 13.5 15.5 8.5 10.5 1 18" /><polyline points="16 7 22 7 22 13" /></>,
  admin: <><path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6Z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4.6 15H4.5a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 11 4.6V4.5a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 21 11h.1a2 2 0 1 1 0 4z" /></>,
  heart: <><path d="M19 5.5a4.5 4.5 0 0 0-7 1 4.5 4.5 0 0 0-7-1C2.5 7.5 3 11 7 14.5l5 4.5 5-4.5c4-3.5 4.5-7 2-9z" /></>,
  comment: <><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>,
  repost: <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>,
  tip: <><circle cx="12" cy="12" r="9" /><path d="M12 7v1m0 8v1m-3-5h6m-6 0a1.5 1.5 0 0 1 0-3h1.5a1.5 1.5 0 0 0 0-3H9m6 6a1.5 1.5 0 0 1-1.5 1.5H12a1.5 1.5 0 0 0 0 3H15" /></>,
  chart: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /><line x1="3" y1="20" x2="21" y2="20" /></>,
  fire: <><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
  video: <><rect x="2" y="5" width="14" height="14" rx="2" /><path d="m16 9 6-3v12l-6-3z" /></>,
  poll: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  article: <><path d="M4 3h16v18H4z" /><path d="M8 7h8M8 11h8M8 15h5" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  menu: <><path d="M3 6h18M3 12h18M3 18h18" /></>,
  chevron: <><path d="m6 9 6 6 6-6" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></>,
  moon: <><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></>,
  send: <><path d="M22 2 11 13M22 2 15 22l-4-9-9-4z" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
  close: <><path d="M18 6 6 18M6 6l12 12" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
  'eye-off': <><path d="M9.9 5.1A9.6 9.6 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3 3.7M6.6 6.6A16 16 0 0 0 2 12s3.5 7 10 7a9.5 9.5 0 0 0 4.3-1M3 3l18 18" /><path d="M9.5 9.5a3 3 0 0 0 4.2 4.2" /></>,
  phone: <><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.1-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></>,
  mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 19v3" /></>,
  play: <><path d="M8 5v14l11-7-11-7z" /></>,
  stop: <><path d="M6 6h12v12H6z" /></>,
  paperclip: <><path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L10 17.5a1.7 1.7 0 0 1-2.3-2.3l7.8-7.8" /></>,
  document: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></>,
  contact: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2.2" /><path d="M5.5 16a3.5 3.5 0 0 1 7 0M15 9h4M15 13h4" /></>,
  camera: <><path d="M5 7h3l1.5-2h5L16 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" /><circle cx="12" cy="13" r="3.2" /></>,
  palette: <><path d="M12 2a10 10 0 1 0 0 20 2 2 0 0 0 2-2 2 2 0 0 1 2-2h1a5 5 0 0 0 5-5 9 9 0 0 0-9-9z" /><circle cx="7.5" cy="11" r="1" /><circle cx="11" cy="7" r="1" /><circle cx="16" cy="9" r="1" /></>,
  location: <><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>,
  forward: <><path d="M15 17l5-5-5-5M20 12H9a4 4 0 0 0-4 4v2" /></>,
  'more-vertical': <><circle cx="12" cy="5" r="2" fill="currentColor" stroke="currentColor" strokeWidth="0" /><circle cx="12" cy="12" r="2" fill="currentColor" stroke="currentColor" strokeWidth="0" /><circle cx="12" cy="19" r="2" fill="currentColor" stroke="currentColor" strokeWidth="0" /></>,
  'arrow-left': <><path d="M19 12H5" /><path d="m12 5-7 7 7 7" /></>,
  'arrow-up': <><circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" /><path d="M12 16V8M8 12l4-4 4 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
  pause: <><rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none" /><rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none" /></>,
  block: <><circle cx="12" cy="12" r="10" /><line x1="4.9" y1="4.9" x2="19.1" y2="19.1" /></>,
  star: <><polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2" /></>,
  'share-out': <><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></>,
  brightness: <><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></>,
  'zoom-in': <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></>,
  mute: <><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v3" /><line x1="8" y1="22" x2="16" y2="22" /></>,
  checkmark: <><polyline points="20 6 9 17 4 12" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>,
  pin: <><line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" /></>,
};

/** Render a DUYS icon by name. Falls back to a plain circle when unknown. */
function Icon({ name, size = 24, strokeWidth = 2, className }) {
  if (!name || !PATHS[name]) {
    return (
      <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
      </svg>
    );
  }
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

export default Icon;

/** Eye icon (password reveal toggle) — named export for auth screens. */
export function IconEye({ size = 24, strokeWidth = 2, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS.eye}
    </svg>
  );
}

/** Eye-off icon (password hide toggle) — named export for auth screens. */
export function IconEyeOff({ size = 24, strokeWidth = 2, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS['eye-off']}
    </svg>
  );
}