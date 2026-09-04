import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FiSearch, FiUsers } from 'react-icons/fi';
import api from '../api/client';
import UserCard from '../components/UserCard';

/**
 * ExplorePage — search for users and discover people to follow.
 *  - Debounced search calls GET /users/search?q=
 *  - Idle state shows follow suggestions from GET /users/suggestions
 */
function ExplorePage() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const timerRef = useRef(null);

  // Debounce the search query by 300ms.
  useEffect(() => {
    timerRef.current = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  const searching = debounced.length >= 2;

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['users', 'search', debounced],
    queryFn: async () => (await api.get('/users/search', { params: { q: debounced } })).data,
    enabled: searching
  });

  const { data: suggestions = [] } = useQuery({
    queryKey: ['users', 'suggestions'],
    queryFn: async () => (await api.get('/users/suggestions')).data,
    enabled: !searching
  });

  return (
    <div className="max-w-2xl mx-auto border-l border-r border-gray-700 min-h-full">
      {/* Header */}
      <div className="sticky top-0 bg-black/80 backdrop-blur border-b border-gray-700 p-4 z-10">
        <h2 className="text-xl font-bold mb-3">Explore</h2>
        <div className="flex items-center bg-gray-900 rounded-full px-4 py-2.5">
          <FiSearch className="text-gray-500 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="text"
            placeholder="Search users by name or @username..."
            className="ml-2 flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none text-sm"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-gray-500 hover:text-white text-sm">✕</button>
          )}
        </div>
      </div>

      {/* Results or suggestions */}
      {searching ? (
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
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-400">Suggested for you</span>
          </div>
          {suggestions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FiUsers className="w-10 h-10 mx-auto mb-3 text-gray-700" />
              <p>No suggestions yet. Invite your friends!</p>
            </div>
          ) : (
            suggestions.map((user) => <UserCard key={user.id} user={user} />)
          )}
        </div>
      )}
    </div>
  );
}

export default ExplorePage;
