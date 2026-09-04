import React, { useState } from 'react';

import { FiUser, FiLock, FiEye, FiBell, FiUsers, FiDownload, FiTrash2, FiCheck } from 'react-icons/fi';

import toast from 'react-hot-toast';

import api from '../api/client';

import useAuthStore from '../stores/authStore';

import { getErrorMessage } from '../utils/errors';

function SettingsPage() {

  const user = useAuthStore((s) => s.user);

  const setUser = useAuthStore((s) => s.setUser);

  return (

    <div className="max-w-2xl mx-auto border-l border-r border-gray-700 min-h-full">

      <div className="sticky top-0 bg-black/80 backdrop-blur border-b border-gray-700 p-4 z-10">

        <h2 className="text-xl font-bold">Settings</h2>

      </div>

      <AccountSection user={user} setUser={setUser} />

      <PasswordSection />

      <TwoFactorSection user={user} setUser={setUser} />

      <PrivacySection user={user} setUser={setUser} />

      <NotificationPreferencesSection user={user} />

      <BlockedUsersSection />

      <DataExportSection />

      <DeleteAccountSection />

    </div>

  );

}

function AccountSection({ user, setUser }) {

  const [displayName, setDisplayName] = useState(user?.display_name || '');

  const [bio, setBio] = useState(user?.bio || '');

  const [location, setLocation] = useState(user?.location || '');

  const [website, setWebsite] = useState(user?.website || '');

  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {

    e.preventDefault();

    setSaving(true);

    try {

      const updated = await api.patch('/users/me', { displayName, bio, location, website });

      setUser(updated.data);

      toast.success('Account settings saved');

    } catch (err) {

      toast.error(getErrorMessage(err, 'Failed to save settings'));

    } finally {

      setSaving(false);

    }

  };

  return (

    <Section icon={<FiUser className="w-5 h-5" />} title="Account">

      <form onSubmit={handleSave} className="space-y-3">

        <div className="flex items-center gap-4">

          <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-800 shrink-0">

            <img src={user?.avatar_url || 'https://via.placeholder.com/56'} alt="Avatar" className="w-full h-full object-cover" />

          </div>

          <div className="min-w-0">

            <p className="text-sm text-gray-400 truncate">@{user?.username}</p>

            <p className="text-sm text-gray-500 truncate">{user?.email}</p>

          </div>

        </div>

        <Field label="Name"><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1 w-full bg-gray-900 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" /></Field>

        <Field label="Bio"><textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={500} className="input resize-none" /></Field>

        <Field label="Location"><input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1 w-full bg-gray-900 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" /></Field>

        <Field label="Website"><input value={website} onChange={(e) => setWebsite(e.target.value)} className="mt-1 w-full bg-gray-900 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" /></Field>

        <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 font-semibold text-sm transition disabled:opacity-50">

          <FiCheck className="w-4 h-4" /> {saving ? 'Saving...' : 'Save changes'}

        </button>

      </form>

    </Section>

  );

}


function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    if (next !== confirm) return toast.error('New passwords do not match');
    setSaving(true);
    try {
      await api.patch('/users/me/password', { currentPassword: current, newPassword: next });
      toast.success('Password changed');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to change password'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section icon={<FiLock className="w-5 h-5" />} title="Password">
      <form onSubmit={handleSave} className="space-y-3">
        <Field label="Current password"><input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className="mt-1 w-full bg-gray-900 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" required /></Field>
        <Field label="New password"><input type="password" value={next} onChange={(e) => setNext(e.target.value)} className="mt-1 w-full bg-gray-900 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" minLength={8} required /></Field>
        <Field label="Confirm new password"><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1 w-full bg-gray-900 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" minLength={8} required /></Field>
        <button type="submit" disabled={saving} className="px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 font-semibold text-sm transition disabled:opacity-50">
          {saving ? 'Updating...' : 'Change password'}
        </button>
      </form>
    </Section>
  );
}

function PrivacySection({ user, setUser }) {
  const [isPrivate, setIsPrivate] = useState(user?.is_private || false);
  const [whoCanMessage, setWhoCanMessage] = useState(user?.who_can_message || 'everyone');
  const [showOnline, setShowOnline] = useState(user?.show_online_status !== false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.patch('/users/me/privacy', { isPrivate, whoCanMessage, showOnlineStatus: showOnline });
      setUser(updated.data);
      toast.success('Privacy settings saved');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save privacy'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section icon={<FiEye className="w-5 h-5" />} title="Privacy">
      <div className="space-y-4">
        <Toggle label="Private account" desc="Only approved followers can see your posts" checked={isPrivate} onChange={setIsPrivate} />
        <div>
          <p className="text-sm text-gray-400 mb-1">Who can message you</p>
          <select value={whoCanMessage} onChange={(e) => setWhoCanMessage(e.target.value)} className="mt-1 w-full bg-gray-900 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="everyone">Everyone</option>
            <option value="followers">People you follow</option>
            <option value="nobody">Nobody</option>
          </select>
        </div>
        <Toggle label="Show online status" desc="Let others see when you're active" checked={showOnline} onChange={setShowOnline} />
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 font-semibold text-sm transition disabled:opacity-50">
          {saving ? 'Saving...' : 'Save privacy'}
        </button>
      </div>
    </Section>
  );
}

function NotificationPreferencesSection({ user }) {

  const [prefs, setPrefs] = useState({ likes: true, comments: true, follows: true, mentions: true, messages: true, reposts: true });

  const [loaded, setLoaded] = useState(false);

  const [saving, setSaving] = useState(false);

  React.useEffect(() => {

    (async () => {

      try {

        const res = await api.get('/users/me/notifications/preferences');

        setPrefs((p) => ({ ...p, ...res.data }));

      } catch { /* use defaults */ } finally { setLoaded(true); }

    })();

  }, [user?.id]);

  const toggle = (key) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const handleSave = async () => {

    setSaving(true);

    try {

      await api.patch('/users/me/notifications', prefs);

      toast.success('Notification preferences saved');

    } catch (err) {

      toast.error(getErrorMessage(err, 'Failed to save preferences'));

    } finally {

      setSaving(false);

    }

  };

  const items = [

    ['likes', 'Likes', 'When someone likes your post'],

    ['comments', 'Comments', 'When someone comments on your post'],

    ['follows', 'Follows', 'When someone follows you'],

    ['mentions', 'Mentions', 'When someone mentions you'],

    ['messages', 'Messages', 'When you receive a direct message'],

    ['reposts', 'Reposts', 'When someone reposts your content']

  ];

  return (

    <Section icon={<FiBell className="w-5 h-5" />} title="Notification preferences">

      {!loaded ? <p className="text-sm text-gray-500">Loading...</p> : (

        <div className="space-y-3">

          {items.map(([key, label, desc]) => (

            <Toggle key={key} label={label} desc={desc} checked={prefs[key]} onChange={() => toggle(key)} />

          ))}

          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 font-semibold text-sm transition disabled:opacity-50">

            {saving ? 'Saving...' : 'Save preferences'}

          </button>

        </div>

      )}

    </Section>

  );

}

function BlockedUsersSection() {

  const [blocked, setBlocked] = useState([]);

  const [loaded, setLoaded] = useState(false);

  const load = async () => {

    try { setBlocked(await api.get('/users/me/blocked')); } catch { /* ignore */ } finally { setLoaded(true); }

  };

  React.useEffect(() => { load(); }, []);

  const unblock = async (id) => {

    try {

      await api.delete(`/users/${id}/block`);

      setBlocked((b) => b.filter((u) => u.id !== id));

      toast.success('User unblocked');

    } catch (err) {

      toast.error(getErrorMessage(err, 'Failed to unblock'));

    }

  };

  return (

    <Section icon={<FiUsers className="w-5 h-5" />} title="Blocked users">

      {!loaded ? (

        <p className="text-sm text-gray-500">Loading...</p>

      ) : blocked.length === 0 ? (

        <p className="text-sm text-gray-500">You haven't blocked anyone.</p>

      ) : (

        <div className="space-y-2">

          {blocked.map((u) => (

            <div key={u.id} className="flex items-center gap-3">

              <img src={u.avatar_url || 'https://via.placeholder.com/40'} alt="" className="w-9 h-9 rounded-full object-cover" />

              <div className="flex-1 min-w-0">

                <p className="text-sm font-medium truncate">{u.display_name}</p>

                <p className="text-xs text-gray-500 truncate">@{u.username}</p>

              </div>

              <button onClick={() => unblock(u.id)} className="px-3 py-1 rounded-full border border-gray-600 text-xs hover:border-red-500 hover:text-red-400 transition">Unblock</button>

            </div>

          ))}

        </div>

      )}

    </Section>

  );

}

function DataExportSection() {

  const [busy, setBusy] = useState(false);

  const handleExport = async () => {

    setBusy(true);

    try {

      const res = await api.post('/users/me/export');

      toast.success(res.data.message || 'Export requested');

    } catch (err) {

      toast.error(getErrorMessage(err, 'Failed to request export'));

    } finally {

      setBusy(false);

    }

  };

  return (

    <Section icon={<FiDownload className="w-5 h-5" />} title="Data export">

      <p className="text-sm text-gray-500 mb-3">Request a copy of all your data. You'll be notified when it's ready to download.</p>

      <button onClick={handleExport} disabled={busy} className="px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 font-semibold text-sm transition disabled:opacity-50">

        {busy ? 'Requesting...' : 'Request my data'}

      </button>

    </Section>

  );

}

function DeleteAccountSection() {

  const [open, setOpen] = useState(false);

  const [password, setPassword] = useState('');

  const [busy, setBusy] = useState(false);

  const logout = useAuthStore((s) => s.logout);

  const handleDelete = async () => {

    if (!password) return;

    if (!window.confirm('This cannot be undone. Delete your account?')) return;

    setBusy(true);

    try {

      await api.delete('/users/me', { data: { password } });

      toast.success('Account deleted');

      logout();

    } catch (err) {

      toast.error(getErrorMessage(err, 'Failed to delete account'));

    } finally {

      setBusy(false);

    }

  };

  return (

    <Section icon={<FiTrash2 className="w-5 h-5" />} title="Delete account" danger>

      <p className="text-sm text-gray-500 mb-3">Permanently deletes your account and all data. This action cannot be undone.</p>

      {!open ? (

        <button onClick={() => setOpen(true)} className="px-4 py-2 rounded-full bg-red-600/20 text-red-400 border border-red-700 hover:bg-red-600/30 text-sm font-semibold transition">

          Delete account

        </button>

      ) : (

        <div className="flex items-center gap-2">

          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" className="mt-1 w-full bg-gray-900 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />

          <button onClick={handleDelete} disabled={busy} className="px-4 py-2 rounded-full bg-red-600 hover:bg-red-500 text-sm font-semibold transition disabled:opacity-50 shrink-0">

            {busy ? '...' : 'Confirm'}

          </button>

        </div>

      )}

    </Section>

  );

}

function TwoFactorSection({ user, setUser }) {

  const [setup, setSetup] = useState(null); // { secret, qr } when in setup mode

  const [code, setCode] = useState('');

  const [busy, setBusy] = useState(false);

  const twofaEnabled = !!user?.twofa_enabled;

  const handleStartSetup = async () => {

    setBusy(true);

    try {

      const data = await useAuthStore.getState().setupTwoFactor();

      setSetup(data);

    } catch (err) {

      toast.error(getErrorMessage(err, 'Failed to start 2FA setup'));

    } finally {

      setBusy(false);

    }

  };

  const handleEnable = async () => {

    if (!setup || code.trim().length !== 6) {

      toast.error('Enter the 6-digit code from your authenticator app');

      return;

    }

    setBusy(true);

    try {

      await useAuthStore.getState().enableTwoFactor(setup.secret, code.trim());

      setSetup(null);

      setCode('');

      setUser({ ...user, twofa_enabled: true });

      toast.success('Two-factor authentication enabled');

    } catch (err) {

      toast.error(getErrorMessage(err, 'Failed to enable 2FA'));

    } finally {

      setBusy(false);

    }

  };

  const handleDisable = async () => {

    if (!window.confirm('Disable two-factor authentication?')) return;

    setBusy(true);

    try {

      await useAuthStore.getState().disableTwoFactor();

      setUser({ ...user, twofa_enabled: false });

      toast.success('Two-factor authentication disabled');

    } catch (err) {

      toast.error(getErrorMessage(err, 'Failed to disable 2FA'));

    } finally {

      setBusy(false);

    }

  };

  return (

    <Section icon={<FiLock className="w-5 h-5" />} title="Two-factor authentication">

      {twofaEnabled ? (

        <div className="space-y-3">

          <p className="flex items-center gap-2 text-sm">

            <FiCheck className="w-4 h-4 text-emerald-400" />

            <span className="text-emerald-400 font-semibold">Enabled</span>

            <span className="text-gray-500">— an authenticator app code is required at login.</span>

          </p>

          <button onClick={handleDisable} disabled={busy}

            className="px-4 py-2 rounded-full bg-red-600/20 text-red-400 border border-red-700 hover:bg-red-600/30 text-sm font-semibold transition disabled:opacity-50">

            {busy ? '...' : 'Disable 2FA'}

          </button>

        </div>

      ) : setup ? (

        <div className="space-y-3">

          <p className="text-sm text-gray-400 mb-2">

            Scan this QR code with Google Authenticator, Authy, or any TOTP app.

          </p>

          <div className="flex items-start gap-4 flex-wrap">

            <img src={setup.qr} alt="2FA QR code" className="w-44 h-44 rounded-lg bg-white p-2" />

            <div className="space-y-2">

              <p className="text-xs text-gray-500">Or enter this key manually:</p>

              <code className="block bg-gray-900 rounded-lg px-3 py-2 text-xs break-all select-all">{setup.secret}</code>

              <div className="flex items-center gap-2">

                <input

                  value={code}

                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}

                  placeholder="6-digit code"

                  inputMode="numeric"

                  className="w-36 bg-gray-900 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"

                />

                <button onClick={handleEnable} disabled={busy}

                  className="px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition disabled:opacity-50">

                  {busy ? '...' : 'Enable 2FA'}

                </button>

              </div>

            </div>

          </div>

          <button onClick={() => setSetup(null)} className="text-sm text-gray-500 hover:text-gray-300">Cancel</button>

        </div>

      ) : (

        <div className="space-y-2">

          <p className="text-sm text-gray-500">Add an extra layer of security with an authenticator app (TOTP).</p>

          <button onClick={handleStartSetup} disabled={busy}

            className="px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition disabled:opacity-50">

            {busy ? '...' : 'Set up two-factor authentication'}

          </button>

        </div>

      )}

    </Section>

  );

}

function Section({ icon, title, children, danger }) {

  return (

    <section className="border-b border-gray-700">

      <div className="p-4">

        <h3 className={`flex items-center gap-2 font-semibold mb-3 ${danger ? 'text-red-400' : ''}`}>{icon} {title}</h3>

        {children}

      </div>

    </section>

  );

}

function Field({ label, children }) {

  return (

    <label className="block">

      <span className="text-sm text-gray-400">{label}</span>

      {children}

    </label>

  );

}

function Toggle({ label, desc, checked, onChange }) {

  return (

    <label className="flex items-center justify-between gap-3 cursor-pointer">

      <div>

        <p className="text-sm font-medium">{label}</p>

        {desc && <p className="text-xs text-gray-500">{desc}</p>}

      </div>

      <button type="button" onClick={() => onChange(!checked)} className={`shrink-0 w-11 h-6 rounded-full transition relative ${checked ? 'bg-blue-500' : 'bg-gray-700'}`}>

        <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: checked ? '22px' : '2px' }} />

      </button>

    </label>

  );

}

export default SettingsPage;