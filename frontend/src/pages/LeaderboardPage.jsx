import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FiCircle, FiAward } from 'react-icons/fi';
import Avatar from '../components/Avatar';
import Badge from '../components/Badge';
import useAuthStore from '../stores/authStore';
import api from '../api/client';

const fmtNum = (n) => new Intl.NumberFormat('en-US').format(Number(n ?? 0));
const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * $DUYS Leaderboard — podium + list + my rank.
 * Ported from legacy `DUYS/duys/templates/leaderboard/index.html`.
 */
function LeaderboardPage() {
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['economy', 'leaderboard'],
    queryFn: async () => (await api.get('/economy/leaderboard')).data,
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-gray-800/40 animate-pulse" />
        ))}
      </div>
    );
  }

  const top = data?.top || [];
  // Podium: [2nd, 1st, 3rd] like the legacy layout.
  const podPod = top.length >= 3
    ? [top[1], top[0], top[2]]
    : top.slice(0, 3);

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      {/* My rank */}
      <div className="rounded-2xl p-5 bg-gradient-to-br from-amber-500/15 via-blue-600/10 to-transparent border border-amber-400/20 flex items-center justify-between">
        <div>
          <span className="text-xs text-gray-400">Your rank</span>
          <p className="text-4xl font-black text-white mt-1">#{fmtNum(data?.myRank)}</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-gray-400">Balance</span>
          <p className="text-xl font-bold text-amber-300">{fmtNum(data?.myPoints)} <FiCircle className="inline" /></p>
        </div>
      </div>

      {/* Podium */}
      {podPod.length >= 2 && (
        <div className="grid grid-cols-3 gap-2 items-end">
          {podPod.map((u, i) => {
            const place = i === 0 ? 2 : i === 1 ? 1 : 3;
            const medal = MEDALS[place - 1];
            const isFirst = place === 1;
            return (
              <Link
                key={u.id}
                to={`/profile/${u.username}`}
                className={`rounded-2xl p-3 bg-gray-800/40 border border-gray-700/60 text-center transition hover:border-blue-500/50 ${isFirst ? 'row-span-1 -mb-4' : ''}`}
              >
                <div className="text-2xl">{medal}</div>
                <Avatar src={u.avatar_url} name={u.display_name || u.username} size={isFirst ? 56 : 44} className="mx-auto my-2" />
                <strong className="flex items-center justify-center gap-1 text-sm truncate">
                  {u.display_name || u.username}
                  {u.verified_badge && <Badge type={u.verified_badge} />}
                </strong>
                <span className="text-xs text-gray-400 block truncate">@{u.username}</span>
                <span className="text-sm font-bold text-amber-300 inline-block mt-1">{fmtNum(u.points)}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* List */}
      <div className="rounded-2xl bg-gray-800/20 border border-gray-700/50 overflow-hidden">
        <h3 className="px-4 py-3 font-bold border-b border-gray-700/50 flex items-center gap-2">
          <FiAward className="text-amber-400" /> Top {top.length}
        </h3>
        {top.length ? (
          <div className="divide-y divide-gray-700/40">
            {top.map((u, idx) => {
              const isMe = user && u.id === user.id;
              return (
                <Link
                  key={u.id}
                  to={`/profile/${u.username}`}
                  className={`flex items-center gap-3 px-4 py-3 transition ${isMe ? 'bg-blue-600/10' : 'hover:bg-gray-800/40'}`}
                >
                  <span className={`w-8 text-center font-bold ${idx < 3 ? 'text-amber-300 text-lg' : 'text-gray-400'}`}>
                    {idx + 1}
                  </span>
                  <Avatar src={u.avatar_url} name={u.display_name || u.username} size={44} />
                  <div className="flex-1 min-w-0">
                    <strong className="flex items-center gap-1.5 truncate">
                      {u.display_name || u.username}
                      {u.verified_badge && <Badge type={u.verified_badge} />}
                    </strong>
                    <span className="text-xs text-gray-400 block truncate">@{u.username}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-200">
                    <FiCircle className="inline text-amber-400 mr-1" />{fmtNum(u.points)}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="py-10 text-center text-gray-500">
            <FiCircle className="mx-auto mb-2 text-4xl text-gray-600" />
            <h3 className="font-bold">No rankings yet</h3>
          </div>
        )}
      </div>
    </div>
  );
}

export default LeaderboardPage;