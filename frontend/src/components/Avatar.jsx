import React from 'react';

/** Avatar with fallback — renders an <img> that falls back to the bundled default SVG. */
function Avatar({ src, name = '', size = 44, className, rounded = true }) {
  return (
    <img
      className={className}
      src={src || '/avatar-default.svg'}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/avatar-default.svg'; }}
      style={{ width: size, height: size, borderRadius: rounded ? '9999px' : undefined, objectFit: 'cover', flexShrink: 0 }}
    />
  );
}

export default Avatar;