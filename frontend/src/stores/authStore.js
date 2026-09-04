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

      // Login
      login: async (email, password) => {
        const response = await api.post('/auth/login', { email, password });
        const { user, accessToken, refreshToken } = response.data;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        set({ user, accessToken, refreshToken });
        return user;
      },

      // Register
      register: async (email, username, password, displayName) => {
        const response = await api.post('/auth/register', {
          email,
          username,
          password,
          displayName
        });
        const { user, accessToken, refreshToken } = response.data;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        set({ user, accessToken, refreshToken });
        return user;
      },

      // Google login — exchanges a Google Identity Services ID token for DUYS tokens
      loginWithGoogleCredential: async (credential) => {
        const response = await api.post('/auth/google', { credential });
        const { user, accessToken, refreshToken } = response.data;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        set({ user, accessToken, refreshToken });
        return user;
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
