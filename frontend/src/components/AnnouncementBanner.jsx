import React, { useEffect, useState } from 'react';
import api from '../api/client';

/**
 * AnnouncementBanner — admin-set broadcast message shown at the top of every
 * page, exactly like the legacy `base.html` banner. Settings come from the
 * public GET /auth/config endpoint (app_config table). Dismissal is stored
 * for the session so it doesn't re-appear on every navigation.
 */
function AnnouncementBanner() {
  const [text, setText] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/auth/config')
      .then((res) => {
        if (cancelled || !res.data) return;
        setText(res.data.announcementText || '');
        setEnabled(!!res.data.announcementEnabled && !!res.data.announcementText);
      })
      .catch(() => {
        /* app_config may not exist yet — silently skip the banner */
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('duys-announcement-dismissed') === '1') {
        setDismissed(true);
      }
    } catch (e) { /* private mode */ }
  }, []);

  if (!enabled || dismissed) return null;

  const handleDismiss = () => {
    try { sessionStorage.setItem('duys-announcement-dismissed', '1'); } catch (e) { /* */ }
    setDismissed(true);
  };

  return (
    <div
      className="announcement-banner"
      role="banner"
      style={{
        position: 'relative',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '10px 16px',
        background: 'rgb(var(--c-blue))',
        color: '#fff',
        fontSize: 14,
        fontWeight: 600,
        textAlign: 'center',
        boxShadow: '0 4px 20px rgba(29, 155, 246, 0.35)',
      }}
    >
      <span>{text}</span>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss announcement"
        style={{
          background: 'none',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          fontSize: 16,
          lineHeight: 1,
          padding: '2px 6px',
          borderRadius: 999,
          opacity: 0.85,
        }}
      >
        ✕
      </button>
    </div>
  );
}

export default AnnouncementBanner;