import React, { useEffect, useRef, useState } from 'react';
import useThemeStore from '../stores/themeStore';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

/** Lazily load the Google Identity Services script once. */
function loadGsiScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('GSI failed')));
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

/**
 * Official Google sign-in button (Google Identity Services).
 * Renders Google's styled button; on successful sign-in it passes the
 * ID token `credential` to the onCredential callback, which the auth
 * pages send to POST /auth/google for verification + JWT exchange.
 */
function GoogleLoginButton({ onCredential }) {
  const theme = useThemeStore((s) => s.theme);
  const buttonRef = useRef(null);
  // Keep the latest callback without re-running the GIS effect
  const cbRef = useRef(onCredential);
  cbRef.current = onCredential;
  const [state, setState] = useState('loading'); // loading | ready | error | unavailable

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId) {
      setState('unavailable');
      return;
    }
    let cancelled = false;
    loadGsiScript()
      .then(() => {
        if (cancelled || !buttonRef.current || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response?.credential) cbRef.current(response.credential);
          }
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: theme === 'light' ? 'outline' : 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: 320,
          logo_alignment: 'center'
        });
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, theme]);

  return (
    <div className="w-full flex flex-col items-center">
      <div ref={buttonRef} className={state === 'ready' ? '' : 'opacity-0 pointer-events-none h-10'} />
      {state === 'loading' && (
        <div className="h-10 w-72 rounded-full bg-gray-800 animate-pulse" aria-label="Loading Google button" />
      )}
      {state === 'unavailable' && (
        <p className="text-sm text-gray-500 text-center">
          Google sign-in is unavailable — set VITE_GOOGLE_CLIENT_ID to enable it.
        </p>
      )}
      {state === 'error' && (
        <p className="text-sm text-gray-500 text-center">
          Could not load Google sign-in. Check your connection and reload.
        </p>
      )}
    </div>
  );
}

export default GoogleLoginButton;