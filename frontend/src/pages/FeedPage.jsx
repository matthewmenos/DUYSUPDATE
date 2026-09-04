import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Post from '../components/Post';
import StoryBar from '../components/StoryBar';
import CreateMenu from '../components/CreateMenu';
import CreatePostModal from '../components/CreatePostModal';
import { FiSearch, FiEdit3 } from 'react-icons/fi';

function FeedPage() {
  const [scope, setScope] = useState('for_you');
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();
  const loaderRef = useRef(null);

  const { data, isLoading, isFetching, fetchNextPage, hasNextPage } = useInfiniteQuery({
    initialPageParam: undefined,
    queryKey: ['feed', scope],
    queryFn: async ({ pageParam }) => {
      const response = await api.get(`/feed/${scope === 'channels' ? 'channel' : scope}`, {
        params: pageParam ? { beforeId: pageParam } : {}
      });
      return response.data.posts;
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length === 0) return undefined;
      return lastPage[lastPage.length - 1].id;
    }
  });

  // Flatten pages for infinite scroll
  const posts = data?.pages ? data.pages.flat() : (data ?? []);

  // Filter posts by search query
  const filteredPosts = search.trim()
    ? posts.filter((p) =>
        (p.body || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.display_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.username || '').toLowerCase().includes(search.toLowerCase())
      )
    : posts;

  // Infinite scroll via IntersectionObserver
  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetching) fetchNextPage();
  }, [hasNextPage, isFetching, fetchNextPage]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) handleLoadMore(); },
      { threshold: 0.1 }
    );
    const el = loaderRef.current;
    if (el) observer.observe(el);
    return () => { if (el) observer.unobserve(el); };
  }, [handleLoadMore]);

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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search posts..."
            className="ml-2 flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-500 hover:text-white text-sm">✕</button>
          )}
        </div>
      </div>

      {/* Posts */}
      <div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>{search ? `No posts matching "${search}"` : 'No posts yet. Follow some users to see their posts!'}</p>
          </div>
        ) : (
          <>
            {filteredPosts.map((post) => (
              <Post key={post.id} post={post} />
            ))}
            {/* Infinite scroll loader */}
            <div ref={loaderRef} className="py-4 text-center">
              {isFetching && <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400 mx-auto"></div>}
              {!hasNextPage && filteredPosts.length > 0 && <p className="text-gray-600 text-sm">You've reached the end</p>}
            </div>
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
