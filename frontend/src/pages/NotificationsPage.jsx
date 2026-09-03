import React, { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { FiX, FiCheckCircle, FiInbox } from 'react-icons/fi';
import api from '../api/client';
import { onNotification } from '../utils/notificationSocket';

/**
 * NotificationsPage - feed of notifications with real-time updates.
 * - Unread items prioritized, newest first.
 * - Clicking marks read + navigates to the linked entity (post/profile/chat).
 * - "Mark all read" and per-item delete.
 */
function NotificationsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: async () => {
      const res = await api.get('/notifications', { params: { limit: 50 } });
      return res.data.notifications || [];
    }
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  // Real-time updates from the notification socket.
  useEffect(() => {
    const unsub = onNotification(() => refresh());
    return unsub;
  }, []);

  const markRead = async (notification) => {
    if (!notification.read_at) {
      try {
        await api.patch(`/notifications/${notification.id}/read`);
        refresh();
      } catch {
        /* ignore */
      }
    }
  };

  const handleOpen = (notification) => {
    markRead(notification);
    const { entity_type, entity_id, actor_username } = notification;
    if (entity_type === 'post' && entity_id) {
      navigate(`/posts/${entity_id}`);
    } else if (entity_type === 'conversation' && entity_id) {
      navigate('/messaging');
    } else if (entity_type === 'user' || ['follow'].includes(notification.kind)) {
      if (actor_username) navigate(`/profile/${actor_username}`);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    try {
      await api.delete(`/notifications/${id}`);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleMarkAll = async () => {
    try {
      await api.post('/notifications/read-all');
      refresh();
      toast.success('All notifications marked as read');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="max-w-2xl mx-auto border-l border-r border-gray-700 min-h-screen">
      {/* Header */}
      <div className="sticky top-0 bg-black/95 backdrop-blur px-4 py-3 border-b border-gray-700 flex items-center justify-between z-10">
        <h2 className="text-xl font-bold">Notifications</h2>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <span className="text-xs text-gray-400">{unreadCount} unread</span>
          )}
          <button
            onClick={handleMarkAll}
            disabled={unreadCount === 0}
            className="flex items-center gap-1 text-sm text-amber-500 hover:text-amber-400 disabled:opacity-40"
          >
            <FiCheckCircle className="w-4 h-4" />
            Mark all read
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-gray-500">Loading notifications...</div>
      ) : notifications.length === 0 ? (
        <div className="p-10 text-center text-gray-500 flex flex-col items-center gap-2">
          <FiInbox className="w-10 h-10" />
          <p>No notifications yet</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-800">
          {notifications.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => handleOpen(n)}
                className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-gray-900 transition ${
                  !n.read_at ? 'bg-gray-900/40' : ''
                }`}
              >
                {!n.read_at && <span className="mt-2 w-2 h-2 rounded-full bg-amber-500 shrink-0" />}
                <img
                  src={n.actor_avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(n.actor_display_name || n.actor_username || 'U')}&background=6366f1&color=fff`}
                  alt={n.actor_username}
                  className="w-10 h-10 rounded-full object-cover bg-gray-800"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-semibold">{n.actor_display_name || n.actor_username}</span>{' '}
                    <span className="text-gray-300">{n.title.replace(/^@\S+\s*/, '')}</span>
                  </p>
                  {n.message && <p className="text-sm text-gray-400 truncate">{n.message}</p>}
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
                <span
                  onClick={(e) => handleDelete(e, n.id)}
                  className="text-gray-500 hover:text-red-400 p-1 rounded-full hover:bg-gray-800"
                  title="Delete"
                >
                  <FiX className="w-4 h-4" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default NotificationsPage;