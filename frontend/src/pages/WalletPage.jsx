import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FiCheck, FiX, FiRefreshCw, FiArrowDown, FiArrowUp, FiRepeat } from 'react-icons/fi';
import { useAccount, useDisconnect } from 'wagmi';
import { useWeb3Modal } from '@web3modal/wagmi/react';
import { bsc } from 'viem/chains';
import api from '../api/client';

/**
 * WalletPage - connects to the wallet API.
 * Balances, transaction history, connect wallet (MetaMask/WalletConnect via Web3Modal),
 * deposit, withdraw, and swap (USDT↔DUYS).
 */
function WalletPage() {
  const queryClient = useQueryClient();
  const [activeModal, setActiveModal] = useState(null); // 'connect' | 'deposit' | 'withdraw' | 'swap'
  const [modalForm, setModalForm] = useState({});
  const [busy, setBusy] = useState(false);

  // wagmi hooks for connected account state
  const { address: wagmiAddress, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  // Web3Modal control (open() launches the connect UI: MetaMask / WalletConnect)
  const { open } = useWeb3Modal();

  // Balance
  const { data: balance, isLoading: loadingBal } = useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn: async () => (await api.get('/wallet/balance')).data
  });

  // Transactions
  const { data: txData, isLoading: loadingTx } = useQuery({
    queryKey: ['wallet', 'transactions'],
    queryFn: async () => {
      const res = await api.get('/wallet/transactions', { params: { limit: 50 } });
      return res.data.transactions || [];
    }
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['wallet'] });
  };

  // Detect the connected wallet address from wagmi, then register it on the backend
  React.useEffect(() => {
    if (isConnected && wagmiAddress) {
      api.post('/wallet/connect', {
        walletAddress: wagmiAddress,
        blockchain: 'bsc',
        chainId: bsc.id,
      }).then(() => {
        toast.success('Wallet connected');
        refresh();
      }).catch((err) => {
        toast.error(err.response?.data?.error || 'Failed to connect wallet');
      });
    }
  }, [isConnected, wagmiAddress]);

  // Connect wallet via Web3Modal (MetaMask + WalletConnect)
  // Connect wallet via Web3Modal (MetaMask + WalletConnect)
// The w3m-button component handles the connection UI and flow.
// When the user approves, wagmi fires the connection and the useEffect above
//   syncs the address to the backend.

// Disconnect wallet
const handleDisconnect = () => {
  disconnect();
  toast('Wallet disconnected');
};

  const handleDeposit = async (e) => {
    e.preventDefault();
    const amountUsd = Number(modalForm.amountUsd);
    if (!amountUsd || amountUsd <= 0) return toast.error('Enter a valid amount');
    setBusy(true);
    try {
      const res = await api.post('/wallet/deposit', { amountUsd, paymentMethod: 'crypto' });
      // For demonstration, immediately settle the deposit.
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
    if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) return toast.error('Invalid BSC address (0x...)');
    setBusy(true);
    try {
      const res = await api.post('/wallet/withdraw', { amount, walletAddress: addr });
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

  const txStatus = (t) => (t.metadata && t.metadata.status) || 'completed';
  const fmtTime = (iso) => new Date(iso).toLocaleString();

  return (
    <div className="max-w-4xl mx-auto border-l border-r border-gray-700 p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold mb-1">Wallet</h2>
          <p className="text-gray-400">Manage balances, rewards, and wallet activity.</p>
        </div>
        <button onClick={refresh} className="text-gray-400 hover:text-white" aria-label="Refresh">
          <FiRefreshCw />
        </button>
      </div>

      {/* Balances */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <div className="rounded-2xl border border-gray-700 bg-gray-900 p-5">
          <p className="text-sm text-gray-400">USD balance</p>
          <p className="mt-3 text-2xl font-bold">
            {loadingBal ? '…' : `$${(balance?.usd ?? 0).toFixed(2)}`}
          </p>
          <p className="mt-2 text-sm text-gray-500">USDT-equivalent</p>
        </div>
        <div className="rounded-2xl border border-gray-700 bg-gray-900 p-5">
          <p className="text-sm text-gray-400">DUYS tokens</p>
          <p className="mt-3 text-2xl font-bold">
            {loadingBal ? '…' : `${Number(balance?.duys ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} DUYS`}
          </p>
          <p className="mt-2 text-sm text-gray-500">
            {balance ? `1 DUYS ≈ $${(balance.duysPriceUsd || 0.05).toFixed(4)}` : ' '} · BSC network
          </p>
        </div>
        <div className="rounded-2xl border border-gray-700 bg-gray-900 p-5">
          <p className="text-sm text-gray-400">Wallet status</p>
          {balance?.walletAddress ? (
            <div className="mt-3 flex items-center gap-2 text-green-400 text-sm break-all">
              <FiCheck /> {balance.walletAddress.slice(0, 10)}…{balance.walletAddress.slice(-6)}
            </div>
          ) : (
            <div className="mt-3 text-gray-500 text-sm">Not connected</div>
          )}
          {isConnected && wagmiAddress ? (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between rounded-full bg-gradient-to-r from-pink-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white">
                <span>Connected via Web3Modal</span>
                <button onClick={handleDisconnect} className="text-xs underline">Disconnect</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => open()}
              className="mt-4 w-full rounded-full bg-gradient-to-r from-amber-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 mb-8">
        <button onClick={() => setActiveModal('deposit')} className="flex items-center gap-2 rounded-full bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-semibold text-white">
          <FiArrowDown /> Deposit
        </button>
                <button onClick={() => setActiveModal('withdraw')} className="flex items-center gap-2 rounded-full bg-amber-600 hover:bg-amber-500 px-4 py-2 text-sm font-semibold text-white">
          <FiArrowUp /> Withdraw
        </button>
        <button onClick={() => setActiveModal('swap')} className="flex items-center gap-2 rounded-full bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-semibold text-white">
          <FiRepeat /> Swap
        </button>
      </div>

      {/* Transactions */}
      <div className="rounded-2xl border border-gray-700 bg-gray-900 p-5">
        <h3 className="text-xl font-bold mb-4">Recent activity</h3>
        {loadingTx ? (
          <p className="text-gray-500">Loading…</p>
        ) : txData.length === 0 ? (
          <p className="text-gray-500">No transactions yet.</p>
        ) : (
          <div className="space-y-3">
            {txData.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between rounded-xl border border-gray-700 bg-black p-4">
                <div>
                  <p className="font-semibold capitalize">{tx.kind}</p>
                  <p className="text-sm text-gray-500">{tx.description}</p>
                  <p className="text-xs text-gray-600">{fmtTime(tx.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-white">
                    {tx.kind === 'withdrawal' ? '-' : '+'}${Number(tx.amount).toFixed(2)}
                  </p>
                  <p className={`text-xs capitalize ${txStatus(tx) === 'completed' ? 'text-green-400' : 'text-amber-400'}`}>
                    {txStatus(tx).replace('_', ' ')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
{/* Modal */}
      {activeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold capitalize">{activeModal} wallet</h3>
              <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-white">
                <FiX />
              </button>
            </div>

            {activeModal === 'connect' && (
              <>
                <p className="text-sm text-gray-400 mb-4">Connect your Web3 wallet to receive and send funds on the BNB Smart Chain.</p>
                <div className="flex justify-center py-4">
                  <w3m-button size="md" />
                </div>
                <p className="text-xs text-gray-500 mt-3 text-center">Supported: MetaMask, WalletConnect, and more.</p>
              </>
            )}

            {activeModal === 'deposit' && (
              <form onSubmit={handleDeposit} className="space-y-3">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={modalForm.amountUsd || ''}
                  onChange={(e) => setModalForm({ ...modalForm, amountUsd: e.target.value })}
                  placeholder="Amount (USD)"
                  className="w-full bg-black rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
                <p className="text-xs text-gray-500">Verified tokens accepted: DUYS, USDT, BNB and major tokens.</p>
                <button type="submit" disabled={busy} className="w-full rounded-full bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
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
                  value={modalForm.amount || ''}
                  onChange={(e) => setModalForm({ ...modalForm, amount: e.target.value })}
                  placeholder="Amount (USD)"
                  className="w-full bg-black rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <input
                  value={modalForm.walletAddress || ''}
                  onChange={(e) => setModalForm({ ...modalForm, walletAddress: e.target.value })}
                  placeholder="BSC address (0x…)"
                  className="w-full bg-black rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-xs text-gray-500">Withdrawals are queued for review before processing.</p>
                <button type="submit" disabled={busy} className="w-full rounded-full bg-amber-600 hover:bg-amber-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
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
                    className="w-1/2 bg-black rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option>USDT</option>
                    <option>DUYS</option>
                  </select>
                  <select
                    value={modalForm.toAsset || 'DUYS'}
                    onChange={(e) => setModalForm({ ...modalForm, toAsset: e.target.value })}
                    className="w-1/2 bg-black rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full bg-black rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500">Price feed: 1 DUYS ≈ ${(balance?.duysPriceUsd || 0.05).toFixed(4)}. Powered by on-chain oracle.</p>
                <button type="submit" disabled={busy} className="w-full rounded-full bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {busy ? 'Swapping…' : 'Swap'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default WalletPage;