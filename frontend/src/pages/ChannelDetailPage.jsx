import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FiUsers, FiCheck, FiEdit2, FiX } from 'react-icons/fi';
import api from '../api/client';
import Post from '../components/Post';
import useAuthStore from '../stores/authStore';

/**
 * ChannelDetailPage - channel banner, subscribe button, posts feed,
 * and settings (edit) for owners/moderators.
 */
function ChannelDetailPage() {
  const { channelId } = useParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [showSettings, setShowSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '' });

  const { data: channel, isLoading, isError } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: async () => (await api.get(`/channels/${channelId}`)).data,
    onSuccess: (c) => {
      if (!editForm.name && c) {
        setEditForm({ name: c.name, description: c.description });
      }
    }
  });

  const { data: posts = [] } = useQuery({
    queryKey: ['channel', channelId, 'posts'],
    queryFn: async () => {
      const res = await api.get(`/channels/${channelId}/posts`, { params: { limit: 50 } });
      return res.data.posts || [];
    }
  });

  const isModerator = user && (channel?.owner_id === Number(user.id) || channel?.my_role === 'owner' || channel?.my_role === 'moderator');

  const toggleSubscribe = async () => {
    try {
      if (channel?.is_subscribed) {
        await api.delete(`/channels/${channelId}/subscribe`);
      } else {
        await api.post(`/channels/${channelId}/subscribe`);
      }
      queryClient.invalidateQueries({ queryKey: ['channel', channelId] });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update subscription');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/channels/${channelId}`, {
        name: editForm.name.trim(),
        description: editForm.description.trim()
      });
      toast.success('Channel updated');
      setShowSettings(false);
      queryClient.invalidateQueries({ queryKey: ['channel', channelId] });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update channel');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto border-l border-r border-gray-700 flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  if (isError || !channel) {
    return (
      <div className="max-w-2xl mx-auto border-l border-r border-gray-700 p-8 text-center text-gray-500">
        Channel not found
      </div>
    );
  }
return (
    <div className="max-w-2xl mx-auto border-l border-r border-gray-700 min-h-full">
      {/* Banner */}
      <div className="h-40 bg-gradient-to-r from-gray-800 to-gray-900 relative">
        {channel.banner_url && <img src={channel.banner_url} alt={channel.name} className="w-full h-full object-cover" />}
      </div>

      {/* Header */}
      <div className="px-4 pb-4 -mt-8">
        <div className="flex items-end justify-between">
          <img
            src={channel.avatar_url || 'https://via.placeholder.com/64'}
            alt={channel.name}
            className="w-20 h-20 rounded-full object-cover border-4 border-black"
          />
          <div className="flex items-center gap-2">
            {isModerator && (
              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-1 rounded-full border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-900"
              >
                <FiEdit2 className="w-3 h-3" /> Settings
              </button>
            )}
            <button
              onClick={toggleSubscribe}
              className={`flex items-center gap-1 rounded-full px-4 py-1.5 text-sm font-semibold ${
                channel.is_subscribed
                  ? 'border border-gray-700 text-gray-300 hover:bg-gray-900'
                  : 'bg-gradient-to-r from-blue-600 to-blue-400 text-white hover:opacity-90'
              }`}
            >
              {channel.is_subscribed ? <FiCheck /> : null}
              {channel.is_subscribed ? 'Subscribed' : 'Subscribe'}
            </button>
          </div>
        </div>

        <div className="mt-3">
          <h2 className="text-2xl font-bold">{channel.name}</h2>
          <p className="text-sm text-gray-500">@{channel.handle}</p>
          <p className="mt-2 text-sm text-gray-300">{channel.description || 'No description'}</p>
          <div className="mt-3 flex items-center gap-4 text-sm text-gray-400">
            <span className="flex items-center gap-1">
              <FiUsers /> {channel.subscriber_count} subscribers
            </span>
            <span>Owned by {channel.owner_display_name}</span>
          </div>
        </div>
      </div>

      {/* Back to channels */}
      <div className="px-4 pb-2">
        <Link to="/channels" className="text-sm text-blue-400 hover:underline">← All channels</Link>
      </div>

      {/* Posts */}
      <div className="border-t border-gray-700">
        {posts.length === 0 ? (
          <p className="text-center text-gray-500 py-10">No posts in this channel yet.</p>
        ) : (
          posts.map((post) => <Post key={post.id} post={post} />)
        )}
      </div>

      {/* Settings modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleSave} className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Channel settings</h3>
              <button type="button" onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">
                <FiX />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Channel name"
                className="w-full bg-black rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Description"
                rows={4}
                className="w-full bg-black rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="mt-5 w-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default ChannelDetailPage;