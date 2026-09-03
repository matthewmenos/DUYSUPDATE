import React, { useState } from 'react';
import {
  FiUser,
  FiLock,
  FiEye,
  FiBell,
  FiUsers,
  FiDownload,
  FiTrash2,
  FiCheck
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../api/client';
import useAuthStore from '../stores/authStore';
import useThemeStore from '../stores/themeStore';

/**
 * SettingsPage — account settings.
 *  - Account / profile editing is wired to the real endpoint (PATCH /users/me).
 *  - Password change, privacy, notification preferences, blocked users, data
 *    export and account deletion are surfaced as UI cards. The current backend
 *    does not expose those endpoints, so they show an informative placeholder.
 */
function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [location, setLocation] = useState(user?.location || '');
  const [website, setWebsite] = useState(user?.website || '');
  const [saving, setSaving] = useState(false);

  const handleSaveAccount = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.patch('/users/me', {
        displayName,
        bio,
        location,
        website
      });
      setUser(updated.data);
      toast.success('Account settings saved');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto border-l border-r border-gray-700 min-h-full">
      <div className="sticky top-0 bg-black/80 backdrop-blur border-b border-gray-700 p-4 z-10">
        <h2 className="text-xl font-bold">Settings</h2>
      </div>      {/* Account profile */}
      <section className="p-4 border-b border-gray-700">
        <h3 className="flex items-center gap-2 font-semibold mb-3"><FiUser className="w-5 h-5" /> Account</h3>
        <form onSubmit={handleSaveAccount} className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-800">
              <img src={user?.avatar_url || 'https://via.placeholder.com/56'} alt="Avatar" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="text-sm text-gray-400">@{user?.username}</p>
              <p className="text-sm text-gray-500">{user?.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <label className="block">
              <span className="text-sm text-gray-400">Name</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 w-full bg-gray-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>

            <label className="block">
              <span className="text-sm text-gray-400">Bio</span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                maxLength={500}
                className="mt-1 w-full bg-gray-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </label>

            <label className="block">
              <span className="text-sm text-gray-400">Location</span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="mt-1 w-full bg-gray-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>

            <label className="block">
              <span className="text-sm text-gray-400">Website</span>
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="mt-1 w-full bg-gray-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 font-semibold text-sm transition disabled:opacity-50"
          >
            <FiCheck className="w-4 h-4" /> {saving ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      </section>
      {/* Appearance */}
      <section className="border-b border-gray-700">
        <div className="p-4">
          <h3 className="flex items-center gap-2 font-semibold mb-3"><FiSun className="w-5 h-5" /> Appearance</h3>
          <p className="text-sm text-gray-500 mb-3">DUYS uses a black &amp; blue palette. Pick dark or light.</p>
          <div className="flex gap-2">
            <button
              onClick={() => setTheme('dark')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition ${
                theme === 'dark'
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-700 text-gray-300 hover:bg-gray-900'
              }`}
            >
              <FiMoon className="w-4 h-4" /> Dark
            </button>
            <button
              onClick={() => setTheme('light')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition ${
                theme === 'light'
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-700 text-gray-300 hover:bg-gray-900'
              }`}
            >
              <FiSun className="w-4 h-4" /> Light
            </button>
          </div>
        </div>
      </section>

      {/* Placeholder sections */}
      <Section icon={<FiLock className="w-5 h-5" />} title="Password">
        <p className="text-sm text-gray-500">Changing your password requires a dedicated backend endpoint, which is not available yet.</p>
      </Section>

      <Section icon={<FiEye className="w-5 h-5" />} title="Privacy">
        <p className="text-sm text-gray-500">Private/public account and "who can message" controls are not available yet.</p>
      </Section>

      <Section icon={<FiBell className="w-5 h-5" />} title="Notification preferences">
        <p className="text-sm text-gray-500">Per-type notification toggles are not available yet.</p>
      </Section>

      <Section icon={<FiUsers className="w-5 h-5" />} title="Blocked users">
        <p className="text-sm text-gray-500">You have not blocked any users. Blocking is not available in the API yet.</p>
      </Section>

      <Section icon={<FiDownload className="w-5 h-5" />} title="Data export">
        <p className="text-sm text-gray-500">Data export is not available yet.</p>
      </Section>

      <section className="border-b border-gray-700">
        <div className="p-4">
          <h3 className="flex items-center gap-2 font-semibold mb-2 text-red-400"><FiTrash2 className="w-5 h-5" /> Delete account</h3>
          <p className="text-sm text-gray-500 mb-3">Permanently deletes your account and all data. This action cannot be undone.</p>
          <button className="px-4 py-2 rounded-full bg-red-600/20 text-red-400 border border-red-700 hover:bg-red-600/30 text-sm font-semibold transition">
            Delete account
          </button>
        </div>
      </section>
    </div>
  );
}

/** Small reusable settings section card. */
function Section({ icon, title, children }) {
  return (
    <section className="border-b border-gray-700">
      <div className="p-4">
        <h3 className="flex items-center gap-2 font-semibold mb-2">{icon} {title}</h3>
        {children}
      </div>
    </section>
  );
}

export default SettingsPage;
