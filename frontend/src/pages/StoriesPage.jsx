import React, { useMemo, useRef, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FiPlus } from 'react-icons/fi';
import api from '../api/client';
import StoryViewer from '../components/StoryViewer';

/**
 * StoriesPage — 24-hour ephemeral stories.
 *  - Grid of story circles (pink/purple ring when a story is < 24h old)
 *  - Fullscreen modal viewer with prev/next navigation, reactions, views
 *  - Create flow reuses POST /posts/media for upload, then POST /stories
 */
function StoriesPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [creating, setCreating] = useState(false);
  const [viewer, setViewer] = useState(null); // { group, index }

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['stories'],
    queryFn: async () => {
      const response = await api.get('/stories', { params: { limit: 100 } });
      return response.data.stories || [];
    }
  });

  const stories = data || [];

  // Group flat story list by author for the circle grid.
  const groups = useMemo(() => {
    const map = new Map();
    stories.forEach((s) => {
      const key = s.author_id;
      if (!map.has(key)) {
        map.set(key, {
          author: {
            id: s.author_id,
            username: s.username,
            display_name: s.display_name,
            avatar_url: s.avatar_url,
            verified_badge: s.verified_badge
          },
          stories: []
        });
      }
      map.get(key).stories.push(s);
    });
    return Array.from(map.values());
  }, [stories]);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['stories'] });
  }, [queryClient]);

  /**
   * Upload the selected file then create a story. Reuses POST /posts/media.
   */
  const handleCreate = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setCreating(true);
    try {
      const formData = new FormData();
      formData.append('media', file);
      const uploadRes = await api.post('/posts/media', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const { url, key, type } = uploadRes.data;
      await api.post('/stories', {
        mediaUrl: url,
        mediaKey: key,
        mediaKind: type,
        caption: ''
      });

      toast.success('Story posted!');
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to post story');
    } finally {
      setCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto border-l border-r border-gray-700 flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-2xl mx-auto border-l border-r border-gray-700 p-8 text-center text-gray-500">
        Failed to load stories: {error.message}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto border-l border-r border-gray-700 min-h-full">
      <div className="sticky top-0 bg-black/80 backdrop-blur border-b border-gray-700 p-4 z-10">
        <h2 className="text-xl font-bold">Stories</h2>
        <p className="text-sm text-gray-500 mt-1">Ephemeral posts that disappear after 24 hours</p>
      </div>

      {/* Story circles */}
      <div className="flex gap-5 overflow-x-auto p-4 border-b border-gray-700">
        {/* Add-your-story */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={creating}
          className="flex flex-col items-center gap-1 shrink-0"
          title="Post a story"
        >
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center bg-gray-900 overflow-hidden">
            {creating ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-pink-500"></div>
            ) : (
              <FiPlus className="w-7 h-7 text-gray-400" />
            )}
          </div>
          <span className="text-xs text-gray-400">Your story</span>
        </button>

        {/* Followed users' stories */}
        {groups.map((group) => {
          const newest = group.stories[0];
          return (
            <button
              key={newest.id}
              onClick={() => setViewer({ group, index: 0 })}
              className="flex flex-col items-center gap-1 shrink-0"
            >
              <div
                className={`w-16 h-16 rounded-full p-[2px] ${
                  newest.is_viewed ? 'bg-gray-700' : 'bg-gradient-to-tr from-pink-500 to-purple-500'
                }`}
              >
                <img
                  src={newest.avatar_url || 'https://via.placeholder.com/64'}
                  alt={newest.display_name}
                  className="w-full h-full rounded-full object-cover border-2 border-black"
                />
              </div>
              <span className="text-xs text-gray-300 max-w-[70px] truncate">
                {newest.display_name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Hint when empty */}
      {groups.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>No stories yet. Post your first story to get started!</p>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleCreate}
      />

      {/* Viewer modal */}
      {viewer && (
        <StoryViewer
          group={viewer.group}
          initialIndex={viewer.index}
          onClose={() => setViewer(null)}
          onChanged={() => refresh()}
        />
      )}
    </div>
  );
}

export default StoriesPage;