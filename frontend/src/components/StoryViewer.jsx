import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { FiEye } from 'react-icons/fi';
import api from '../api/client';

const REACTIONS = ['😂', '😢', '😍', '🔥', '👍', '👏', '👀', '😮'];

/**
 * Fullscreen modal story viewer.
 * Shows one author's stories with prev/next navigation, auto view tracking,
 * emoji reactions and delete (authors only).
 */
function StoryViewer({ group, initialIndex = 0, onClose, onChanged }) {
  const { stories } = group;
  const [index, setIndex] = useState(initialIndex);
  const [reactions, setReactions] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const startedRef = useRef({});

  const story = stories[index];

  // Load aggregated reactions for the current story.
  useEffect(() => {
    if (!story) return;
    let active = true;
    (async () => {
      try {
        const res = await api.get(`/stories/${story.id}/reactions`);
        if (active) setReactions(res.data);
      } catch {
        if (active) setReactions({ reactions: [], myReaction: null });
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  // Record a view once per story per open session.
  useEffect(() => {
    if (!story || startedRef.current[story.id]) return;
    startedRef.current[story.id] = true;
    api.post(`/stories/${story.id}/view`).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  const goPrev = () => {
    if (index > 0) setIndex(index - 1);
  };

  const goNext = () => {
    if (index < stories.length - 1) setIndex(index + 1);
    else onClose();
  };

  const handleDelete = async () => {
    if (!story || deleting) return;
    if (!window.confirm('Delete this story?')) return;
    setDeleting(true);
    try {
      await api.delete(`/stories/${story.id}`);
      toast.success('Story deleted');
      onChanged();
      if (index < stories.length - 1) setIndex(index + 1);
      else onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete story');
    } finally {
      setDeleting(false);
    }
  };

  const handleReact = async (emoji) => {
    try {
      const res = await api.post(`/stories/${story.id}/react`, { emoji });
      setReactions(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to react');
    }
  };

  const isOwn = story && story.author_id === group.author.id;

  if (!story) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
      <div className="relative w-full max-w-lg h-full max-h-[90vh] bg-black flex flex-col">
        {/* Progress bar */}
        <div className="flex gap-1 p-3">
          {stories.map((s, i) => (
            <div key={s.id} className="flex-1 h-1 rounded bg-gray-600 overflow-hidden">
              <div className="h-full rounded bg-white" style={{ width: i <= index ? '100%' : '0%' }} />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-1">
          <img src={story.avatar_url || 'https://via.placeholder.com/40'} alt={story.display_name} className="w-9 h-9 rounded-full object-cover" />
          <div className="flex-1">
            <p className="font-semibold text-sm">{story.display_name}</p>
            <p className="text-xs text-gray-400">
              {story.caption ? `${story.caption} · ` : ''}
              {new Date(story.created_at).toLocaleString()}
            </p>
          </div>
          {isOwn && (
            <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(); }} disabled={deleting} className="px-3 py-1 rounded-full border border-gray-600 text-xs text-red-400 hover:bg-gray-900">
              Delete
            </button>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-gray-800 flex items-center justify-center text-gray-400 text-lg">
            ×
          </button>
        </div>
        {/* Media */}
        <div className="flex-1 flex items-center justify-center overflow-hidden relative">
          {story.media_kind === 'video' ? (
            <video src={story.media_url} controls autoPlay loop className="max-w-full max-h-full" />
          ) : (
            <img src={story.media_url} alt={story.caption} className="max-w-full max-h-full object-contain" />
          )}

          <button type="button" aria-label="Previous story" onClick={(e) => { e.stopPropagation(); goPrev(); }} disabled={index === 0} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white text-2xl flex items-center justify-center hover:bg-black/60 disabled:opacity-20">‹</button>
          <button type="button" aria-label="Next story" onClick={(e) => { e.stopPropagation(); goNext(); }} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white text-2xl flex items-center justify-center hover:bg-black/60">›</button>
        </div>

        {/* Footer: views + reactions */}
        <div className="px-4 py-3 border-t border-gray-800">
          <div className="flex items-center gap-4 text-sm text-gray-400 mb-3">
            <span className="flex items-center gap-1"><FiEye /> {story.view_count ?? 0} views</span>
            {reactions && reactions.reactions.length > 0 && (
              <span className="flex items-center gap-2">
                {reactions.reactions.slice(0, 4).map((r) => (
                  <span key={r.emoji} title={`${r.emoji} ${r.count}`}>{r.emoji}<span className="text-xs text-gray-500">{r.count}</span></span>
                ))}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {REACTIONS.map((emoji) => (
                <button type="button" key={emoji} onClick={() => handleReact(emoji)} className={`w-9 h-9 rounded-full text-xl transition hover:bg-gray-800 ${reactions?.myReaction === emoji ? 'bg-pink-500/30 scale-110' : ''}`}>{emoji}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StoryViewer;
