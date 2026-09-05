import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import {
  FiArrowDownLeft,
  FiArrowUpRight,
  FiRepeat,
  FiRefreshCw,
  FiCopy,
  FiCheck,
  FiX,
  FiDollarSign,
  FiZap,
  FiWifi,
  FiWifiOff,
} from 'react-icons/fi';
import { useAccount, useDisconnect } from 'wagmi';
import { useWeb3Modal } from '@web3modal/wagmi/react';
import VaultSwapModal from '../components/VaultSwapModal';
import api from '../api/client';

const fmtUsd = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n ?? 0));
const fmtDuys = (n) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(Number(n ?? 0));
const fmtNum = (n, digits = 2) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: digits }).format(Number(n ?? 0));

const shortAddr = (addr) =>
  addr && addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr || '';

const TX_META = {
  deposit: { icon: FiArrowDownLeft, label: 'Deposit', tone: 'text-emerald-400 bg-emerald-500/10' },
  withdrawal: { icon: FiArrowUpRight, label: 'Withdrawal', tone: 'text-rose-400 bg-rose-500/10' },
  purchase: { icon: FiRepeat, label: 'Swap', tone: 'text-blue-400 bg-blue-500/10' },
  reward: { icon: FiZap, label: 'Reward', tone: 'text-violet-400 bg-violet-500/10' },
  default: { icon: FiRepeat, label: 'Transaction', tone: 'text-blue-400 bg-blue-500/10' },
};

function WalletPage() {
  const queryClient = useQueryClient();
  const [activeModal, setActiveModal] = useState(null); // 'deposit' | 'withdraw' | 'swap'
  const [showVault, setShowVault] = useState(false);
  const [modalForm, setModalForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const { address: wagmiAddress, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { open } = useWeb3Modal();

  const { data: balance, isLoading: loadingBal } = useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn: async () => (await api.get('/wallet/balance')).data,
    refetchInterval: 20000,
  });

  const { data: txs = [], isLoading: loadingTx } = useQuery({
    queryKey: ['wallet', 'transactions'],
    queryFn: async () => {
      const res = await api.get('/wallet/transactions', { params: { limit: 30 } });
      return res.data.transactions || [];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['wallet'] });

  // Sync the wagmi-connected wallet with the backend.
  useEffect(() => {
    if (isConnected && wagmiAddress) {
      api
        .post('/wallet/connect', { walletAddress: wagmiAddress, blockchain: 'bsc' })
        .then(() => {
          toast.success('Wallet connected');
          refresh();
        })
        .catch((err) => toast.error(err.response?.data?.error || 'Failed to connect wallet'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, wagmiAddress]);

  const handleDisconnect = () => {
    disconnect();
    toast('Wallet disconnected');
  };

  const copyAddress = () => {
    const addr = balance?.walletAddress || wagmiAddress;
    if (!addr) return;
    navigator.clipboard?.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDeposit = async (e) => {
    e.preventDefault();
    const amountUsd = Number(modalForm.amountUsd);
    if (!amountUsd || amountUsd <= 0) return toast.error('Enter a valid amount');
    setBusy(true);
    try {
      const res = await api.post('/wallet/deposit', { amountUsd, paymentMethod: 'crypto' });
      await api.post('/wallet/deposit/confirm', { transactionId: res.data.transactionId });
      toast.success('Deposit confirmed');
      setActiveModal(null);
      setModalForm({});
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Deposit failed');
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    const amount = Number(modalForm.amount);
    const addr = modalForm.walletAddress;
    if (!amount || amount <= 0) return toast.error('Enter a valid amount');
    if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) return toast.error('Invalid BSC address (0x…)');
    setBusy(true);
    try {
      await api.post('/wallet/withdraw', { amount, walletAddress: addr });
      toast.success('Withdrawal submitted for processing');
      setActiveModal(null);
      setModalForm({});
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Withdrawal failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSwap = async (e) => {
    e.preventDefault();
    const amount = Number(modalForm.amount);
    const from = modalForm.fromAsset;
    const to = modalForm.toAsset;
    if (!amount || amount <= 0) return toast.error('Enter a valid amount');
    if (!from || !to || from === to) return toast.error('Pick two different assets');
    setBusy(true);
    try {
      await api.post('/wallet/swap', { fromAsset: from, toAsset: to, amount });
      toast.success('Swap completed');
      setActiveModal(null);
      setModalForm({});
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Swap failed');
    } finally {
      setBusy(false);
    }
  };

  const duysPrice = Number(balance?.duysPriceUsd ?? 0.05);
  const totalUsd = Number(balance?.usd ?? 0) + Number(balance?.duys ?? 0) * duysPrice;
  const connectedAddr = balance?.walletAddress || wagmiAddress || null;
  const linkAddr = (walletAddress) => `https://bscscan.com/address/${walletAddress}`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 md:px-8 md:py-7">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold md:text-3xl">Wallet</h2>
          <p className="mt-0.5 text-sm text-gray-400">Manage your DUYS balance and tokens</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-300">
            <span className="text-blue-400">1 DUYS</span> ≈ {fmtUsd(duysPrice)}
          </span>
          <button
            onClick={refresh}
            className="rounded-full p-2 text-gray-400 transition hover:bg-gray-900 hover:text-white"
            aria-label="Refresh"
          >
            <FiRefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Hero balance card */}
      <div className="relative overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-600/30 via-blue-900/20 to-black p-6 shadow-xl shadow-blue-900/20">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-sky-400/10 blur-3xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-gray-300">Total balance</p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight md:text-4xl">
              {loadingBal ? '…' : fmtUsd(totalUsd)}
            </p>
          </div>
          {connectedAddr ? (
            <div className="flex items-center gap-2">
              <a
                href={linkAddr(connectedAddr)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300 transition hover:bg-blue-500/20"
              >
                <FiWifi className="h-3.5 w-3.5" />
                {shortAddr(connectedAddr)}
              </a>
              <button
                onClick={copyAddress}
                className="rounded-full border border-blue-400/30 bg-blue-500/10 p-2 text-blue-300 transition hover:bg-blue-500/20"
                aria-label="Copy address"
              >
                {copied ? <FiCheck className="h-3.5 w-3.5" /> : <FiCopy className="h-3.5 w-3.5" />}
              </button>
            </div>
          ) : (
            <button
              onClick={open}
              className="flex items-center gap-1.5 rounded-full border border-gray-500/40 bg-black/30 px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:border-blue-400/60"
            >
              <FiWifiOff className="h-3.5 w-3.5" />
              Connect wallet
            </button>
          )}
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-3">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-sky-400 text-sm font-extrabold text-white shadow-lg shadow-blue-500/30">
              D
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-400">DUYS</p>
              <p className="truncate text-lg font-bold">{loadingBal ? '…' : fmtDuys(balance?.duys)} DUYS</p>
              <p className="text-xs text-gray-300">≈ {fmtUsd(Number(balance?.duys ?? 0) * duysPrice)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <FiDollarSign className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-400">USDT / USD</p>
              <p className="truncate text-lg font-bold">{loadingBal ? '…' : fmtUsd(balance?.usd)}</p>
              <p className="text-xs text-gray-300">Stablecoin</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-5 grid grid-cols-4 gap-3 md:grid-cols-5">
        <ActionButton icon={FiArrowDownLeft} label="Deposit" tone="bg-emerald-500/10 text-emerald-400" onClick={() => setActiveModal('deposit')} />
        <ActionButton icon={FiArrowUpRight} label="Withdraw" tone="bg-rose-500/10 text-rose-400" onClick={() => setActiveModal('withdraw')} />
        <ActionButton icon={FiRepeat} label="Swap" tone="bg-blue-500/10 text-blue-400" onClick={() => setActiveModal('swap')} />
        <ActionButton icon={FiRepeat} label="Vault" tone="bg-violet-500/10 text-violet-400" onClick={() => setShowVault(true)} />
        {isConnected || connectedAddr ? (
          <ActionButton icon={FiWifiOff} label="Disconnect" tone="bg-gray-800 text-gray-400" onClick={handleDisconnect} />
        ) : (
          <ActionButton icon={FiWifi} label="Connect" tone="bg-blue-500/10 text-blue-400" onClick={open} />
        )}
      </div>

      {/* Assets */}
      <section className="mt-7">
        <h3 className="mb-3 px-1 text-sm font-semibold uppercase tracking-wider text-gray-400">Assets</h3>
        <div className="overflow-hidden rounded-2xl border border-gray-700 bg-gray-900/60">
          <AssetRow
            icon={
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-sky-400 text-sm font-extrabold text-white shadow-sm shadow-blue-500/30">
                D
              </div>
            }
            name="DUYS"
            sub={`DUYS token · ≈ ${fmtUsd(duysPrice)}`}
            amount={loadingBal ? '…' : `${fmtDuys(balance?.duys)} DUYS`}
            value={loadingBal ? '…' : fmtUsd(Number(balance?.duys ?? 0) * duysPrice)}
          />
          <div className="h-px bg-gray-700/70" />
          <AssetRow
            icon={
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <FiDollarSign className="h-5 w-5" />
              </div>
            }
            name="USDT / USD"
            sub="Stablecoin · 1:1 USD"
            amount={loadingBal ? '…' : fmtUsd(balance?.usd)}
            value={loadingBal ? '…' : fmtUsd(balance?.usd)}
          />
        </div>
      </section>

      {/* Activity */}
      <section className="mt-7 mb-10">
        <h3 className="mb-3 px-1 text-sm font-semibold uppercase tracking-wider text-gray-400">Activity</h3>
        {loadingTx ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-gray-800/70" />
            ))}
          </div>
        ) : txs.length === 0 ? (
          <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-10 text-center">
            <FiRepeat className="mx-auto h-8 w-8 text-gray-600" />
            <p className="mt-3 text-sm font-medium text-gray-300">No activity yet</p>
            <p className="mt-1 text-xs text-gray-500">Deposit funds or swap DUYS to get started.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-700 bg-gray-900/60">
            {txs.map((t) => {
              const meta = TX_META[t.kind] || TX_META.default;
              const Icon = meta.icon;
              const positive = t.kind === 'deposit';
              const sign = positive ? '+' : '';
              return (
                <div key={t.id} className="flex items-center gap-3 border-b border-gray-700/60 px-4 py-3.5 last:border-0">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${meta.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{meta.label}</p>
                    <p className="truncate text-xs text-gray-400">{t.description || 'Transaction'}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-bold ${positive ? 'text-emerald-400' : 'text-gray-100'}`}>
                      {sign}
                      {fmtNum(Number(t.amount))}
                    </p>
                    <p className="text-xs text-gray-400">
                      {t.created_at ? formatDistanceToNow(new Date(t.created_at), { addSuffix: true }) : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modals */}
      {activeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setActiveModal(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-gray-700 bg-gray-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-lg font-bold">
                {activeModal === 'deposit' && 'Deposit'}
                {activeModal === 'withdraw' && 'Withdraw'}
                {activeModal === 'swap' && 'Swap assets'}
              </h4>
              <button
                onClick={() => setActiveModal(null)}
                className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-800 hover:text-white"
                aria-label="Close"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            {activeModal === 'deposit' && (
              <form onSubmit={handleDeposit} className="space-y-3">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  autoFocus
                  value={modalForm.amountUsd || ''}
                  onChange={(e) => setModalForm({ ...modalForm, amountUsd: e.target.value })}
                  placeholder="Amount (USD)"
                  className="w-full rounded-xl bg-black px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500">Funds are credited instantly as USDT-equivalent.</p>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                >
                  {busy ? 'Processing…' : 'Deposit'}
                </button>
              </form>
            )}

            {activeModal === 'withdraw' && (
              <form onSubmit={handleWithdraw} className="space-y-3">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  autoFocus
                  value={modalForm.amount || ''}
                  onChange={(e) => setModalForm({ ...modalForm, amount: e.target.value })}
                  placeholder="Amount (USD)"
                  className="w-full rounded-xl bg-black px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  value={modalForm.walletAddress || ''}
                  onChange={(e) => setModalForm({ ...modalForm, walletAddress: e.target.value })}
                  placeholder="BSC address (0x…)"
                  className="w-full rounded-xl bg-black px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500">Withdrawals are queued for review before processing.</p>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                >
                  {busy ? 'Submitting…' : 'Withdraw'}
                </button>
              </form>
            )}

            {activeModal === 'swap' && (
              <form onSubmit={handleSwap} className="space-y-3">
                <div className="flex gap-2">
                  <select
                    value={modalForm.fromAsset || 'USDT'}
                    onChange={(e) => setModalForm({ ...modalForm, fromAsset: e.target.value })}
                    className="w-1/2 rounded-xl bg-black px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option>USDT</option>
                    <option>DUYS</option>
                  </select>
                  <select
                    value={modalForm.toAsset || 'DUYS'}
                    onChange={(e) => setModalForm({ ...modalForm, toAsset: e.target.value })}
                    className="w-1/2 rounded-xl bg-black px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option>DUYS</option>
                    <option>USDT</option>
                  </select>
                </div>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={modalForm.amount || ''}
                  onChange={(e) => setModalForm({ ...modalForm, amount: e.target.value })}
                  placeholder="Amount"
                  className="w-full rounded-xl bg-black px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500">Price feed: 1 DUYS ≈ {fmtUsd(duysPrice)}</p>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                >
                  {busy ? 'Swapping…' : 'Swap'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Vault swap modal */}
      {showVault && <VaultSwapModal onClose={() => setShowVault(false)} />}
    </div>
  );
}

/* ---- Small presentational pieces ---- */

function ActionButton({ icon: Icon, label, tone, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-2xl border border-gray-700 bg-gray-900/60 px-2 py-4 transition hover:border-blue-500/50 hover:bg-gray-800 active:scale-95"
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-xs font-medium text-gray-300">{label}</span>
    </button>
  );
}

function AssetRow({ icon, name, sub, amount, value }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-xs text-gray-400">{sub}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold">{amount}</p>
        <p className="text-xs text-gray-400">{value}</p>
      </div>
    </div>
  );
}

export default WalletPage;
