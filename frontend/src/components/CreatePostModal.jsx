import React, { useState, useRef } from 'react';
import { FiX, FiImage, FiSend, FiAlignLeft, FiStar, FiClock } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../api/client';
import useAuthStore from '../stores/authStore';
import Icon from './icons';

const KIND_TYPES = [
  { key: 'text', label: 'Text', icon: 'comment' },
  { key: 'image', label: 'Photo/Video', icon: 'image' },
  { key: 'poll', label: 'Poll', icon: 'poll' },
  { key: 'article', label: 'Article', icon: 'article' }
];

/**
 * CreatePostModal — full composer (legacy parity):
 *  - Kind chooser: text / image+video / poll / article
 *  - Poll builder (2-4 options), article title
 *  - Exclusive post + unlock price, schedule toggle (verified creators only)
 *  - Character ring counter: 280 base, 10000 for verified
 */
function CreatePostModal({ onClose, onCreated }) {
  const currentUser = useAuthStore((s) => s.user);
  const isVerified = !!currentUser?.verified_badge;
  const CHAR_LIMIT = isVerified ? 10000 : 280;

  const [kind, setKind] = useState('text');
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaKey, setMediaKey] = useState('');
  const [mediaKind, setMediaKind] = useState('image');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [isExclusive, setIsExclusive] = useState(false);
  const [unlockPrice, setUnlockPrice] = useState(0);
  const [schedule, setSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [posting, setPosting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const ring = 69.115; // circumference for r=11
  const charsLeft = CHAR_LIMIT - body.length;
  const pct = Math.min(1, body.length / CHAR_LIMIT);

  const activeKind = mediaUrl ? mediaKind : kind;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('media', file);
      const res = await api.post('/posts/media', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setMediaUrl(res.data.url);
      setMediaKind(res.data.type);
      setMediaKey(res.data.key);
      setKind(res.data.type === 'video' ? 'video' : 'image');
      toast.success('Media uploaded');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const setPoll = (idx, val) =>
    setPollOptions((opts) => opts.map((o, i) => (i === idx ? val : o)));
  const addPollOption = () =>
    setPollOptions((o) => (o.length < 4 ? [...o, ''] : o));
  const removePollOption = (idx) =>
    setPollOptions((o) => (o.length > 2 ? o.filter((_, i) => i !== idx) : o));
const handlePost = async (e) => {
    e.preventDefault();

    if (kind === 'poll') {
      const opts = pollOptions.map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) return toast.error('Add at least 2 poll options');
      if (pollOptions.some((o) => o.trim().length > 60)) return toast.error('Poll options max 60 characters');
    }
    if (kind === 'article' && !title.trim()) return toast.error('Articles need a title');
    if (charsLeft < 0) return toast.error(`Over the ${CHAR_LIMIT} character limit`);
    if (schedule && !scheduledAt) return toast.error('Pick a date/time to schedule');

    setPosting(true);
    try {
      const res = await api.post('/posts', {
        kind: activeKind,
        body: body.trim(),
        title: kind === 'article' ? title.trim() : undefined,
        mediaUrl,
        mediaKey,
        mediaType: mediaUrl ? mediaKind : undefined,
        pollOptions: kind === 'poll' ? pollOptions.map((o) => o.trim()).filter(Boolean) : undefined,
        isExclusive,
        unlockPrice: isExclusive ? unlockPrice : undefined,
        scheduledAt: schedule ? new Date(scheduledAt).toISOString() : undefined
      });
      toast.success(schedule ? 'Post scheduled!' : 'Posted!');
      onCreated?.(res.data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 overlay-fade" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-black border border-gray-700 rounded-2xl p-5 drawer-slide max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Icon name={KIND_TYPES.find((k) => k.key === activeKind)?.icon || 'comment'} size={18} />
            Create
          </h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-gray-800 flex items-center justify-center">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Kind chooser */}
        <div className="flex items-center gap-2 mb-4">
          {KIND_TYPES.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => { setKind(k.key); if (k.key !== 'image') { setMediaUrl(''); setMediaKey(''); } }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                activeKind === k.key
                  ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                  : 'border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500'
              }`}
            >
              <Icon name={k.icon} size={15} />
              {k.label}
            </button>
          ))}
        </div>

        <form onSubmit={handlePost} className="space-y-4">
          {/* Article title */}
          {kind === 'article' && (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Article title"
              maxLength={500}
              className="w-full bg-transparent border border-gray-700 rounded-xl px-3 py-2.5 text-white font-semibold placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={kind === 'article' ? 'Write your article…' : "What's happening?"}
            rows={kind === 'article' ? 8 : 4}
            maxLength={CHAR_LIMIT}
            className="w-full bg-transparent border border-gray-700 rounded-xl p-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />

          {/* Poll builder */}
          {kind === 'poll' && (
            <div className="space-y-2 rounded-xl border border-gray-700 p-3">
              {pollOptions.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    value={opt}
                    onChange={(e) => setPoll(idx, e.target.value)}
                    placeholder={`Option ${idx + 1}`}
                    maxLength={60}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {idx >= 2 && (
                    <button type="button" onClick={() => removePollOption(idx)} className="text-gray-500 hover:text-red-400 text-xs">✕</button>
                  )}
                </div>
              ))}
              {pollOptions.length < 4 && (
                <button type="button" onClick={addPollOption} className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  <FiAlignLeft className="w-3.5 h-3.5" /> Add option
                </button>
              )}
            </div>
          )}

          {/* Media preview */}
          {mediaUrl && (
            <div className="relative rounded-xl overflow-hidden">
              {mediaKind === 'image' ? (
                <img src={mediaUrl} alt="Preview" className="w-full max-h-64 object-cover" />
              ) : (
                <video src={mediaUrl} controls className="w-full max-h-64" />
              )}
              <button
                type="button"
                onClick={() => { setMediaUrl(''); setMediaKey(''); }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center hover:bg-black"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
          )}
{/* Verified creator extras */}
          {isVerified && (
            <div className="rounded-xl border border-gray-800 p-3 space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="flex items-center gap-2 text-sm text-gray-300"><FiStar className="w-4 h-4 text-yellow-500" /> Exclusive post</span>
                <input type="checkbox" checked={isExclusive} onChange={(e) => setIsExclusive(e.target.checked)} className="accent-blue-500" />
              </label>
              {isExclusive && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Unlock price (DUYS)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={unlockPrice}
                    onChange={(e) => setUnlockPrice(Number(e.target.value))}
                    className="w-28 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}
              <label className="flex items-center justify-between cursor-pointer">
                <span className="flex items-center gap-2 text-sm text-gray-300"><FiClock className="w-4 h-4 text-blue-400" /> Schedule post</span>
                <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} className="accent-blue-500" />
              </label>
              {schedule && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={handleFile} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-3 py-2 rounded-full text-sm text-gray-300 hover:bg-gray-800 transition disabled:opacity-50"
              >
                <FiImage className="w-4 h-4" />
                {uploading ? 'Uploading...' : 'Photo/Video'}
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Char ring counter */}
              <div className="relative w-7 h-7" title={`${charsLeft} characters left`}>
                <svg width="28" height="28" viewBox="0 0 26 26" className="absolute inset-0">
                  <circle cx="13" cy="13" r="11" fill="none" stroke="rgb(var(--c-gray-700))" strokeWidth="2.5" />
                  <circle
                    cx="13" cy="13" r="11" fill="none"
                    stroke={charsLeft < 0 ? '#ef4444' : charsLeft < 20 ? '#f59e0b' : 'rgb(29 155 246)'}
                    strokeWidth="2.5"
                    strokeDasharray={ring}
                    strokeDashoffset={ring * (1 - pct)}
                    strokeLinecap="round"
                    transform="rotate(-90 13 13)"
                    className="transition-all"
                  />
                </svg>
                <span className={`absolute inset-0 flex items-center justify-center text-[9px] font-bold ${charsLeft < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                  {Math.min(99, Math.max(0, charsLeft))}
                </span>
              </div>

              <button
                type="submit"
                disabled={posting || (!body.trim() && !mediaUrl && !(kind === 'poll')) || (kind === 'poll' && pollOptions.filter((o) => o.trim()).length < 2)}
                className="flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-blue-600 to-blue-400 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition"
              >
                <FiSend className="w-4 h-4" />
                {posting ? 'Posting...' : schedule ? 'Schedule' : 'Post'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreatePostModal;