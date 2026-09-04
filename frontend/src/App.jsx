import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import useAuthStore from './stores/authStore';

// Pages
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import FeedPage from './pages/FeedPage';
import ExplorePage from './pages/ExplorePage';
import StoriesPage from './pages/StoriesPage';
import LivePage from './pages/LivePage';
import MessagingPage from './pages/MessagingPage';
import ChannelsPage from './pages/ChannelsPage';
import ChannelDetailPage from './pages/ChannelDetailPage';
import WalletPage from './pages/WalletPage';
import NotificationsPage from './pages/NotificationsPage';
import AdminPage from './pages/AdminPage';
import ProfilePage from './pages/ProfilePage';
import PostDetailPage from './pages/PostDetailPage';
import SettingsPage from './pages/SettingsPage';
import NotFoundPage from './pages/NotFoundPage';

const queryClient = new QueryClient();

/** Scroll to the top of the main window on every route change. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function App() {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <Router>
        <ScrollToTop />
        <Routes>
          {/* Auth Routes */}
          <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" />} />
          <Route path="/register" element={!user ? <RegisterPage /> : <Navigate to="/" />} />

          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<FeedPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/stories" element={<StoriesPage />} />
            <Route path="/live" element={<LivePage />} />
            <Route path="/posts/:postId" element={<PostDetailPage />} />
            <Route path="/profile/:username" element={<ProfilePage />} />
            <Route path="/messaging" element={<MessagingPage />} />
            <Route path="/messaging/:conversationId" element={<MessagingPage />} />
            <Route path="/channels" element={<ChannelsPage />} />
            <Route path="/channels/:channelId" element={<ChannelDetailPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/admin" element={user?.is_admin ? <AdminPage /> : <Navigate to="/" />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          {/* Authenticated users hitting auth pages go home */}
          <Route path="/auth/*" element={<Navigate to={user ? "/" : "/login"} />} />

          {/* Fallback: 404 for unmatched routes */}
          <Route path="*" element={user ? <NotFoundPage /> : <Navigate to="/login" />} />
        </Routes>
        </Router>
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: user ? 'rgb(var(--c-gray-800))' : '#131c2c',
              color: 'rgb(var(--c-text))',
              border: '1px solid rgb(var(--c-gray-700))',
              borderRadius: '999px',
              fontWeight: 700,
              boxShadow: '0 8px 32px rgba(0,0,0,0.28)'
            }
          }}
        />
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

export default App;
