import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FiEye, FiVideo, FiPlus } from 'react-icons/fi';
import api from '../api/client';
import useAuthStore from '../stores/authStore';
import LiveRoomView from '../components/LiveRoomView';

/**
 * LivePage — browse active live rooms, start a new stream, and open the
 * live player + chat.
 */
function LivePage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [activeRoom, setActiveRoom] = useState(null); // room object open in viewer

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['live'],
    queryFn: async () => {
      const response = await api.get('/live', { params: { limit: 50 } });
      return response.data.rooms || [];
    }
  });

  const rooms = data || [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['live'] });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.post('/live', { title: title.trim() });
      toast.success('Stream started!');
      setTitle('');
      setActiveRoom(res.data); // open the new room to get the RTMP key
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start stream');
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
        Failed to load live rooms: {error.message}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto border-l border-r border-gray-700 min-h-full">
      <div className="sticky top-0 bg-black/80 backdrop-blur border-b border-gray-700 p-4 z-10">
        <h2 className="text-xl font-bold">Live</h2>
        <p className="text-sm text-gray-500 mt-1">Go live and watch streams in real time</p>
      </div>

      {/* Start a stream */}
      <form onSubmit={handleCreate} className="flex gap-2 p-4 border-b border-gray-700">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Stream title..."
          maxLength={500}
          className="flex-1 bg-gray-900 rounded-full px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={creating}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-600 to-blue-400 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          <FiVideo /> {creating ? 'Starting...' : 'Go live'}
        </button>
      </form>

      {/* Grid of live rooms */}
      {rooms.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No live streams right now. Start one!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => setActiveRoom(room)}
              className="rounded-2xl overflow-hidden border border-gray-800 bg-gray-900 text-left hover:border-gray-600 transition group"
            >
              {/* Thumbnail / placeholder */}
              <div className="aspect-video bg-black relative flex items-center justify-center">
                {room.thumbnail_url ? (
                  <img src={room.thumbnail_url} alt={room.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                    <FiVideo className="w-10 h-10 text-gray-600 group-hover:text-gray-400 transition" />
                  </div>
                )}
                <span className="absolute top-2 left-2 flex items-center gap-1 bg-red-600 rounded px-2 py-0.5 text-xs font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
                </span>
                <span className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/70 rounded px-2 py-0.5 text-xs">
                  <FiEye /> {room.current_viewers}
                </span>
              </div>
              <div className="p-3">
                <p className="font-semibold text-sm truncate">{room.title || 'Untitled stream'}</p>
                <div className="flex items-center gap-2 mt-1">
                  <img src={room.avatar_url || 'https://via.placeholder.com/24'} alt={room.display_name} className="w-5 h-5 rounded-full object-cover" />
                  <span className="text-xs text-gray-400">{room.display_name}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Live player + chat */}
      {activeRoom && (
        <LiveRoomView
          room={activeRoom}
          onClose={() => setActiveRoom(null)}
          onEnded={() => {
            setActiveRoom(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

export default LivePage;