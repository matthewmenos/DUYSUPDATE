import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import Hls from 'hls.js';
import toast from 'react-hot-toast';
import { FiEye, FiSend, FiX } from 'react-icons/fi';
import api from '../api/client';
import useAuthStore from '../stores/authStore';

/**
 * LiveRoomView - fullscreen live room with an HLS player, real-time chat
 * (Socket.io), viewer count and host controls (end stream).
 */
function LiveRoomView({ room, onClose, onEnded }) {
  const user = useAuthStore((state) => state.user);
  const videoRef = useRef(null);
  const chatEndRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [viewerCount, setViewerCount] = useState(room?.current_viewers ?? 0);
  const [input, setInput] = useState('');
  const [chatOpen, setChatOpen] = useState(true);
  const [ended, setEnded] = useState(false);
  const socketRef = useRef(null);

  const roomId = room?.id;
  const isHost = user && room && Number(user.id) === Number(room.host_id);

  // Derive an HLS stream URL for playback. In production this comes from the
  // streaming platform (e.g. Mux/Cloudflare Stream) keyed by the room.
  const streamUrl = room?.streamUrl ||
    `${import.meta.env.VITE_HLS_BASE_URL || 'https://example.com/live'}/${roomId}/index.m3u8`;

  // Set up HLS player.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      return () => hls.destroy();
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
    }
  }, [streamUrl]);

  // Connect to Socket.io and join the room.
  useEffect(() => {
    if (!roomId) return;
    const token = localStorage.getItem('accessToken');
    const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', {
      auth: { token }
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('live:join', roomId);
    });
    socket.on('live:message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });
    socket.on('live:viewers', ({ viewerCount: count }) => {
      setViewerCount(count);
    });
    socket.on('live:ended', () => {
      setEnded(true);
      onEnded?.();
    });

    return () => {
      socket.emit('live:leave', roomId);
      socket.disconnect();
    };
  }, [roomId, onEnded]);

  // Load chat history on open.
  useEffect(() => {
    if (!roomId) return;
    (async () => {
      try {
        const res = await api.get(`/live/${roomId}/messages`, { params: { limit: 50 } });
        setMessages(res.data.messages.reverse());
      } catch {
        /* ignore */
      }
    })();
  }, [roomId]);

  // Track viewer join/leave.
  useEffect(() => {
    if (!roomId) return;
    api.post(`/live/${roomId}/join`).catch(() => {});
    return () => {
      api.post(`/live/${roomId}/leave`).catch(() => {});
    };
  }, [roomId]);

  // Auto-scroll chat to bottom on new messages.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(
    async (e) => {
      e?.preventDefault();
      const text = input.trim();
      if (!text) return;
      try {
        await api.post(`/live/${roomId}/message`, { message: text });
        setInput('');
      } catch (err) {
        toast.error(err.response?.data?.error || 'Failed to send message');
      }
    },
    [input, roomId]
  );

  const handleEnd = async () => {
    if (!window.confirm('End this live stream?')) return;
    try {
      await api.post(`/live/${roomId}/end`);
      setEnded(true);
      onEnded?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to end stream');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4">
      <div className="relative w-full max-w-5xl h-full max-h-[90vh] bg-black rounded-2xl overflow-hidden flex flex-col md:flex-row">
        {/* Player */}
        <div className="flex-1 relative bg-black">
          <video ref={videoRef} controls autoPlay playsInline className="w-full h-full object-contain" />

          {/* Top bar */}
          <div className="absolute top-0 inset-x-0 flex items-center gap-3 p-3 bg-gradient-to-b from-black/70 to-transparent">
            <img src={room.avatar_url || 'https://via.placeholder.com/40'} alt={room.display_name} className="w-9 h-9 rounded-full object-cover" />
            <div className="flex-1">
              <p className="font-semibold text-sm">{room.display_name}</p>
              <p className="text-xs text-gray-300 truncate">{room.title || 'Untitled stream'}</p>
            </div>
            <span className="flex items-center gap-1 text-xs bg-red-600 rounded-full px-2 py-1">
              <FiEye /> {viewerCount}
            </span>
            {isHost && (
              <button onClick={handleEnd} className="px-3 py-1 rounded-full bg-red-600 text-xs font-semibold hover:bg-red-500">
                End stream
              </button>
            )}
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-gray-200 text-lg">
              <FiX />
            </button>
          </div>

          {/* Ended overlay */}
          {ended && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <p className="text-xl font-bold text-gray-200">Stream ended</p>
            </div>
          )}

          {/* Host streaming info */}
          {isHost && room.streamKey && (
            <div className="absolute bottom-3 left-3 right-3 bg-black/70 rounded-xl p-3 text-xs text-gray-300">
              <p className="font-semibold text-white mb-1">Streaming setup (OBS)</p>
              <p>RTMP URL: <span className="text-pink-400">{room.rtmpUrl}</span></p>
              <p>Stream key: <span className="text-pink-400">{room.streamKey}</span></p>
            </div>
          )}
        </div>

        {/* Chat sidebar */}
        {chatOpen && (
          <div className="w-full md:w-80 flex flex-col border-t md:border-t-0 md:border-l border-gray-800 bg-black">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold text-sm">Live chat</h3>
              <button onClick={() => setChatOpen(false)} className="text-gray-400 hover:text-white text-sm">
                Hide
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {messages.map((m) => (
                <div key={m.id} className="text-sm">
                  <span className="font-semibold text-blue-400">{m.display_name}: </span>
                  <span className="text-gray-200">{m.body}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={sendMessage} className="flex items-center gap-2 p-3 border-t border-gray-800">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Send a message..."
                className="flex-1 bg-gray-900 rounded-full px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500"
              />
              <button type="submit" className="w-9 h-9 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 flex items-center justify-center hover:opacity-90">
                <FiSend className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default LiveRoomView;

