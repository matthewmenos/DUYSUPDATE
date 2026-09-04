import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Post from '../components/Post';
import StoryBar from '../components/StoryBar';
import CreateMenu from '../components/CreateMenu';
import CreatePostModal from '../components/CreatePostModal';
import { FiSearch, FiEdit3 } from 'react-icons/fi';

function FeedPage() {
  const [scope, setScope] = useState('for_you');
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();

  // React Query v5: no onSuccess option — derive posts directly from data.
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['feed', scope],
    queryFn: async () => {
      const response = await api.get(`/feed/${scope === 'channels' ? 'channel' : scope}`);
      return response.data.posts;
    }
  });
  const posts = data ?? [];

  const handleLoadMore = async () => {
    if (posts.length === 0) return;
    const lastPost = posts[posts.length - 1];
    try {
      const response = await api.get(`/feed/${scope === 'channels' ? 'channel' : scope}`, {
        params: { beforeId: lastPost.id }
      });
      const more = response.data.posts ?? [];
      if (more.length > 0) {
        // Append the next page into the query cache so `posts` stays in sync
        queryClient.setQueryData(['feed', scope], [...posts, ...more]);
      }
    } catch (error) {
      console.error('Failed to load more posts');
    }
  };

  return (
    <div className="max-w-2xl mx-auto border-l border-r border-gray-700">
      {/* Story rings — top of feed, scrolls away under the sticky header */}
      <StoryBar />

      {/* Header */}
      <div className="sticky top-0 bg-black/80 backdrop-blur border-b border-gray-700 p-4 z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">{scope === 'for_you' ? 'For You' : 'Following'}</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-600 to-blue-400 text-sm font-semibold hover:opacity-90 transition"
          >
            <FiEdit3 className="w-4 h-4" /> New Post
          </button>
        </div>

        {/* Scope Tabs */}
        <div className="flex space-x-4">
          {['for_you', 'following'].map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`pb-4 px-2 font-semibold border-b-2 transition ${
                scope === s
                  ? 'border-blue-400 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {s === 'for_you' ? 'For You' : 'Following'}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mt-4 flex items-center bg-gray-900 rounded-full px-4 py-2">
          <FiSearch className="text-gray-500" />
          <input
            type="text"
            placeholder="Search posts..."
            className="ml-2 flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Posts */}
      <div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No posts yet. Follow some users to see their posts!</p>
          </div>
        ) : (
          <>
            {posts.map((post) => (
              <Post key={post.id} post={post} />
            ))}
            <button
              onClick={handleLoadMore}
              disabled={isFetching}
              className="w-full py-4 text-blue-400 hover:bg-gray-900/50 transition disabled:opacity-50"
            >
              {isFetching ? 'Loading...' : 'Load More'}
            </button>
          </>
        )}
      </div>

      {/* Mobile create FAB + menu */}
      <CreateMenu />

      {showCreate && (
        <CreatePostModal onClose={() => setShowCreate(false)} onCreated={() => queryClient.invalidateQueries({ queryKey: ['feed'] })} />
      )}
    </div>
  );
}

export default FeedPage;
