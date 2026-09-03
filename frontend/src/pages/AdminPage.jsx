import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  FiHome, FiShield, FiUsers, FiTrendingUp, FiUserCheck, FiFileText,
  FiFlag, FiX, FiArrowRight
} from 'react-icons/fi';
import { formatDistanceToNow } from 'date-fns';
import api from '../api/client';

/**
 * AdminPage - platform moderation dashboard.
 * Tabs: Dashboard (stats), Reports (moderation queue), Users, Analytics.
 */
function AdminPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('dashboard');
  const [reportModal, setReportModal] = useState(null); // report object
  const [userModal, setUserModal] = useState(null); // userId
  const [reportAction, setReportAction] = useState('rejected');
  const [reportNotes, setReportNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin'] });

  // Dashboard stats
  const { data: stats } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: async () => (await api.get('/admin/dashboard')).data
  });

  // Pending reports
  const { data: pendingReports = [] } = useQuery({
    queryKey: ['admin', 'reports', 'pending'],
    queryFn: async () => {
      const res = await api.get('/admin/reports', { params: { status: 'pending', limit: 50 } });
      return res.data.reports || [];
    }
  });

  // Users
  const { data: usersData } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const res = await api.get('/admin/users', { params: { limit: 50, sortBy: 'newest' } });
      return res.data.users || [];
    }
  });

  // Analytics
  const { data: analytics, refetch: refetchAnalytics } = useQuery({
    queryKey: ['admin', 'analytics'],
    queryFn: async () => (await api.get('/admin/analytics')).data,
    enabled: tab === 'analytics'
  });

  const statCards = stats
    ? [
        { label: 'Total users', value: stats.totalUsers ?? 0, icon: FiUserCheck },
        { label: 'Total posts', value: stats.totalPosts ?? 0, icon: FiFileText },
        { label: 'Active (7d)', value: stats.activeUsers7d ?? 0, icon: FiTrendingUp },
        { label: 'Open reports', value: stats.openReports ?? 0, icon: FiFlag }
      ]
    : [];

  // --- Report actions ---
  const handleResolveReport = async () => {
    if (!reportModal) return;
    setBusy(true);
    try {
      await api.patch(`/admin/reports/${reportModal.id}`, {
        action: reportAction,
        notes: reportNotes
      });
      toast.success(`Report resolved (${reportAction})`);
      setReportModal(null);
      setReportNotes('');
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to resolve report');
    } finally {
      setBusy(false);
    }
  };

  const handleBan = async (userId) => {
    if (!window.confirm('Ban this user? This will soft-delete their posts.')) return;
    try {
      await api.patch(`/admin/users/${userId}/ban`, { reason: 'Banned by admin' });
      toast.success('User banned');
      setUserModal(null);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to ban user');
    }
  };

  const handleUnban = async (userId) => {
    try {
      await api.patch(`/admin/users/${userId}/unban`, { reason: 'Unbanned by admin' });
      toast.success('User unbanned');
      setUserModal(null);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to unban user');
    }
  };

  const tabs = [
    { key: 'dashboard', label: 'Dashboard', icon: FiHome },
    { key: 'reports', label: 'Reports', icon: FiShield },
    { key: 'users', label: 'Users', icon: FiUsers },
    { key: 'analytics', label: 'Analytics', icon: FiTrendingUp }
  ];

  return (
    <div className="max-w-6xl mx-auto border-l border-r border-gray-700 p-6 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm uppercase tracking-[0.2em] text-pink-400">Admin panel</p>
        <h2 className="text-3xl font-bold mt-2">Platform moderation</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setTab(key); if (key === 'analytics') refetchAnalytics(); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition ${
              tab === key
                ? 'bg-white text-black border-white'
                : 'border-gray-700 text-gray-300 hover:bg-gray-900'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>
{/* ===================== DASHBOARD ===================== */}
      {tab === 'dashboard' && (
        <div className="space-y-8">
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            {statCards.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-2xl border border-gray-700 bg-gray-900 p-5">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-gray-400">{label}</span>
                  <Icon className="text-pink-400" />
                </div>
                <p className="text-3xl font-bold">{value}</p>
              </div>
            ))}
          </div>

          <div>
            <h3 className="text-xl font-bold mb-3">Moderation queue</h3>
            {pendingReports.length === 0 ? (
              <div className="rounded-2xl border border-gray-700 bg-gray-900 p-5 text-sm text-gray-400">
                No pending reports. 🎉
              </div>
            ) : (
              <div className="space-y-2">
                {pendingReports.slice(0, 5).map((r) => (
                  <div key={r.id} className="rounded-xl border border-gray-700 bg-gray-900 p-3 flex items-center justify-between">
                    <div className="text-sm text-gray-300">
                      <span className="font-semibold">{r.reporter_display_name || r.reporter_username}</span>{' '}
                      reported {r.entity_type}: <span className="text-pink-400">{r.reason}</span>
                    </div>
                    <button
                      onClick={() => { setReportModal(r); setReportAction('rejected'); setReportNotes(''); }}
                      className="text-xs text-amber-500 hover:text-amber-400 flex items-center gap-1"
                    >
                      Review <FiArrowRight />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== REPORTS ===================== */}
      {tab === 'reports' && (
        <div className="space-y-3">
          {pendingReports.length === 0 ? (
            <div className="rounded-2xl border border-gray-700 bg-gray-900 p-6 text-center text-gray-400">
              No pending reports.
            </div>
          ) : (
            pendingReports.map((r) => (
              <div key={r.id} className="rounded-xl border border-gray-700 bg-gray-900 p-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <img
                    src={r.reporter_avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(r.reporter_username || 'U')}&background=6366f1&color=fff`}
                    className="w-9 h-9 rounded-full object-cover bg-gray-800"
                    alt=""
                  />
                  <div>
                    <p className="text-sm">
                      <span className="font-semibold">{r.reporter_display_name || r.reporter_username}</span>
                      <span className="text-gray-400"> reported {r.entity_type} #{r.entity_id}</span>
                    </p>
                    <p className="text-sm text-gray-300">{r.reason}</p>
                    {r.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{r.description}</p>}
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setReportModal(r)}
                  className="shrink-0 rounded-full bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-4 py-2"
                >
                  Review
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ===================== USERS ===================== */}
      {tab === 'users' && (
        <div className="space-y-2">
          {(usersData || []).map((u) => (
            <div key={u.id} className="rounded-xl border border-gray-700 bg-gray-900 p-3 flex items-center justify-between gap-3">
              <button onClick={() => setUserModal(u.id)} className="flex items-center gap-3 text-left">
                <img
                  src={u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.username || 'U')}&background=6366f1&color=fff`}
                  className="w-9 h-9 rounded-full object-cover bg-gray-800"
                  alt=""
                />
                <div>
                  <p className="text-sm font-semibold">
                    {u.display_name || u.username}
                    {u.is_admin && <span className="ml-2 text-[10px] text-pink-400 font-bold uppercase">Admin</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    @{u.username} · <span className={u.is_banned ? 'text-red-400' : 'text-green-400'}>
                      {u.is_banned ? 'banned' : 'active'}
                    </span> · {u.post_count} posts
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setUserModal(u.id)} className="text-xs text-amber-400 hover:text-amber-300">
                  {u.is_banned ? 'Unban' : 'View'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
{/* ===================== ANALYTICS ===================== */}
      {tab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: 'DAU', value: analytics?.dau ?? '…' },
              { label: 'New today', value: analytics?.newUsersToday ?? '…' },
              { label: 'New this week', value: analytics?.newUsersThisWeek ?? '…' },
              { label: 'Revenue (7d)', value: analytics ? `$${Number(analytics.revenue7d).toLocaleString()}` : '…' }
            ].map(({ label, value }) => (
              <div key={label} className="rounded-2xl border border-gray-700 bg-gray-900 p-5">
                <p className="text-sm text-gray-400 mb-2">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-gray-700 bg-gray-900 p-5">
              <h3 className="text-lg font-bold mb-3">Token volume</h3>
              <p className="text-3xl font-bold text-pink-400">
                {analytics ? Number(analytics.tokenVolume).toLocaleString() : '…'} DUYS
              </p>
            </div>
            <div className="rounded-2xl border border-gray-700 bg-gray-900 p-5">
              <h3 className="text-lg font-bold mb-3">Top creators</h3>
              {(analytics?.topCreators || []).length === 0 ? (
                <p className="text-sm text-gray-500">No data yet</p>
              ) : (
                <ul className="space-y-2">
                  {(analytics.topCreators || []).slice(0, 5).map((c) => (
                    <li key={c.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-300">@{c.username}</span>
                      <span className="text-gray-500">{c.engagement} eng.</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================== REPORT MODAL ===================== */}
      {reportModal && (
        <Modal onClose={() => setReportModal(null)} title={`Report #${reportModal.id}`}>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-black border border-gray-700 p-3">
              <p className="text-gray-400">Reported by <span className="text-white">{reportModal.reporter_display_name || reportModal.reporter_username}</span></p>
              <p className="text-gray-400 mt-1">Target: <span className="text-white">{reportModal.entity_type} #{reportModal.entity_id}</span></p>
              <p className="text-white mt-2"><FiFlag className="inline mr-1" />{reportModal.reason}</p>
              {reportModal.description && <p className="text-gray-400 mt-2">{reportModal.description}</p>}
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Action</label>
              <div className="grid grid-cols-3 gap-2">
                {['approved', 'rejected', 'warned'].map((a) => (
                  <button
                    key={a}
                    onClick={() => setReportAction(a)}
                    className={`rounded-full border px-3 py-2 text-xs font-semibold capitalize transition ${
                      reportAction === a
                        ? a === 'approved'
                          ? 'bg-red-600 border-red-600 text-white'
                          : a === 'warned'
                            ? 'bg-amber-600 border-amber-600 text-white'
                            : 'bg-gray-700 border-gray-700 text-white'
                        : 'border-gray-700 text-gray-300 hover:bg-gray-900'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
              {reportAction === 'approved' && (
                <p className="text-xs text-red-400 mt-1">Approving a user report will ban the target.</p>
              )}
            </div>

            <textarea
              value={reportNotes}
              onChange={(e) => setReportNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full bg-black rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />

            <button
              onClick={handleResolveReport}
              disabled={busy}
              className="w-full rounded-full bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2 text-sm disabled:opacity-50"
            >
              {busy ? 'Resolving…' : 'Resolve report'}
            </button>
          </div>
        </Modal>
      )}

      {/* ===================== USER MODAL ===================== */}
      {userModal && <UserModal userId={userModal} onClose={() => setUserModal(null)} onBan={handleBan} onUnban={handleUnban} />}
    </div>
  );
}

/* ---------- Modal shell ---------- */
function Modal({ onClose, title, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="rounded-2xl border border-gray-700 bg-gray-900 w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><FiX /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- User detail modal ---------- */
function UserModal({ userId, onClose, onBan, onUnban }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: async () => (await api.get(`/admin/users/${userId}`)).data
  });

  const user = data?.user;

  return (
    <Modal onClose={onClose} title={user ? `@${user.username}` : 'User'}>
      {isLoading ? (
        <p className="text-sm text-gray-400">Loading user…</p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold">{user?.display_name}</p>
            <p className="text-xs text-gray-500">
              @{user?.username} · {user?.is_banned ? 'Banned' : 'Active'}
              {user?.verified_badge && ` · ${user.verified_badge} verified`}
            </p>
          </div>

          {/* Account history */}
          <div>
            <h4 className="text-xs font-bold uppercase text-gray-400 mb-2">Account history</h4>
            {(data?.adminLogs || []).length === 0 ? (
              <p className="text-xs text-gray-500">No admin actions recorded.</p>
            ) : (
              <ul className="space-y-1 text-xs text-gray-300">
                {(data.adminLogs || []).slice(0, 4).map((l) => (
                  <li key={l.id}>
                    <span className="text-pink-400">{l.action}</span>
                    <span className="text-gray-500"> · {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Reports received */}
          <div>
            <h4 className="text-xs font-bold uppercase text-gray-400 mb-2">Reports received</h4>
            {(data?.reportsReceived || []).length === 0 ? (
              <p className="text-xs text-gray-500">No reports.</p>
            ) : (
              <ul className="space-y-1 text-xs text-gray-300">
                {(data.reportsReceived || []).slice(0, 4).map((r) => (
                  <li key={r.id} className="flex justify-between">
                    <span>{r.reason}</span>
                    <span className={r.status === 'pending' ? 'text-amber-400' : 'text-gray-500'}>{r.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            {user?.is_banned ? (
              <button onClick={() => onUnban(user.id)} className="flex-1 rounded-full bg-green-600 hover:bg-green-500 text-white font-semibold py-2 text-sm">
                Unban user
              </button>
            ) : (
              !user?.is_admin && (
                <button onClick={() => onBan(user.id)} className="flex-1 rounded-full bg-red-600 hover:bg-red-500 text-white font-semibold py-2 text-sm">
                  Ban user
                </button>
              )
            )}
            {user?.is_admin && <p className="text-xs text-gray-500 self-center">Admins cannot be banned.</p>}
            <button onClick={onClose} className="rounded-full border border-gray-700 text-gray-300 py-2 px-4 text-sm hover:bg-gray-800">
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default AdminPage;