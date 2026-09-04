import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api/client';

const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: true,

      // Initialize from localStorage
      init: async () => {
        const token = localStorage.getItem('accessToken');
        if (token) {
          try {
            const response = await api.get('/users/me');
            set({ user: response.data, accessToken: token, isLoading: false });
          } catch (error) {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            set({ user: null, accessToken: null, refreshToken: null, isLoading: false });
          }
        } else {
          set({ isLoading: false });
        }
      },

             login: async (email, password) => {
        const response = await api.post('/auth/login', { email, password });
        const { user, accessToken, refreshToken, twofaRequired, challengeToken } = response.data;
        if (twofaRequired) {
          // Do NOT persist tokens or set user until 2FA is verified.
          return { twofaRequired, challengeToken };
        }
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        set({ user, accessToken, refreshToken, isLoading: false });
        return { user, accessToken, refreshToken };
      },

             // Register
      register: async (email, username, password, displayName, referralCode) => {
        const response = await api.post('/auth/register', {
          email,
          username,
          password,
          displayName,
          referralCode
        });
        const { user, accessToken, refreshToken } = response.data;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        set({ user, accessToken, refreshToken });
        return user;
      },

      // Google login — exchanges a Google Identity Services ID token for DUYS tokens
      loginWithGoogleCredential: async (credential, referralCode) => {
        const response = await api.post('/auth/google', { credential, referralCode });
        const { user, accessToken, refreshToken, twofaRequired, challengeToken } = response.data;
        if (twofaRequired) {
          // Do NOT persist tokens or set user until 2FA is verified.
          return { twofaRequired, challengeToken };
        }
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        set({ user, accessToken, refreshToken, isLoading: false });
        return { user, accessToken, refreshToken };
      },

      // 2FA Challenge — verify TOTP code from a pending login
      verifyTwoFactor: async (challengeToken, code) => {
        const response = await api.post('/auth/2fa/challenge', { challengeToken, code });
        const { user, accessToken, refreshToken } = response.data;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        set({ user, accessToken, refreshToken });
        return { user, accessToken, refreshToken };
      },

      // 2FA Setup — generate a TOTP secret + QR code
      setupTwoFactor: async () => {
        const response = await api.post('/auth/2fa/setup');
        return response.data;
      },

      // 2FA Enable — confirm a TOTP code to enable 2FA
      enableTwoFactor: async (secret, code) => {
        const response = await api.post('/auth/2fa/enable', { secret, code });
        return response.data;
      },

      // 2FA Disable
      disableTwoFactor: async () => {
        const response = await api.post('/auth/2fa/disable');
        return response.data;
      },

      // Fetch auth page config (Google enabled, announcement banner)
      fetchAuthConfig: async () => {
        const response = await api.get('/auth/config');
        return response.data;
      },

      // Logout
      logout: () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        set({ user: null, accessToken: null, refreshToken: null });
      },

      // Update user profile
      updateProfile: async (updates) => {
        const response = await api.patch('/users/me', updates);
        set({ user: response.data });
        return response.data;
      },

      // Set user
      setUser: (user) => set({ user })
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken
      })
    }
  )
);

// Initialize on app load
useAuthStore.getState().init();

export default useAuthStore;
