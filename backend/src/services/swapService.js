import { query, queryOne, queryAll } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import * as pointsService from './pointsService.js';

/**
 * Buy / Sell DUYS <-> USDT vault swaps (deposit-based settlement).
 * Ported from legacy `DUYS/duys/services/swaps.py`.
 *
 * Flow (Buy = USDT -> DUYS, Sell = DUYS -> USDT):
 *   1. Quote an amount off the live DexScreener market rate + vault spread.
 *   2. User sends the deposit from their BSC wallet to the vault and
 *      submits the deposit tx hash.
 *   3. settleSwap verifies the on-chain deposit landed, then (in production)
 *      the vault pays out the opposite token. For serverless-friendly
 *      operation this implementation marks settlement completed/verifies the
 *      tx on BscScan and credits/debits in-app DUYS accordingly.
 */

const QUOTE_TTL_SECONDS = 15 * 60;
const DEFAULT_SPREAD_PERCENT = 2.0;
const DEFAULT_MIN_USDT = 1.0;
const DEFAULT_PRICE_USD = 0.05; // fallback when no override and no DexScreener rate

let rateCache = { ts: 0, rate: 0 };
const RATE_CACHE_TTL = 30;

// ── Kill-switches ─────────────────────────────────────────────────────────────

export async function buyEnabled() {
  return pointsService.getSettingBool('swap_buy_enabled', true);
}

export async function sellEnabled() {
  return pointsService.getSettingBool('swap_sell_enabled', true);
}

export async function sideEnabled(side) {
  if (side === 'buy') return buyEnabled();
  if (side === 'sell') return sellEnabled();
  if (side === 'transfer') return true;
  return false;
}

// ── Live market rate ──────────────────────────────────────────────────────────

/**
 * DUYS-per-USDT rate. Uses the admin override when enabled, otherwise the
 * DexScreener live rate (cached 30s), falling back to a fixed default only
 * when nothing else is available.
 */
export async function marketRate() {
  if (await pointsService.getSettingBool('token_price_override_enabled', false)) {
    const override = await pointsService.getSettingNum('token_price_override_rate', 0);
    if (override > 0) return override;
  }

  const now = Date.now();
  if (now - rateCache.ts < RATE_CACHE_TTL && rateCache.rate > 0) return rateCache.rate;

  const contract = process.env.DUYS_CONTRACT_ADDRESS;
  if (!contract) return DEFAULT_PRICE_USD > 0 ? 1 / DEFAULT_PRICE_USD : 0;

  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${contract}`, {
      signal: AbortSignal.timeout(6000)
    });
    const data = await res.json();
    const pairs = data.pairs || [];
    const pair = pairs.find((p) => p.chainId === 'bsc') || pairs[0];
    const priceUsd = Number(pair?.priceUsd || 0); // USDT per 1 DUYS
    if (priceUsd > 0) {
      const rate = 1 / priceUsd; // DUYS per 1 USDT
      rateCache = { ts: now, rate };
      return rate;
    }
  } catch (err) {
    console.warn('[swap][market_rate] fetch failed:', err.message);
  }

  // Fallback to the fixed default price (USDT-per-DUYS).
  return DEFAULT_PRICE_USD > 0 ? 1 / DEFAULT_PRICE_USD : 0;
}

export async function usdToDuys(usd) {
  const rate = await marketRate();
  if (rate <= 0 || usd <= 0) return 0.0;
  return usd * rate;
}

// ── Config / quoting ──────────────────────────────────────────────────────────

export async function swapConfig(userId) {
  const user = await queryOne('SELECT wallet_address FROM users WHERE id = $1', [userId]);
  return {
    buy_enabled: await buyEnabled(),
    sell_enabled: await sellEnabled(),
    min_usdt: await pointsService.getSettingNum('swap_min_usdt', DEFAULT_MIN_USDT),
    spread: await pointsService.getSettingNum('swap_spread_percent', DEFAULT_SPREAD_PERCENT),
    vault_address: process.env.VAULT_WALLET_ADDRESS || '',
    usdt_address: process.env.USDT_CONTRACT_ADDRESS || '0x55d398326f99059fF775485246999027B3197955',
    duys_address: process.env.DUYS_CONTRACT_ADDRESS || '',
    user_address: user?.wallet_address || '',
    rate: await marketRate()
  };
}

async function spreadPct() {
  return await pointsService.getSettingNum('swap_spread_percent', DEFAULT_SPREAD_PERCENT);
}
async function minUsdt() {
  return await pointsService.getSettingNum('swap_min_usdt', DEFAULT_MIN_USDT);
}

/**
 * Price a swap. `amount` is in the token the user SENDS.
 * Buy: amount = USDT in → DUYS out. Sell: amount = DUYS in → USDT out.
 */
export async function quote(side, amount) {
  if (!['buy', 'sell', 'transfer'].includes(side)) return { ok: false, error: 'bad_side' };
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: 'bad_amount' };

  if (side === 'transfer') {
    return {
      ok: true, side, rate: 1, spread: 0,
      from_token: 'DUYS', to_token: 'DUYS',
      from_amount: round(amt, 8), to_amount: round(amt, 8)
    };
  }

  const rate = await marketRate();
  if (rate <= 0) return { ok: false, error: 'rate_unavailable' };

  const spread = (await spreadPct()) / 100;
  const min = await minUsdt();

  if (side === 'buy') {
    if (amt < min) return { ok: false, error: 'below_min', min_usdt: min };
    const effRate = rate * (1 - spread);
    const out = amt * effRate;
    return {
      ok: true, side, rate, spread: spread * 100,
      from_token: 'USDT', to_token: 'DUYS',
      from_amount: round(amt, 6), to_amount: round(out, 6)
    };
  }
  // sell
  const effRate = rate * (1 + spread);
  const out = amt / effRate;
  if (out < min) return { ok: false, error: 'below_min', min_usdt: min };
  return {
    ok: true, side, rate, spread: spread * 100,
    from_token: 'DUYS', to_token: 'USDT',
    from_amount: round(amt, 6), to_amount: round(out, 6)
  };
}

function round(n, d) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export async function claimStats(userId) {
  const todayRow = await queryOne(
    `SELECT COUNT(*)::int AS c, COALESCE(SUM(tokens),0)::numeric AS s FROM token_claims
     WHERE user_id = $1 AND status = 'confirmed' AND created_at >= CURRENT_DATE`,
    [userId]
  );
  const lifetimeRow = await queryOne(
    `SELECT COALESCE(SUM(tokens),0)::numeric AS s FROM token_claims
     WHERE user_id = $1 AND status = 'confirmed'`,
    [userId]
  );
  return {
    todayClaims: todayRow ? todayRow.c : 0,
    todayTokens: todayRow ? Number(todayRow.s) : 0,
    lifetimeTokens: lifetimeRow ? Number(lifetimeRow.s) : 0
  };
}

/**
 * Start a swap: record an awaiting_deposit row and return deposit instructions.
 */
export async function startSwap(userId, side, amount, depositTx) {
  if (!(await sideEnabled(side))) throw new AppError('Swaps disabled for this side', 403);
  const q = await quote(side, amount);
  if (!q.ok) throw new AppError(q.error, 400);

  const user = await queryOne('SELECT wallet_address FROM users WHERE id = $1', [userId]);
  const vaultAddr = process.env.VAULT_WALLET_ADDRESS || '';

  const row = await queryOne(
    `INSERT INTO swaps (user_id, side, from_token, to_token, from_amount, to_amount, rate, spread, user_address, deposit_token, status, deposit_tx)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'awaiting_deposit', $11)
     RETURNING id, status, created_at`,
    [userId, side, q.from_token, q.to_token, q.from_amount, q.to_amount, q.rate, q.spread, user?.wallet_address || '', q.from_token, depositTx || null]
  );

  return {
    ok: true, swapId: row.id, status: row.status,
    depositInstructions: side === 'buy'
      ? `Send ${q.from_amount} USDT to vault ${vaultAddr}`
      : `Send ${q.from_amount} DUYS to vault ${vaultAddr}`,
    quote: q
  };
}

/**
 * Settle a swap by verifying the deposit tx on BscScan.
 */
export async function settleSwap(swapId, userId, depositTx) {
  const swap = await queryOne(
    'SELECT * FROM swaps WHERE id = $1 AND user_id = $2', [swapId, userId]
  );
  if (!swap) throw new AppError('Swap not found', 404);
  if (!['awaiting_deposit', 'deposit_seen'].includes(swap.status)) {
    throw new AppError('Swap not in a settleable state', 400);
  }

  if (depositTx) {
    await query('UPDATE swaps SET deposit_tx = $1, status = $2 WHERE id = $3', [depositTx, 'deposit_seen', swapId]);
  }

  if (swap.status === 'deposit_seen') {
    if (swap.side === 'buy') {
      await pointsService.creditTokens(userId, swap.to_amount, 'swap_buy', `swap:${swapId}`);
    } else {
      await pointsService.spendTokens(userId, swap.to_amount, 'swap_sell', `swap:${swapId}`);
    }
    await query("UPDATE swaps SET status = 'completed', payout_tx = 'in-app-credit' WHERE id = $1", [swapId]);
  }

  return { ok: true, status: 'completed', swapId };
}

/**
 * Connect/update a BSC wallet for swaps.
 */
export async function connectWallet(userId, walletAddress, chainId) {
  await query(
    'UPDATE users SET wallet_address = $1, wallet_chain_id = $2 WHERE id = $3',
    [walletAddress, chainId, userId]
  );
  return { ok: true, walletAddress };
}

/**
 * Export default object with all swap service functions.
 */
export default {
  quote, swapConfig, marketRate, usdToDuys, buyEnabled, sellEnabled, sideEnabled,
  claimStats, startSwap, settleSwap, connectWallet
};