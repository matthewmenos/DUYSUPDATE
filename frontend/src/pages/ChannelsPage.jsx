import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiUsers, FiPlus, FiX, FiCheck } from 'react-icons/fi';
import api from '../api/client';

/**
 * ChannelsPage - browse all public channels in a grid and create new ones.
 */
function ChannelsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', handle: '', description: '' });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => {
      const res = await api.get('/channels', { params: { limit: 50 } });
      return res.data.channels || [];
    }
  });

  const channels = data || [];

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.handle.trim()) {
      toast.error('Name and handle are required');
      return;
    }
    setCreating(true);
    try {
      await api.post('/channels', {
        name: form.name.trim(),
        handle: form.handle.trim(),
        description: form.description.trim(),
        isPrivate: false
      });
      toast.success('Channel created!');
      setShowCreate(false);
      setForm({ name: '', handle: '', description: '' });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create channel');
    } finally {
      setCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto border-l border-r border-gray-700 flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-4xl mx-auto border-l border-r border-gray-700 p-8 text-center text-gray-500">
        Failed to load channels: {error.message}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto border-l border-r border-gray-700 min-h-full">
      <div className="sticky top-0 bg-black/80 backdrop-blur border-b border-gray-700 p-4 z-10 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Channels</h2>
          <p className="text-sm text-gray-500 mt-1">Discover communities and post together</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 text-sm font-semibold hover:opacity-90"
        >
          <FiPlus /> Create
        </button>
      </div>

      {channels.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No channels yet. Create the first one!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {channels.map((channel) => (
            <Link
              key={channel.id}
              to={`/channels/${channel.id}`}
              className="rounded-2xl border border-gray-800 bg-gray-900 p-5 hover:border-gray-600 transition"
            >
              <div className="flex items-center gap-3">
                <img
                  src={channel.avatar_url || 'https://via.placeholder.com/48'}
                  alt={channel.name}
                  className="w-12 h-12 rounded-full object-cover"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{channel.name}</p>
                  <p className="text-xs text-gray-500">@{channel.handle}</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-gray-400 line-clamp-2">{channel.description || 'No description'}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <FiUsers /> {channel.subscriber_count} subscribers
                </span>
                <span className="text-xs text-pink-400">{channel.owner_display_name}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleCreate} className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Create a channel</h3>
              <button type="button" onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-white">
                <FiX />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Channel name"
                className="w-full bg-black rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500"
              />
              <input
                value={form.handle}
                onChange={(e) => setForm({ ...form, handle: e.target.value })}
                placeholder="Handle (e.g. crypto_news)"
                className="w-full bg-black rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500"
              />
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Description"
                rows={3}
                className="w-full bg-black rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="mt-5 w-full flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              <FiCheck /> {creating ? 'Creating...' : 'Create channel'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default ChannelsPage;