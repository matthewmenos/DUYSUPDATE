import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FiCopy, FiCheck, FiCircle, FiUsers } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import Avatar from '../components/Avatar';
import Badge from '../components/Badge';
import api from '../api/client';

const fmtNum = (n) => new Intl.NumberFormat('en-US').format(Number(n ?? 0));

/**
 * Referrals — invite friends, earn $DUYS.
 * Ported from legacy `DUYS/duys/templates/referral/index.html`.
 */
function ReferralPage() {
  const [copied, setCopied] = useState(false);

  const { data: info, isLoading } = useQuery({
    queryKey: ['economy', 'referral'],
    queryFn: async () => (await api.get('/economy/referral')).data,
  });

  const handleCopy = async () => {
    if (!info?.link) return;
    try {
      await navigator.clipboard.writeText(info.link);
      setCopied(true);
      toast.success('Referral link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy your referral link:', info.link);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-36 rounded-2xl bg-gray-800/40 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      {/* Card */}
      <div className="rounded-2xl p-5 bg-gradient-to-br from-blue-600/15 via-transparent to-transparent border border-blue-500/20">
        <h3 className="text-xl font-bold">Invite friends, earn $DUYS</h3>
        <p className="text-sm text-gray-400 mt-1">
          Earn <strong className="text-white">{fmtNum(info?.bonus)}</strong> $DUYS per signup,
          plus <strong className="text-white">{fmtNum(info?.percent)}%</strong> of everything they
          earn — forever.
        </p>

        <label className="text-xs text-gray-400 mt-4 block mb-1">Your referral link</label>
        <div className="flex gap-2">
          <code className="flex-1 px-4 py-2.5 rounded-xl bg-black/40 border border-gray-700 text-blue-300 text-sm font-mono truncate">
            {info?.link}
          </code>
          <button
            onClick={handleCopy}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition flex items-center gap-1.5"
          >
            {copied ? <FiCheck /> : <FiCopy />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Your code is your username: <strong className="text-blue-300">@{info?.code}</strong>
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl p-4 bg-gray-800/30 border border-gray-700/60">
          <FiUsers className="text-blue-400 mb-1" />
          <strong className="text-2xl text-white block">{fmtNum(info?.referrals?.length)}</strong>
          <span className="text-xs text-gray-400">referrals</span>
        </div>
        <div className="rounded-2xl p-4 bg-gray-800/30 border border-gray-700/60">
          <FiCircle className="text-amber-400 mb-1" />
          <strong className="text-2xl text-white block">{fmtNum(info?.totalEarned)}</strong>
          <span className="text-xs text-gray-400">$DUYS earned</span>
        </div>
      </div>

      {/* Referral list */}
      <div className="rounded-2xl bg-gray-800/20 border border-gray-700/50 overflow-hidden">
        <h3 className="px-4 py-3 font-bold border-b border-gray-700/50">Your referrals</h3>
        {info?.referrals?.length ? (
          <div className="divide-y divide-gray-700/40">
            {info.referrals.map((r) => (
              <Link key={r.username} to={`/profile/${r.username}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/40 transition">
                <Avatar src={r.avatar_url} name={r.display_name || r.username} size={44} />
                <div className="flex-1 min-w-0">
                  <strong className="flex items-center gap-1.5 truncate">
                    {r.display_name || r.username}
                    {r.verified_badge && <Badge type={r.verified_badge} />}
                  </strong>
                  <span className="text-xs text-gray-400 truncate block">
                    @{r.username} · joined {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center text-gray-500">
            <FiCircle className="mx-auto mb-2 text-4xl text-gray-600" />
            <h3 className="font-bold text-gray-300">No referrals yet</h3>
            <p className="text-sm">Share your link to start earning.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ReferralPage;