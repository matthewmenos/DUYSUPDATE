import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FiHome, FiCompass, FiZap, FiVideo, FiMessageCircle, FiBell, FiUser, FiSettings, FiLogOut, FiDollarSign, FiShield, FiHash, FiSun, FiMoon, FiMenu, FiX, FiAward, FiGift, FiUsers } from 'react-icons/fi';
import useAuthStore from '../stores/authStore';
import useThemeStore from '../stores/themeStore';
import api from '../api/client';
import RightRail from './RightRail';
import { onNotification } from '../utils/notificationSocket';

/**
 * Responsive shell.
 *  - Desktop (xl+): full sidebar with labels.
 *  - Tablet  (md+):  icon-only rail.
 *  - Mobile   (<md): top bar + 5-item bottom navigation + a "More" slide-in drawer
 *                    (with theme toggle + logout). Main content clears both bars.
 */
function Layout({ children }) {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => (await api.get('/notifications/unread')).data,
    refetchInterval: 30000
  });
  const unreadCount = unreadData?.unread || 0;

  const { data: notifPreview = [] } = useQuery({
    queryKey: ['notifications', 'preview'],
    queryFn: async () => {
      const res = await api.get('/notifications', { params: { limit: 6 } });
      return res.data.notifications || [];
    },
    refetchInterval: 30000,
    enabled: unreadCount > 0
  });

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

  // Close the mobile drawer on every navigation.
  React.useEffect(() => {
    setDrawerOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  const navItems = [
    { path: '/', icon: FiHome, label: 'Home' },
    { path: '/explore', icon: FiCompass, label: 'Explore' },
    { path: '/stories', icon: FiZap, label: 'Stories' },
    { path: '/live', icon: FiVideo, label: 'Live' },
    { path: '/channels', icon: FiHash, label: 'Channels' },
    { path: '/messaging', icon: FiMessageCircle, label: 'Messages' },
    { path: '/notifications', icon: FiBell, label: 'Notifications', badge: unreadCount },
    { path: '/wallet', icon: FiDollarSign, label: 'Wallet' },
    { path: '/earn', icon: FiGift, label: 'Earn' },
    { path: '/referral', icon: FiUsers, label: 'Referrals' },
    { path: '/leaderboard', icon: FiAward, label: 'Leaderboard' },
    { path: '/profile/' + user?.username, icon: FiUser, label: 'Profile' },
    { path: '/settings', icon: FiSettings, label: 'Settings' }
  ];
  if (user?.is_admin) navItems.push({ path: '/admin', icon: FiShield, label: 'Admin' });

  // Bottom navigation on mobile: the 5 most-used destinations.
  const bottomNav = [
    navItems.find((n) => n.path === '/'),
    navItems.find((n) => n.path === '/explore'),
    navItems.find((n) => n.path === '/messaging'),
    navItems.find((n) => n.path === '/notifications'),
    navItems.find((n) => n.path === '/profile/' + user?.username)
  ].filter(Boolean);

  const isActive = (path) => location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

  const NavLink = ({ item, showLabel = true }) => {
    const { path, icon: Icon, label, badge } = item;
    const active = isActive(path);
    return (
      <Link to={path} title={label} className={`relative flex items-center gap-3 rounded-full transition ${showLabel ? 'px-4 py-3' : 'p-3 justify-center'} ${active ? 'bg-white text-black' : 'text-gray-300 hover:bg-gray-900'}`}>
        <div className="relative">
          <Icon className="w-5 h-5" />
          {badge > 0 && (
            <span className={`absolute -top-2 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${active ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'}`}>
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </div>
        {showLabel && <span className="text-lg">{label}</span>}
      </Link>
    );
  };

  return (
    <div className="flex h-[100dvh] md:h-screen bg-black text-white">
      <aside className="hidden md:flex md:w-20 xl:w-64 shrink-0 border-r border-gray-700 flex-col p-3 xl:p-4">
        <div className="mb-8 flex items-center md:justify-center xl:justify-between gap-2">
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-400">DUYS</h1>
          <div className="flex items-center gap-1">
            <Link to="/notifications" title="Notifications" className="relative w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition">
              <FiBell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
            <button onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} aria-label="Toggle theme" className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition">
              {theme === 'dark' ? <FiSun className="w-5 h-5" /> : <FiMoon className="w-5 h-5" />}
            </button>
          </div>
        </div>
        <nav className="flex-1 space-y-2">
          {navItems.map((item) => (<NavLink key={item.path} item={item} showLabel={false} />))}
        </nav>
        <button onClick={logout} className="flex items-center md:justify-center xl:justify-start gap-3 px-4 py-3 rounded-full w-full text-gray-300 hover:bg-gray-900 transition" title="Logout">
          <FiLogOut className="w-5 h-5" />
          <span className="text-lg hidden xl:inline">Logout</span>
        </button>
      </aside>

      <div className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between bg-black/90 backdrop-blur border-b border-gray-700 px-4 h-14">
        <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" className="p-2 -ml-2 rounded-full hover:bg-gray-800"><FiMenu className="w-6 h-6" /></button>
        <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-400">DUYS</h1>
        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              onClick={() => setNotifOpen((v) => !v)}
              aria-label="Notifications"
              className="relative w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition"
            >
              <FiBell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            {notifOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} />
                <div className="absolute right-0 top-11 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl overflow-hidden notif-pop">
                  <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                    <h3 className="font-bold text-sm">Notifications</h3>
                    <Link to="/notifications" onClick={() => setNotifOpen(false)} className="text-xs text-blue-400 hover:underline">
                      View all
                    </Link>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {notifPreview.length === 0 ? (
                      <p className="p-6 text-center text-sm text-gray-500">You're all caught up!</p>
                    ) : (
                      notifPreview.map((n) => (
                        <Link
                          key={n.id}
                          to="/notifications"
                          onClick={() => setNotifOpen(false)}
                          className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-800 transition"
                        >
                          <img
                            src={n.actor_avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(n.actor_display_name || n.actor_username || 'U')}&background=6366f1&color=fff`}
                            alt={n.actor_username}
                            className="w-8 h-8 rounded-full object-cover bg-gray-800 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-200 truncate">
                              <span className="font-semibold text-white">{n.actor_display_name || n.actor_username}</span>{' '}
                              {n.title.replace(/^@\S+\s*/, '')}
                            </p>
                            <p className="text-xs text-gray-500">{n.message || n.kind}</p>
                          </div>
                          {!n.read_at && <span className="mt-2 w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          <button onClick={toggleTheme} aria-label="Toggle theme" className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition">
            {theme === 'dark' ? <FiSun className="w-5 h-5" /> : <FiMoon className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 flex items-center justify-around bg-black/95 backdrop-blur border-t border-gray-700 h-14 pb-safe">
        {bottomNav.map((item) => {
          const { path, icon: Icon, label, badge } = item;
          const active = isActive(path);
          return (
            <Link key={path} to={path} title={label} className="relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full">
              <div className="relative">
                <Icon className={`w-5 h-5 ${active ? 'text-blue-400' : 'text-gray-400'}`} />
                {badge > 0 && (<span className="absolute -top-2 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">{badge > 99 ? '99+' : badge}</span>)}
              </div>
              <span className={`text-[10px] ${active ? 'text-blue-400 font-semibold' : 'text-gray-500'}`}>{label}</span>
            </Link>
          );
        })}
      </nav>

      <main className="flex-1 overflow-y-auto pt-14 pb-16 md:pt-0 md:pb-0">
        {children}
      </main>

      <RightRail />

      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 overlay-fade" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-black border-r border-gray-700 p-4 flex flex-col drawer-slide">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold">Menu</h2>
              <button onClick={() => setDrawerOpen(false)} aria-label="Close menu" className="w-9 h-9 rounded-full hover:bg-gray-800 flex items-center justify-center"><FiX className="w-5 h-5" /></button>
            </div>
            <nav className="flex-1 space-y-1">
              {navItems.map((item) => (<NavLink key={item.path} item={item} showLabel />))}
            </nav>
            <button onClick={logout} className="flex items-center gap-3 px-4 py-3 rounded-full w-full text-gray-300 hover:bg-gray-900 transition">
              <FiLogOut className="w-5 h-5" /><span className="text-lg">Logout</span>
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}

export default Layout;
