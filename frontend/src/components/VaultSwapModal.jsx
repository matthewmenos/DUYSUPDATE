import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FiX, FiRefreshCw, FiCopy, FiCheck } from 'react-icons/fi';
import api from '../api/client';
import getErrorMessage from '../utils/errors';

const fmtNum = (n, d = 4) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: d }).format(Number(n ?? 0));

const shortAddr = (addr, n = 6) => addr && addr.length > (n * 2 + 6) ? `${addr.slice(0, n)}…${addr.slice(-4)}` : addr || '';

/**
 * VaultSwapModal — buy/sell DUYS ↔ USDT via vault deposit settlement.
 * Quote from the live rate + spread, then submit the deposit tx hash.
 */
function VaultSwapModal({ onClose }) {
  const queryClient = useQueryClient();
  const [side, setSide] = useState('buy');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoteErr, setQuoteErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [swapId, setSwapId] = useState(null);
  const [depositTx, setDepositTx] = useState('');
  const [copied, setCopied] = useState(false);

  const { data: config } = useQuery({
    queryKey: ['economy', 'swap', 'config'],
    queryFn: async () => (await api.get('/economy/swap/config')).data,
  });

  const getQuote = async (e) => {
    if (e) e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error('Enter an amount');
    setBusy(true);
    setQuoteErr('');
    try {
      const res = await api.post('/economy/swap/quote', { side, amount: amt });
      if (!res.data.ok) {
        setQuoteErr(res.data.error === 'below_min' ? `Minimum is ${fmtNum(res.data.min_usdt)} USDT` : 'Could not quote');
        setQuote(null);
      } else {
        setQuote(res.data);
      }
    } catch (err) {
      setQuoteErr(getErrorMessage(err));
      setQuote(null);
    } finally {
      setBusy(false);
    }
  };

  const startMutation = useMutation({
    mutationFn: async () => (await api.post('/economy/swap', { side, amount: Number(amount) })).data,
    onSuccess: (res) => {
      setSwapId(res.swapId);
      toast.success('Swap started — send your deposit');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const settleMutation = useMutation({
    mutationFn: async () => (await api.post(`/economy/swap/${swapId}/settle`, { depositTx })).data,
    onSuccess: () => {
      toast.success('Swap settled — tokens credited!');
      queryClient.invalidateQueries({ queryKey: ['wallet', 'balance'] });
      queryClient.invalidateQueries({ queryKey: ['economy', 'earn'] });
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const copyVault = () => {
    const addr = config?.vault_address;
    if (!addr) return;
    navigator.clipboard?.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const enabled = side === 'buy' ? config?.buy_enabled !== false : config?.sell_enabled !== false;
  const amt = Number(amount) || 0;
  const previewOut = quote?.to_amount;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 overlay-fade" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl overflow-hidden modal-pop">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/60">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FiRefreshCw className="text-blue-400" /> Vault swap
          </h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-gray-800 flex items-center justify-center">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Side toggle */}
          <div className="flex rounded-full bg-gray-800 p-1">
            <button
              onClick={() => { setSide('buy'); setQuote(null); setSwapId(null); }}
              disabled={config?.buy_enabled === false}
              className={`flex-1 py-2 rounded-full text-sm font-bold transition ${side === 'buy' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'} ${config?.buy_enabled === false ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              Buy DUYS
            </button>
            <button
              onClick={() => { setSide('sell'); setQuote(null); setSwapId(null); }}
              disabled={config?.sell_enabled === false}
              className={`flex-1 py-2 rounded-full text-sm font-bold transition ${side === 'sell' ? 'bg-rose-600 text-white' : 'text-gray-400 hover:text-white'} ${config?.sell_enabled === false ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              Sell DUYS
            </button>
          </div>

          {!enabled && (
            <p className="text-xs text-amber-300 text-center">This side is temporarily disabled.</p>
          )}
{!swapId ? (
            <>
              {/* Amount + quote */}
              <form onSubmit={getQuote} className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                    You send {side === 'buy' ? 'USDT' : 'DUYS'}
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); setQuote(null); }}
                    placeholder={side === 'buy' ? 'USDT amount' : 'DUYS amount'}
                    min="0"
                    step="any"
                    className="mt-1.5 w-full px-4 py-2.5 rounded-xl bg-black/40 border border-gray-700 focus:border-blue-500 outline-none text-sm"
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>
                    Rate: {fmtNum(config?.rate, 4)} DUYS/USDT · Spread: {fmtNum(config?.spread, 2)}%
                  </span>
                  <span className="text-gray-500">Min {fmtNum(config?.min_usdt, 2)} USDT</span>
                </div>

                {quoteErr && <p className="text-xs text-rose-400">{quoteErr}</p>}

                {quote && quote.ok && (
                  <div className="rounded-xl bg-gray-800/50 border border-gray-700/60 p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-400">You send</span>
                      <span className="font-semibold">{fmtNum(quote.from_amount, 6)} {quote.from_token}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">You receive</span>
                      <span className="font-semibold text-emerald-300">{fmtNum(quote.to_amount, 6)} {quote.to_token}</span>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy || !amt || amt <= 0}
                  className="w-full px-4 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-sm font-bold transition disabled:opacity-50"
                >
                  {busy ? 'Quoting…' : quote?.ok ? 'Recalculate' : 'Get quote'}
                </button>
              </form>

              {previewOut > 0 && (
                <button
                  onClick={() => startMutation.mutate()}
                  disabled={startMutation.isPending}
                  className="w-full px-4 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-sm font-bold transition disabled:opacity-50"
                >
                  {startMutation.isPending ? 'Starting…' : `Swap ${fmtNum(amt, 6)} ${side === 'buy' ? 'USDT → DUYS' : 'DUYS → USDT'}`}
                </button>
              )}
            </>
          ) : (
<>
              {/* Deposit instructions */}
              <div className="rounded-xl bg-gray-800/50 border border-gray-700/60 p-4 space-y-3">
                <h3 className="text-sm font-bold">Send your deposit</h3>
                <p className="text-xs text-gray-400">
                  {side === 'buy'
                    ? `Deposit ${quote?.from_amount ?? amount} USDT to the vault address below, then paste the transaction hash.`
                    : `Deposit ${quote?.from_amount ?? amount} DUYS to the vault address below, then paste the transaction hash.`}
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 rounded-lg bg-black/40 border border-gray-700 text-xs font-mono text-blue-300 truncate">
                    {shortAddr(config?.vault_address)}
                  </code>
                  <button onClick={copyVault} className="p-2 rounded-lg bg-gray-700/60 hover:bg-gray-600 text-xs transition" title="Copy vault address">
                    {copied ? <FiCheck className="w-4 h-4 text-emerald-400" /> : <FiCopy className="w-4 h-4" />}
                  </button>
                </div>
                <input
                  value={depositTx}
                  onChange={(e) => setDepositTx(e.target.value)}
                  placeholder="0x… deposit transaction hash"
                  className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-gray-700 focus:border-blue-500 outline-none text-sm font-mono"
                />
              </div>

              <button
                onClick={() => settleMutation.mutate()}
                disabled={settleMutation.isPending || !depositTx.trim()}
                className="w-full px-4 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-sm font-bold transition disabled:opacity-50"
              >
                {settleMutation.isPending ? 'Settling…' : 'Confirm deposit & settle'}
              </button>
            </>
          )}

          {/* Token addresses */}
          <div className="pt-3 border-t border-gray-700/50 space-y-1.5 text-[11px] text-gray-500">
            {config?.usdt_address && (
              <div className="flex justify-between gap-2">
                <span>USDT (BSC):</span>
                <span className="font-mono truncate">{shortAddr(config.usdt_address, 8)}</span>
              </div>
            )}
            {config?.duys_address && (
              <div className="flex justify-between gap-2">
                <span>DUYS (BSC):</span>
                <span className="font-mono truncate">{shortAddr(config.duys_address, 8)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-700/60">
          <button onClick={onClose} className="w-full px-4 py-2.5 rounded-full bg-gray-800 hover:bg-gray-700 text-sm font-semibold transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default VaultSwapModal;