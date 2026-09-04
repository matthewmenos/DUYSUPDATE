import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { getErrorMessage } from '../utils/errors';
import toast from 'react-hot-toast';

/**
 * UserCard — displays a user with avatar, name, follower count and a
 * follow / unfollow button. Used in Explore search results and suggestions.
 */
function UserCard({ user: initialUser, onFollowChange }) {
  const [user, setUser] = useState(initialUser);
  const [busy, setBusy] = useState(false);

  const follow = async () => {
    setBusy(true);
    try {
      if (user.isFollowing) {
        await api.delete(`/users/${user.id}/follow`);
        setUser((u) => ({ ...u, isFollowing: false, followers: (u.followers || 0) - 1 }));
      } else {
        await api.post(`/users/${user.id}/follow`);
        setUser((u) => ({ ...u, isFollowing: true, followers: (u.followers || 0) + 1 }));
      }
      onFollowChange?.(user.id, !user.isFollowing);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update follow'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-900/50 transition">
      <Link to={`/profile/${user.username}`} className="shrink-0">
        <img
          src={user.avatar_url || 'https://via.placeholder.com/48'}
          alt={user.display_name}
          className="w-11 h-11 rounded-full object-cover"
        />
      </Link>
      <Link to={`/profile/${user.username}`} className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-semibold text-sm truncate">{user.display_name}</span>
          {user.verified_badge === 'blue' && <span className="text-blue-400 text-xs">✓</span>}
          {user.verified_badge === 'gold' && <span className="text-yellow-500 text-xs">✓</span>}
        </div>
        <p className="text-xs text-gray-500 truncate">@{user.username} · {user.followers ?? 0} followers</p>
      </Link>
      <button
        onClick={follow}
        disabled={busy}
        className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition disabled:opacity-50 ${
          user.isFollowing
            ? 'border border-gray-600 text-gray-300 hover:border-red-500 hover:text-red-400'
            : 'bg-white text-black hover:bg-gray-200'
        }`}
      >
        {busy ? '...' : user.isFollowing ? 'Following' : 'Follow'}
      </button>
    </div>
  );
}

export default UserCard;