import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FiHome, FiCompass, FiZap, FiVideo, FiMessageCircle, FiBell, FiUser, FiSettings, FiLogOut, FiDollarSign, FiShield, FiHash, FiSun, FiMoon } from 'react-icons/fi';
import useAuthStore from '../stores/authStore';
import useThemeStore from '../stores/themeStore';
import api from '../api/client';
import { onNotification } from '../utils/notificationSocket';

function Layout({ children }) {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Unread notification count shown on the bell icon.
  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => (await api.get('/notifications/unread')).data,
    refetchInterval: 30000
  });
  const unreadCount = unreadData?.unread || 0;

  // Real-time notifications: bump the badge and toast for new ones.
  React.useEffect(() => {
    let lastKey = null;
    const unsub = onNotification((notification) => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
      if (notification && notification.id) {
        const key = `${notification.actor_username}:${notification.kind}:${notification.entity_id || ''}`;
        if (key !== lastKey) {
          lastKey = key;
          toast(`${notification.actor_display_name || notification.actor_username}: ${notification.title}`, { icon: '🔔' });
        }
      }
    });
    return unsub;
  }, [queryClient]);

  const navItems = [
    { path: '/', icon: FiHome, label: 'Home' },
    { path: '/explore', icon: FiCompass, label: 'Explore' },
    { path: '/stories', icon: FiZap, label: 'Stories' },
    { path: '/live', icon: FiVideo, label: 'Live' },
    { path: '/channels', icon: FiHash, label: 'Channels' },
    { path: '/messaging', icon: FiMessageCircle, label: 'Messages' },
    { path: '/notifications', icon: FiBell, label: 'Notifications', badge: unreadCount },
    { path: '/wallet', icon: FiDollarSign, label: 'Wallet' },
    { path: '/profile/' + user?.username, icon: FiUser, label: 'Profile' },
    { path: '/settings', icon: FiSettings, label: 'Settings' }
  ];

  if (user?.is_admin) {
    navItems.push({ path: '/admin', icon: FiShield, label: 'Admin' });
  }

  const isActive = (path) => location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

  return (
    <div className="flex h-screen bg-black text-white">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-gray-700 bg-black p-4 flex flex-col">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-400">
            DUYS
          </h1>
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label="Toggle theme"
            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition"
          >
            {theme === 'dark' ? <FiSun className="w-5 h-5" /> : <FiMoon className="w-5 h-5" />}
          </button>
        </div>

        <nav className="flex-1 space-y-2">
          {navItems.map(({ path, icon: Icon, label, badge }) => (
            <Link
              key={path}
              to={path}
              className={`flex items-center space-x-3 px-4 py-3 rounded-full transition ${
                isActive(path)
                  ? 'bg-white text-black'
                  : 'text-gray-300 hover:bg-gray-900'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {badge > 0 && (
                  <span className={`absolute -top-2 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    isActive(path) ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'
                  }`}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>
              <span className="text-lg">{label}</span>
            </Link>
          ))}
        </nav>

        <button
          onClick={logout}
          className="flex items-center space-x-3 px-4 py-3 rounded-full w-full text-gray-300 hover:bg-gray-900 transition"
        >
          <FiLogOut className="w-5 h-5" />
          <span className="text-lg">Logout</span>
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

export default Layout;
