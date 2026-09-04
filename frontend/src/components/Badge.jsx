import React from 'react';

/** Verification badge - blue / gold / grey (adapted from the legacy app's verified badge;
  * uses a clean check-in-circle so no fragile rosette path data is needed.). */
const FILLS = {
  blue: '#1D9BF6',
  gold: '#F5B50A',
  grey: '#8B98A5',
};

function Badge({ kind, size = 18, className }) {
  if (!kind || !FILLS[kind]) return null;
  const fill = FILLS[kind];
  return (
    <span
      className={className}
      title={`${kind[0].toUpperCase() + kind.slice(1)} verified`}
      aria-label={`${kind[0].toUpperCase() + kind.slice(1)} verified`}
      style={{ display: 'inline-flex' }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="11" fill={fill} />
        <path d="M7.5 12.5l3 3 6-6.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default Badge;