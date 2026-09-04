import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FiPlus } from 'react-icons/fi';
import api from '../api/client';
import useAuthStore from '../stores/authStore';
import StoryViewer from './StoryViewer';

/**
 * Instagram-style story rings shown horizontally above the feed.
 * Stories (flat list from /stories) are grouped by author into a single
 * ring per person. A gradient ring = has unviewed stories; gray = all viewed.
 */
function StoryBar() {
  const user = useAuthStore((s) => s.user);
  const [viewer, setViewer] = useState(null); // { group, index }

  const { data } = useQuery({
    queryKey: ['stories', 'feed'],
    queryFn: async () => (await api.get('/stories?limit=50')).data.stories || []
  });

  const stories = data || [];

  // Group stories by author, preserving most-recent-first order.
  const groups = [];
  const seen = new Set();
  for (const s of stories) {
    if (seen.has(s.author_id)) continue;
    seen.add(s.author_id);
    groups.push({
      author: {
        id: s.author_id,
        username: s.username,
        display_name: s.display_name,
        avatar_url: s.avatar_url,
        verified_badge: s.verified_badge
      },
      stories: stories.filter((x) => x.author_id === s.author_id),
      hasUnviewed: stories.some((x) => x.author_id === s.author_id && !x.is_viewed)
    });
  }

  const own = groups.find((g) => g.author.id === user?.id);
  const others = groups.filter((g) => g.author.id !== user?.id);

  const openGroup = (group, index = 0) => setViewer({ group, index });

  return (
    <>
      <div className="border-b border-gray-700 bg-black/60 backdrop-blur">
        <div className="flex gap-4 overflow-x-auto px-4 py-3 scrollbar-none">
          {/* Your story */}
          <button
            onClick={() => own && openGroup(own)}
            className="flex flex-col items-center gap-1.5 shrink-0 w-16"
            title="Your story"
          >
            <div className="relative">
              <div className="w-14 h-14 rounded-full overflow-hidden ring-2 ring-gray-700">
                <img
                  src={user?.avatar_url || 'https://via.placeholder.com/56'}
                  alt="You"
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-blue-500 border-2 border-black flex items-center justify-center">
                <FiPlus className="w-3 h-3 text-white" />
              </span>
            </div>
            <span className="text-[11px] text-gray-400 truncate w-full text-center">Your story</span>
          </button>

          {/* Story rings */}
          {others.map((group) => (
            <button
              key={group.author.id}
              onClick={() => openGroup(group)}
              className="flex flex-col items-center gap-1.5 shrink-0 w-16"
              title={group.author.display_name}
            >
              <div className={`w-14 h-14 rounded-full p-[2.5px] ${group.hasUnviewed ? 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600' : 'bg-gray-600'}`}>
                <div className="w-full h-full rounded-full overflow-hidden border-2 border-black">
                  <img
                    src={group.author.avatar_url || 'https://via.placeholder.com/56'}
                    alt={group.author.display_name}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              <span className="text-[11px] text-gray-300 truncate w-full text-center">{group.author.display_name}</span>
            </button>
          ))}
        </div>
      </div>

      {viewer && (
        <StoryViewer
          group={viewer.group}
          initialIndex={viewer.index}
          onClose={() => setViewer(null)}
          onChanged={() => setViewer(null)}
        />
      )}
    </>
  );
}

export default StoryBar;