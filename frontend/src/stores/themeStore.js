import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Theme store — controls the app-wide dark/light theme.
 * Brand palette is black & blue; dark is the default.
 * The `light` class on <html> flips the CSS variables in index.css.
 */

export const THEMES = ['dark', 'light'];

function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('light', theme === 'light');
  root.style.colorScheme = theme;

  // Keep the mobile status bar / browser chrome in sync with the theme.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f7fb' : '#000000');
}

const useThemeStore = create(
  persist(
    (set, get) => ({
      theme: 'dark',

      setTheme: (theme) => {
        if (!THEMES.includes(theme)) return;
        applyTheme(theme);
        set({ theme });
      },

      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        set({ theme: next });
      }
    }),
    {
      name: 'duys-theme'
    }
  )
);

// Re-apply on every load (persist rehydrates synchronously from localStorage).
// The inline script in index.html already applied the class pre-paint to
// avoid a flash of the wrong theme; this keeps the store and DOM in sync.
applyTheme(useThemeStore.getState().theme);

export default useThemeStore;