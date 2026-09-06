import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { FiSend, FiUsers, FiPlus, FiCopy, FiX, FiCheck, FiShield, FiUserMinus } from 'react-icons/fi';
import api from '../api/client';
import useAuthStore from '../stores/authStore';

/**
 * GroupChatView - WhatsApp/Telegram-style group conversations.
 * - Left: list of the user's groups (with unread counts + create button)
 * - Right: selected group chat with messages, reactions, typing indicator
 * - Owner/admin: invite-token copy, promote/demote/remove members
 * All realtime via Socket.io `group:*` events.
 */
function GroupChatView() {
  const user = useAuthStore((state) => state.user);
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(null);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [members, setMembers] = useState([]);
  const [createForm, setCreateForm] = useState({ name: '', description: '' });
  const [sending, setSending] = useState(false);
  const socketRef = useRef(null);
  const chatEndRef = useRef(null);
  const typingTimer = useRef(null);

  const currentUserId = Number(user?.id);

  const loadGroups = useCallback(async () => {
    try {
      const res = await api.get('/messaging/groups');
      setGroups(res.data.groups || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load groups');
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  // Socket setup (single connection, rooms joined/left on group change)
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const socket = io(import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin), {
      auth: { token }
    });
    socketRef.current = socket;

    socket.on('group:message', (msg) => {
      if (activeGroup && Number(msg.group_id) === Number(activeGroup.id)) {
        setMessages((prev) => (prev.some((m) => Number(m.id) === Number(msg.id)) ? prev : [...prev, msg]));
      }
      loadGroups();
    });

    socket.on('group:typing', ({ groupId, userId, isTyping }) => {
      if (activeGroup && Number(groupId) === Number(activeGroup.id) && Number(userId) !== currentUserId) {
        setTyping(isTyping ? userId : null);
      }
    });

    socket.on('group:reaction', ({ messageId, emoji }) => {
      setMessages((prev) => prev.map((m) =>
        Number(m.id) === Number(messageId) ? { ...m, reaction: emoji } : m
      ));
    });

    return () => {
      socket.disconnect();
    };
  }, [activeGroup, loadGroups, currentUserId]);

  // NOTE: socket reconnects per group — acceptable for group workspace.

  // Join socket room for the active group
  useEffect(() => {
    const s = socketRef.current;
    if (!s || !activeGroup) return;
    s.emit('group:join', activeGroup.id);
    return () => s.emit('group:leave', activeGroup.id);
  }, [activeGroup]);

  // Load messages when active group changes
  useEffect(() => {
    if (!activeGroup) { setMessages([]); return; }
    (async () => {
      try {
        const res = await api.get(`/messaging/groups/${activeGroup.id}/messages`, { params: { limit: 50 } });
        setMessages((res.data.messages || []).reverse());
      } catch (err) {
        toast.error(err.response?.data?.error || 'Failed to load messages');
      }
    })();
  }, [activeGroup]);

  // Load members for active group
  useEffect(() => {
    if (!activeGroup) return;
    (async () => {
      try {
        const res = await api.get(`/messaging/groups/${activeGroup.id}/members`);
        setMembers(res.data.members || []);
      } catch { /* ignore */ }
    })();
  }, [activeGroup]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isAdmin = activeGroup && (activeGroup.role === 'owner' || activeGroup.role === 'admin');

  const createGroup = async (e) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    setSending(true);
    try {
      const res = await api.post('/messaging/groups', createForm);
      toast.success('Group created');
      setShowCreate(false);
      setCreateForm({ name: '', description: '' });
      await loadGroups();
      setActiveGroup(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create group');
    } finally {
      setSending(false);
    }
  };

  const sendMessage = async (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || !activeGroup) return;
    try {
      await api.post(`/messaging/groups/${activeGroup.id}/message`, { body: text });
      setInput('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send');
    }
  };

  const emitTyping = () => {
    const s = socketRef.current;
    if (!s || !activeGroup) return;
    s.emit('group:typing', { groupId: activeGroup.id, isTyping: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      s.emit('group:typing', { groupId: activeGroup.id, isTyping: false });
    }, 1200);
  };

  const react = async (messageId) => {
    try {
      await api.post(`/messaging/groups/${activeGroup.id}/messages/${messageId}/react`, { emoji: '❤️' });
    } catch { /* ignore */ }
  };

  const copyInvite = () => {
    if (!activeGroup?.invite_token) return;
    const url = `${window.location.origin}/join/group/${activeGroup.invite_token}`;
    navigator.clipboard.writeText(url).catch(() => {});
    toast.success('Invite link copied');
  };

  const changeRole = async (targetId, action) => {
    try {
      await api.post(`/messaging/groups/${activeGroup.id}/members/${targetId}/${action}`);
      const res = await api.get(`/messaging/groups/${activeGroup.id}/members`);
      setMembers(res.data.members || []);
      toast.success(action === 'promote' ? 'Promoted to admin' : 'Demoted to member');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const removeMember = async (targetId) => {
    try {
      await api.delete(`/messaging/groups/${activeGroup.id}/members/${targetId}`);
      const res = await api.get(`/messaging/groups/${activeGroup.id}/members`);
      setMembers(res.data.members || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove member');
    }
  };

  const leaveGroup = async () => {
    if (!activeGroup) return;
    try {
      await api.delete(`/messaging/groups/${activeGroup.id}/leave`);
      toast.success('Left group');
      setActiveGroup(null);
      loadGroups();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to leave');
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Groups list */}
      <div className="md:w-72 border-r border-gray-800 flex flex-col">
        <div className="p-3 border-b border-gray-800 flex items-center justify-between">
          <h3 className="font-bold text-sm">Groups</h3>
          <button onClick={() => setShowCreate(true)} className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center hover:opacity-90" aria-label="New group">
            <FiPlus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingGroups ? (
            <p className="p-6 text-center text-sm text-gray-500">Loading groups...</p>
          ) : groups.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-500">No groups yet. Create one!</p>
          ) : (
            groups.map((g) => (
              <button
                key={g.id}
                onClick={() => setActiveGroup(g)}
                className={`w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-900 transition ${
                  activeGroup && Number(activeGroup.id) === Number(g.id) ? 'bg-gray-900' : ''
                }`}
              >
                <img
                  src={g.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(g.name || 'G')}&background=2563eb&color=fff&bold=true`}
                  alt={g.name}
                  className="w-11 h-11 rounded-full bg-gray-800 object-cover"
                />
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold truncate">{g.name}</p>
                  <p className="text-xs text-gray-500 truncate">{g.description || `${g.member_count || 0} members`}</p>
                </div>
                {Number(g.unread) > 0 && (
                  <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full px-2 py-0.5">{g.unread}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat panel */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {!activeGroup ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <FiUsers className="w-12 h-12 mb-3" />
            <p className="text-sm">Select a group to start chatting</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <img
                  src={activeGroup.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(activeGroup.name || 'G')}&background=2563eb&color=fff&bold=true`}
                  alt={activeGroup.name}
                  className="w-9 h-9 rounded-full object-cover"
                />
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{activeGroup.name}</p>
                  <p className="text-xs text-gray-500 truncate">{members.length} members</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {isAdmin && (
                  <button onClick={copyInvite} className="w-8 h-8 rounded-full hover:bg-gray-900 flex items-center justify-center text-gray-400" title="Copy invite link">
                    <FiCopy className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => setShowMembers(true)} className="w-8 h-8 rounded-full hover:bg-gray-900 flex items-center justify-center text-gray-400" title="Members">
                  <FiUsers className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {messages.length === 0 && (
                <p className="text-center text-sm text-gray-500 py-6">No messages yet. Say hi!</p>
              )}
              {messages.map((m) => {
                const own = Number(m.sender_id) === currentUserId;
                return (
                  <div key={m.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${own ? 'bg-blue-600 rounded-br-sm' : 'bg-gray-800 rounded-bl-sm'}`}>
                      {!own && <p className="text-[11px] font-semibold text-blue-400 mb-0.5">{m.display_name || m.username}</p>}
                      <p>{m.body}</p>
                      <div className="flex items-center justify-end gap-1 mt-0.5">
                        {m.reaction && <span className="text-xs">❤️</span>}
                        <span className="text-[10px] opacity-60">
                          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {!own && (
                          <button onClick={() => react(m.id)} className="text-xs hover:scale-125 transition" title="React with ❤️">
                            ❤️
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {typing && (
                <div className="flex justify-start">
                  <div className="bg-gray-800 text-gray-400 rounded-2xl rounded-bl-sm px-4 py-2 text-sm">
                    typing...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={sendMessage} className="flex items-center gap-2 p-3 border-t border-gray-800">
              <input
                value={input}
                onChange={(e) => { setInput(e.target.value); emitTyping(); }}
                placeholder="Message the group..."
                className="flex-1 bg-gray-900 rounded-full px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="submit" disabled={!input.trim()} className="w-9 h-9 rounded-full bg-gradient-to-r from-blue-600 to-blue-400 flex items-center justify-center hover:opacity-90 disabled:opacity-40" aria-label="Send">
                <FiSend className="w-4 h-4" />
              </button>
            </form>
          </>
        )}
      </div>

      {/* Create group modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <form onSubmit={createGroup} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Create a group</h3>
              <button type="button" onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-white"><FiX /></button>
            </div>
            <div className="space-y-3">
              <input
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="Group name"
                className="w-full bg-black rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                placeholder="Description (optional)"
                rows={3}
                className="w-full bg-black rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={sending || !createForm.name.trim()}
              className="mt-5 w-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {sending ? 'Creating...' : 'Create group'}
            </button>
          </form>
        </div>
      )}

      {/* Members modal */}
      {showMembers && activeGroup && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowMembers(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Members ({members.length})</h3>
              <button onClick={() => setShowMembers(false)} className="text-gray-400 hover:text-white"><FiX /></button>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800">
                  <img
                    src={m.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.display_name || m.username)}&background=2563eb&color=fff`}
                    alt={m.username}
                    className="w-9 h-9 rounded-full object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{m.display_name || m.username}</p>
                    <p className="text-xs text-gray-500">{m.role}{m.role === 'owner' && ' 👑'}</p>
                  </div>
                  {isAdmin && m.role !== 'owner' && Number(m.id) !== currentUserId && (
                    <div className="flex items-center gap-1">
                      {m.role === 'member' ? (
                        <button onClick={() => changeRole(m.id, 'promote')} className="text-xs text-blue-400 hover:underline" title="Promote to admin">
                          <FiCheck className="w-4 h-4" />
                        </button>
                      ) : (
                        <button onClick={() => changeRole(m.id, 'demote')} className="text-xs text-yellow-400 hover:underline" title="Demote to member">
                          <FiShield className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => removeMember(m.id)} className="text-xs text-red-400 hover:underline" title="Remove">
                        <FiUserMinus className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {activeGroup.role === 'owner' && (
              <button onClick={leaveGroup} className="mt-4 w-full rounded-full border border-red-600 text-red-400 px-4 py-2 text-sm font-semibold hover:bg-red-950">
                Leave group
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default GroupChatView;