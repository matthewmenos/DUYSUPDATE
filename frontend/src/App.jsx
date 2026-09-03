import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

import ProtectedRoute from './components/ProtectedRoute';
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

const queryClient = new QueryClient();

function App() {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
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
            <Route path="/channels" element={<ChannelsPage />} />
            <Route path="/channels/:channelId" element={<ChannelDetailPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/admin" element={user?.is_admin ? <AdminPage /> : <Navigate to="/" />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to={user ? "/" : "/login"} />} />
        </Routes>
      </Router>
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}

export default App;
