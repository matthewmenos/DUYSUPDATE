import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FiSearch, FiZap, FiUser } from 'react-icons/fi';
import api from '../api/client';

/**
 * RightRail — the X/Twitter-style right "Discover" column (parity with the
 * legacy DUYS search-overlay rail: `--rail-w: 320px`).
 *
 * Visible on wide (xl+) screens only. Shows:
 *   - a search pill → /explore
 *   - "Trending"  → top hashtags by post_count (GET /feed/hashtags)
 *   - "Verified"  → top verified creators by followers (GET /feed/top-verified)
 *
 * Data shapes come straight from the backend feed service:
 *   /feed/hashtags      → { hashtags: [{ tag, post_count }] }
 *   /feed/top-verified  → { users: [{ id, username, display_name, avatar_url, verified_badge, followers }] }
 */
function RightRail() {
  const { data: trending = [], isLoading: trendsLoading } = useQuery({
    queryKey: ['feed', 'hashtags', 'rail'],
    queryFn: async () => (await api.get('/feed/hashtags', { params: { limit: 5 } })).data.hashtags,
    refetchInterval: 5 * 60 * 1000
  });

  const { data: verified = [], isLoading: verifiedLoading } = useQuery({
    queryKey: ['feed', 'top-verified', 'rail'],
    queryFn: async () => (await api.get('/feed/top-verified', { params: { limit: 4 } })).data.users,
    refetchInterval: 5 * 60 * 1000
  });

  const loaders = Array.from({ length: 3 }, (_, i) => (
    <div key={i} className="h-9 mx-4 my-1 rounded-lg bg-gray-800 animate-pulse" />
  ));

  const badgeClass = (b) =>
    b === 'blue' ? 'text-blue-400' : b === 'gold' ? 'text-yellow-500' : 'text-gray-400';

  return (
    <aside className="hidden xl:flex w-80 max-w-[320px] shrink-0 flex-col p-3 gap-4 overflow-y-auto border-l border-gray-700">
      <div className="sticky top-0 space-y-4">
        {/* Search pill */}
        <Link
          to="/explore"
          className="flex items-center gap-2.5 rounded-full bg-gray-900 px-4 py-2.5 text-sm text-gray-400 hover:text-white transition"
        >
          <FiSearch className="w-4 h-4 shrink-0" />
          Search people, posts &amp; hashtags
        </Link>

        {/* Trending */}
        <section className="rounded-2xl border border-gray-700 bg-gray-900 overflow-hidden">
          <header className="flex items-center gap-2 px-4 py-3 border-b border-gray-700 text-sm font-extrabold">
            <FiZap className="w-4 h-4 text-red-500" />
            <span>Trending</span>
          </header>
          {!trendsLoading && trending.length === 0 ? (
            <p className="px-4 py-4 text-sm text-gray-500">Nothing trending yet.</p>
          ) : trendsLoading ? (
            loaders
          ) : (
            trending.map((t, i) => (
              <Link
                key={t.tag}
                to={`/explore?tag=${encodeURIComponent(t.tag)}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition border-b border-gray-800"
              >
                <span className="w-6 text-center text-xs font-extrabold text-gray-500">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-sm truncate">#{t.tag}</span>
                  <span className="block text-xs text-gray-500">{t.post_count} posts</span>
                </span>
              </Link>
            ))
          )}
        </section>

        {/* Verified */}
        <section className="rounded-2xl border border-gray-700 bg-gray-900 overflow-hidden">
          <header className="flex items-center gap-2 px-4 py-3 border-b border-gray-700 text-sm font-extrabold">
            <FiUser className="w-4 h-4 text-blue-400" />
            <span>Verified</span>
          </header>
          {!verifiedLoading && verified.length === 0 ? (
            <p className="px-4 py-4 text-sm text-gray-500">No verified creators yet.</p>
          ) : verifiedLoading ? (
            loaders
          ) : (
            verified.map((u) => (
              <Link
                key={u.id}
                to={`/profile/${u.username}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition border-b border-gray-800"
              >
                <img
                  src={u.avatar_url || '/avatar-default.svg'}
                  alt={u.display_name}
                  className="w-9 h-9 rounded-full object-cover shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 font-semibold text-sm truncate">
                    {u.display_name}
                    {u.verified_badge && <span className={`${badgeClass(u.verified_badge)} text-xs`}>✓</span>}
                  </span>
                  <span className="block text-xs text-gray-500 truncate">
                    @{u.username} · {u.followers ?? 0} followers
                  </span>
                </span>
              </Link>
            ))
          )}
        </section>
      </div>
    </aside>
  );
}

export default RightRail;