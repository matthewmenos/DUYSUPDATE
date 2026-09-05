import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FiGift, FiCheck, FiClock, FiCircle, FiLink } from 'react-icons/fi';
import api from '../api/client';
import getErrorMessage from '../utils/errors';

const fmtNum = (n) => new Intl.NumberFormat('en-US').format(Number(n ?? 0));

/**
 * Earn / Airdrop — rewarded ads (HypeLab) + points → DUYS claims.
 * Ported from legacy `DUYS/duys/templates/earn/index.html`.
 */
function EarnPage() {
  const queryClient = useQueryClient();
  const [adBusy, setAdBusy] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');

  const { data: info, isLoading } = useQuery({
    queryKey: ['economy', 'earn'],
    queryFn: async () => (await api.get('/economy/earn')).data,
  });

  const claimMutation = useMutation({
    mutationFn: async () => (await api.post('/economy/earn/claim')).data,
    onSuccess: (data) => {
      toast.success(`Claimed ${data.claim?.tokens} DUYS!`);
      queryClient.invalidateQueries(['economy', 'earn']);
      queryClient.invalidateQueries(['wallet', 'balance']);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  /** HypeLab rewarded ad — reward is credited by their S2S webhook. */
  const handleWatchAd = () => {
    if (adBusy) return;
    const h = window.HypeLab;
    if (!h || typeof h.showRewardedAd !== 'function') {
      toast('Ads are powered by HypeLab — reload to enable', { icon: '📺' });
      return;
    }
    setAdBusy(true);
    try {
      h.showRewardedAd({
        onReward: () => toast.success(`+${info?.adReward || 10} $DUYS added!`)
      });
    } finally {
      setAdBusy(false);
    }
  };

  const handleConnectWallet = async () => {
    if (!walletAddress.trim()) {
      toast('Enter your BSC wallet address');
      return;
    }
    try {
      await api.post('/wallet/connect', { walletAddress: walletAddress.trim(), blockchain: 'bsc' });
      toast.success('Wallet linked');
      queryClient.invalidateQueries(['economy', 'earn']);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 rounded-2xl bg-gray-800/40 animate-pulse" />
        ))}
      </div>
    );
  }

  const claimPct = info?.minPoints > 0
    ? Math.min(100, Math.round((info.points / info.minPoints) * 100))
    : 0;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      {/* Hero */}
      <div className="rounded-2xl p-5 bg-gradient-to-br from-blue-600/20 via-blue-800/10 to-transparent border border-blue-500/20 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-blue-500/20 blur-3xl" />
        <span className="text-sm text-gray-400">Your balance</span>
        <p className="text-4xl font-black text-white mt-1">{fmtNum(info?.points)}</p>
        <span className="text-sm text-blue-300 font-semibold">$DUYS Points</span>
        <div className="flex gap-8 mt-4">
          <div>
            <strong className="text-xl text-white">{fmtNum(info?.todayCount)}</strong>
            <div className="text-xs text-gray-400">ads today</div>
          </div>
          <div>
            <strong className="text-xl text-white">{fmtNum(info?.totalEarned)}</strong>
            <div className="text-xs text-gray-400">total earned</div>
          </div>
        </div>
      </div>

      {/* Watch ad */}
      <div className="rounded-2xl p-5 bg-gray-800/30 border border-gray-700/60">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <FiGift className="text-blue-400" /> Watch an ad, earn {info?.adReward ?? 10} $DUYS
        </h3>
        <p className="text-sm text-gray-400 mt-1">Watch a short ad to claim your reward.</p>
        <button
          onClick={handleWatchAd}
          disabled={adBusy}
          className="mt-3 px-5 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold transition disabled:opacity-50"
        >
          🎁 Watch ad &amp; earn
        </button>
      </div>

      {/* Points → DUYS claim */}
      <div className="rounded-2xl p-5 bg-gray-800/30 border border-gray-700/60">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <FiCircle className="text-amber-400" /> Convert Points → Real DUYS
            </h3>
            <p className="text-sm text-gray-400 mt-1">
              {info?.perToken} points = 1 DUYS token on BSC
            </p>
          </div>
          {info?.claimableTokens > 0 && (
            <span className="text-2xl font-extrabold text-amber-300">{fmtNum(info.claimableTokens)}</span>
          )}
        </div>

        {!info?.hasWallet ? (
          <div className="mt-4">
            <p className="text-sm text-gray-400 mb-2">
              <FiLink className="inline mr-1" /> Link your BSC wallet to redeem points as tokens.
            </p>
            <div className="flex gap-2">
              <input
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="0x..."
                className="flex-1 px-4 py-2 rounded-full bg-black/40 border border-gray-700 focus:border-blue-500 outline-none text-sm"
              />
              <button
                onClick={handleConnectWallet}
                className="px-4 py-2 rounded-full bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold transition"
              >
                Link
              </button>
            </div>
          </div>
        ) : info?.claimablePoints < info?.minPoints ? (
          <div className="mt-4">
            <div className="h-2.5 rounded-full bg-gray-700/60 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all"
                style={{ width: `${claimPct}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 mt-1 inline-block">
              {fmtNum(info.points)} / {fmtNum(info.minPoints)} pts to unlock
            </span>
          </div>
        ) : info?.canClaim ? (
          <button
            onClick={() => claimMutation.mutate()}
            disabled={claimMutation.isPending}
            className="mt-4 px-5 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold transition disabled:opacity-50"
          >
            {claimMutation.isPending ? 'Claiming…' : `Claim ${fmtNum(info.claimableTokens)} DUYS now →`}
          </button>
        ) : (
          <p className="mt-3 text-sm text-amber-300 flex items-center gap-1.5">
            <FiClock /> Daily claim already used. Reset at midnight.
          </p>
        )}

        <div className="mt-4 pt-3 border-t border-gray-700/50 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
          <span><FiCheck className="inline text-emerald-400 mr-1" />Today: {fmtNum(info?.todayClaims)} / {fmtNum(info?.maxDaily)}</span>
          {info?.walletAddress && (
            <span className="truncate max-w-[180px]">
              Wallet: <span className="text-gray-300 font-mono">{info.walletAddress.slice(0, 6)}…{info.walletAddress.slice(-4)}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default EarnPage;