import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { FiSearch, FiUsers, FiHash, FiUserCheck, FiRadio, FiTrendingUp, FiArrowLeft, FiChevronRight } from 'react-icons/fi';
import api from '../api/client';
import UserCard from '../components/UserCard';
import Post from '../components/Post';

/**
 * ExplorePage — search overlay parity with the legacy DUYS app:
 *  - Autocomplete dropdown (hashtags + users) while typing
 *  - Trending 🔥 hashtags (top by post_count)
 *  - Top Verified users (blue/gold/grey badges)
 *  - "Live now" — followed users currently hosting a room
 *  - Suggested-for-you follow recommendations
 *  - `?tag=xyz` browses the full feed for that hashtag
 */
function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const tag = searchParams.get('tag');

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [focused, setFocused] = useState(false);
  const timerRef = useRef(null);
  const searchRef = useRef(null);

  // Debounce the search query so autocomplete calls stay snappy.
  useEffect(() => {
    timerRef.current = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  const searching = debounced.length >= 1;

  // Close the autocomplete dropdown on outside click.
  useEffect(() => {
    const onClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setFocused(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Autocomplete: hashtags (prefix match) + top users.
  const { data: autoData } = useQuery({
    queryKey: ['explore', 'autocomplete', debounced],
    queryFn: async () => {
      const [tagsRes, usersRes] = await Promise.all([
        api.get('/feed/hashtags', { params: { q: debounced, limit: 5 } }),
        api.get('/users/search', { params: { q: debounced } })
      ]);
      return { hashtags: tagsRes.data.hashtags || [], users: usersRes.data || [] };
    },
    enabled: searching
  });

  // Full user search results (shown below the autocomplete).
  const { data: results = [], isFetching } = useQuery({
    queryKey: ['users', 'search', 'q', debounced.length >= 2 ? debounced : ''],
    queryFn: async () => (await api.get('/users/search', { params: { q: debounced } })).data,
    enabled: debounced.length >= 2 && !tag
  });

  // Suggested users (idle state).
  const { data: suggestions = [] } = useQuery({
    queryKey: ['users', 'suggestions'],
    queryFn: async () => (await api.get('/users/suggestions')).data,
    enabled: !searching && !tag
  });

  // Trending hashtags.
  const { data: trending = [] } = useQuery({
    queryKey: ['feed', 'hashtags'],
    queryFn: async () => (await api.get('/feed/hashtags', { params: { limit: 10 } })).data.hashtags,
    enabled: !searching && !tag
  });

  // Top verified users.
  const { data: verified = [] } = useQuery({
    queryKey: ['feed', 'top-verified'],
    queryFn: async () => (await api.get('/feed/top-verified', { params: { limit: 8 } })).data.users,
    enabled: !searching && !tag
  });

  // Followed users who are live right now.
  const { data: live = [] } = useQuery({
    queryKey: ['feed', 'live-users'],
    queryFn: async () => (await api.get('/feed/live-users', { params: { limit: 8 } })).data.live,
    enabled: !searching && !tag
  });

  // Hashtag posts feed.
  const { data: tagPosts = [], isLoading: tagLoading } = useQuery({
    queryKey: ['feed', 'hashtag', tag],
    queryFn: async () => (await api.get(`/feed/hashtag/${encodeURIComponent(tag)}`)).data.posts,
    enabled: !!tag
  });

  const selectTag = (t) => {
    setSearchParams({ tag: t });
    setQuery('');
    setFocused(false);
  };
  const clearTag = () => setSearchParams({});

  const badgeClass = (b) =>
    b === 'blue' ? 'text-blue-400' : b === 'gold' ? 'text-yellow-500' : 'text-gray-400';

  const goProfile = (username) => {
    setQuery('');
    setFocused(false);
    navigate(`/profile/${username}`);
  };

  return (
    <div className="max-w-2xl mx-auto border-l border-r border-gray-700 min-h-full">
      {/* Header */}
      <div className="sticky top-0 bg-black/80 backdrop-blur border-b border-gray-700 p-4 z-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold">{tag ? `#${tag}` : 'Explore'}</h2>
          {tag && (
            <button
              onClick={clearTag}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-gray-900 text-sm text-gray-300 hover:text-white border border-gray-700"
            >
              <FiArrowLeft className="w-4 h-4" /> Back
            </button>
          )}
        </div>

        {/* Search + autocomplete */}
        <div ref={searchRef} className="relative">
          <div className="flex items-center bg-gray-900 rounded-full px-4 py-2.5 border border-transparent focus-within:border-gray-700 transition">
            <FiSearch className="text-gray-500 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              type="text"
              placeholder="Search users or #hashtags..."
              className="ml-2 flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none text-sm"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-gray-500 hover:text-white text-sm">✕</button>
            )}
          </div>

          {/* Autocomplete dropdown */}
          {searching && focused && autoData && (
            <div className="absolute left-0 right-0 mt-2 rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl overflow-hidden z-20">
              {autoData.hashtags.length > 0 && (
                <div>
                  <div className="px-4 pt-3 pb-1 text-xs text-gray-500 uppercase tracking-wider">Hashtags</div>
                  {autoData.hashtags.map((h) => (
                    <button
                      key={h.tag}
                      onClick={() => { selectTag(h.tag); }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-gray-800 text-left transition"
                    >
                      <FiHash className="w-4 h-4 text-gray-500" />
                      <span className="font-semibold text-sm text-blue-400">#{h.tag}</span>
                      <span className="ml-auto text-xs text-gray-500">{h.post_count} posts</span>
                    </button>
                  ))}
                </div>
              )}
              {autoData.users.length > 0 && (
                <div className="border-t border-gray-800">
                  <div className="px-4 pt-3 pb-1 text-xs text-gray-500 uppercase tracking-wider">People</div>
                  {autoData.users.slice(0, 4).map((u) => (
                    <button
                      key={u.id}
                      onClick={() => goProfile(u.username)}
                      className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-gray-800 text-left transition"
                    >
                      <img src={u.avatar_url || '/avatar-default.svg'} alt={u.display_name} className="w-9 h-9 rounded-full object-cover" />
                      <span className="min-w-0">
                        <span className="block font-semibold text-sm truncate">{u.display_name}</span>
                        <span className="block text-xs text-gray-500 truncate">@{u.username}</span>
                      </span>
                      {u.verified_badge && <span className={`ml-auto text-xs font-bold ${badgeClass(u.verified_badge)}`}>✓</span>}
                    </button>
                  ))}
                </div>
              )}
              {autoData.hashtags.length === 0 && autoData.users.length === 0 && (
                <div className="px-4 py-4 text-sm text-gray-500">No results for "{debounced}"</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─ Hashtag browse view */}
      {tag ? (
        <div>
          {tagLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
            </div>
          ) : tagPosts.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <FiHash className="w-10 h-10 mx-auto mb-3 text-gray-700" />
              <p>No posts tagged #{tag} yet.</p>
            </div>
          ) : (
            tagPosts.map((post) => <Post key={post.id} post={post} />)
          )}
        </div>
      ) : searching ? (
        <div>
          <div className="px-4 py-2 text-xs text-gray-500 uppercase tracking-wider">
            {isFetching ? 'Searching...' : `${results.length} result${results.length === 1 ? '' : 's'}`}
          </div>
          {results.length === 0 && !isFetching ? (
            <div className="text-center py-12 text-gray-500">
              <FiUsers className="w-10 h-10 mx-auto mb-3 text-gray-700" />
              <p>No users found for "{debounced}"</p>
            </div>
          ) : (
            results.map((user) => <UserCard key={user.id} user={user} />)
          )}
        </div>
      ) : (
        <div>
          {/* Trending 🔥 */}
          {trending.length > 0 && (
            <section className="border-b border-gray-700">
              <div className="px-4 py-3 flex items-center gap-2 text-sm font-semibold text-gray-300">
                <FiTrendingUp className="w-4 h-4 text-blue-400" />
                <span>Trending</span>
                <span>🔥</span>
              </div>
              {trending.map((h, idx) => (
                <button
                  key={h.tag}
                  onClick={() => selectTag(h.tag)}
                  className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-gray-900/60 text-left transition"
                >
                  <span className="w-6 text-right text-gray-600 text-sm">{idx + 1}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-sm text-blue-400">#{h.tag}</span>
                    <span className="block text-xs text-gray-500">{h.post_count} posts</span>
                  </span>
                  <FiChevronRight className="w-4 h-4 text-gray-600" />
                </button>
              ))}
            </section>
          )}

          {/* Top Verified */}
          {verified.length > 0 && (
            <section className="border-b border-gray-700">
              <div className="px-4 py-3 flex items-center gap-2 text-sm font-semibold text-gray-300">
                <FiUserCheck className="w-4 h-4 text-blue-400" />
                <span>Top Verified</span>
              </div>
              {verified.slice(0, 4).map((user) => <UserCard key={user.id} user={user} />)}
            </section>
          )}

          {/* Live now */}
          {live.length > 0 && (
            <section className="border-b border-gray-700">
              <div className="px-4 py-3 flex items-center gap-2 text-sm font-semibold text-gray-300">
                <FiRadio className="w-4 h-4 text-red-500" />
                <span>Live now</span>
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              </div>
              <Link to="/live" className="block">
                {live.map((h) => (
                  <div key={h.room_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-900/60 transition">
                    <div className="relative shrink-0">
                      <img src={h.avatar_url || '/avatar-default.svg'} alt={h.display_name} className="w-11 h-11 rounded-full object-cover" />
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border-2 border-gray-900"></span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-sm truncate">{h.display_name}</span>
                        {h.verified_badge && <span className={`${badgeClass(h.verified_badge)} text-xs`}>✓</span>}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{h.room_title || `${h.username}'s room`}</p>
                    </div>
                    <span className="shrink-0 flex items-center gap-1 text-xs text-red-400 font-semibold">
                      <FiRadio className="w-3 h-3" />
                      {h.current_viewers}
                    </span>
                  </div>
                ))}
              </Link>
            </section>
          )}

          {/* Suggested */}
          <section>
            <div className="px-4 py-3 flex items-center gap-2 text-sm font-semibold text-gray-300">
              <FiUsers className="w-4 h-4 text-blue-400" />
              <span>Suggested for you</span>
            </div>
            {suggestions.length === 0 ? (
              <div className="text-center py-10 text-gray-500">
                <FiUsers className="w-10 h-10 mx-auto mb-3 text-gray-700" />
                <p>No suggestions yet. Invite your friends!</p>
              </div>
            ) : (
              suggestions.map((user) => <UserCard key={user.id} user={user} />)
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default ExplorePage;
