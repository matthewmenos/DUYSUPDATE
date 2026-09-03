import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { FiSend, FiPaperclip, FiEdit2, FiTrash2, FiCheck, FiX, FiMessageCircle } from 'react-icons/fi';
import api from '../api/client';
import useAuthStore from '../stores/authStore';

/**
 * MessagingPage - split layout: conversation list (left) + chat view (right).
 * Real-time messages, typing indicator and read state via Socket.io.
 */
function MessagingPage() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [activeConv, setActiveConv] = useState(null); // conversation object
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const currentUserId = user?.id;

  // Conversations list
  const { data: conversations = [], refetch: refetchConversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const res = await api.get('/messages', { params: { limit: 50 } });
      return res.data.conversations || [];
    }
  });

  // Socket setup
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', {
      auth: { token }
    });
    socketRef.current = socket;

    socket.on('dm:message', (msg) => {
      // If the message belongs to the open conversation, append it.
      setMessages((prev) => {
        if (!activeConv || Number(msg.conversation_id) !== Number(activeConv.id)) return prev;
        if (prev.some((m) => Number(m.id) === Number(msg.id))) return prev;
        return [...prev, msg];
      });
      // Refresh conversation list (last message preview / reorder).
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });

    socket.on('dm:delete', ({ id, conversation_id }) => {
      setMessages((prev) => {
        if (!activeConv || Number(conversation_id) !== Number(activeConv.id)) return prev;
        return prev.filter((m) => Number(m.id) !== Number(id));
      });
    });

    socket.on('dm:typing', ({ conversationId, isTyping }) => {
      if (activeConv && Number(conversationId) === Number(activeConv.id)) {
        setTyping(isTyping);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [activeConv, queryClient]);

  // Join conversation socket room when opened.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !activeConv) return;
    socket.emit('dm:join', activeConv.id);
    return () => {
      socket.emit('dm:leave', activeConv.id);
    };
  }, [activeConv]);

  // Load messages when a conversation is opened.
  useEffect(() => {
    if (!activeConv) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    (async () => {
      try {
        const res = await api.get(`/messages/${activeConv.id}/messages`, { params: { limit: 50 } });
        setMessages(res.data.messages.reverse());
        // Mark as read.
        api.post(`/messages/${activeConv.id}/read`).catch(() => {});
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      } catch (err) {
        toast.error(err.response?.data?.error || 'Failed to load messages');
      } finally {
        setLoadingMessages(false);
      }
    })();
  }, [activeConv, queryClient]);

  // Auto-scroll to bottom.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);
const openConversation = async (conv) => {
    setActiveConv(conv);
  };

  const startNewChat = async () => {
    // Simple prompt-based start for now (select a user by id).
    const targetId = window.prompt('Enter the user ID to message:');
    if (!targetId) return;
    try {
      const conv = (await api.get(`/messages/${targetId}`)).data;
      setActiveConv(conv);
      refetchConversations();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start conversation');
    }
  };

  const sendMessage = async (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || !activeConv) return;
    // Optimistically append.
    const temp = {
      id: Date.now(),
      conversation_id: activeConv.id,
      sender_id: currentUserId,
      body: text,
      created_at: new Date().toISOString(),
      username: user?.username,
      display_name: user?.display_name,
      avatar_url: user?.avatar_url,
      optimistic: true
    };
    setMessages((prev) => [...prev, temp]);
    setInput('');
    try {
      const msg = (await api.post(`/messages/${activeConv.id}/message`, { body: text })).data;
      setMessages((prev) => prev.map((m) => (m.optimistic ? msg : m)));
      refetchConversations();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send message');
      setMessages((prev) => prev.filter((m) => m.id !== temp.id));
    }
  };

  const handleEdit = async (messageId) => {
    const text = editText.trim();
    if (!text) return;
    try {
      const msg = (await api.patch(`/messages/${messageId}`, { body: text })).data;
      setMessages((prev) => prev.map((m) => (Number(m.id) === Number(messageId) ? msg : m)));
      setEditingId(null);
      setEditText('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to edit message');
    }
  };

  const handleDelete = async (messageId) => {
    if (!window.confirm('Delete this message?')) return;
    try {
      await api.delete(`/messages/${messageId}`);
      setMessages((prev) => prev.filter((m) => Number(m.id) !== Number(messageId)));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete message');
    }
  };

  const emitTyping = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !activeConv) return;
    socket.emit('dm:typing', {
      conversationId: activeConv.id,
      recipientId: activeConv.other_user_id
    });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('dm:stopTyping', {
        conversationId: activeConv.id,
        recipientId: activeConv.other_user_id
      });
    }, 1500);
  }, [activeConv]);

  const isOwn = (msg) => Number(msg.sender_id) === Number(currentUserId);
return (
    <div className="h-full flex">
      {/* Conversations list */}
      <aside className="w-80 border-r border-gray-700 flex flex-col bg-black">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-xl font-bold">Messages</h2>
          <button
            onClick={startNewChat}
            className="w-9 h-9 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 flex items-center justify-center hover:opacity-90"
            aria-label="New message"
          >
            <FiMessageCircle className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="text-center text-gray-500 p-6 text-sm">No conversations yet</p>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => openConversation(conv)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-900 transition ${
                  activeConv && Number(activeConv.id) === Number(conv.id) ? 'bg-gray-900' : ''
                }`}
              >
                <img
                  src={conv.avatar_url || 'https://via.placeholder.com/40'}
                  alt={conv.display_name}
                  className="w-11 h-11 rounded-full object-cover"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm truncate">{conv.display_name}</span>
                    {conv.unread_count > 0 && (
                      <span className="bg-pink-500 text-white text-xs rounded-full px-2 py-0.5">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {conv.last_message_body || 'No messages yet'}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Chat view */}
      <main className="flex-1 flex flex-col bg-black">
        {!activeConv ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <FiMessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-700" />
              <p>Select a conversation to start chatting</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-3">
              <img
                src={activeConv.avatar_url || 'https://via.placeholder.com/40'}
                alt={activeConv.display_name}
                className="w-9 h-9 rounded-full object-cover"
              />
              <div>
                <p className="font-semibold text-sm">{activeConv.display_name}</p>
                <p className="text-xs text-gray-500">@{activeConv.username}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {loadingMessages ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                </div>
              ) : (
                messages.map((msg) => (
<div key={msg.id} className={`flex ${isOwn(msg) ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${
                        isOwn(msg)
                          ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-br-sm'
                          : 'bg-gray-800 text-white rounded-bl-sm'
                      }`}
                    >
                      {editingId === msg.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="bg-black/40 rounded px-2 py-1 text-sm focus:outline-none"
                            autoFocus
                          />
                          <button onClick={() => handleEdit(msg.id)} className="hover:opacity-80">
                            <FiCheck className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="hover:opacity-80">
                            <FiX className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <p>{msg.body}</p>
                      )}
                      <div className="flex items-center justify-end gap-2 mt-1">
                        <span className="text-[10px] opacity-70">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {isOwn(msg) && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setEditingId(msg.id);
                                setEditText(msg.body);
                              }}
                              className="hover:opacity-80"
                              aria-label="Edit"
                            >
                              <FiEdit2 className="w-3 h-3" />
                            </button>
                            <button onClick={() => handleDelete(msg.id)} className="hover:opacity-80" aria-label="Delete">
                              <FiTrash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
{typing && (
                <div className="flex justify-start">
                  <div className="bg-gray-800 text-gray-400 rounded-2xl rounded-bl-sm px-4 py-2 text-sm">
                    {activeConv.display_name} is typing...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={sendMessage} className="flex items-center gap-2 p-3 border-t border-gray-700">
              <button type="button" className="w-9 h-9 rounded-full hover:bg-gray-900 flex items-center justify-center text-gray-400" aria-label="Attach">
                <FiPaperclip />
              </button>
              <input
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  emitTyping();
                }}
                placeholder="Type a message..."
                className="flex-1 bg-gray-900 rounded-full px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className="w-9 h-9 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 flex items-center justify-center hover:opacity-90 disabled:opacity-40"
                aria-label="Send"
              >
                <FiSend className="w-4 h-4" />
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

export default MessagingPage;