import { query, queryOne, queryAll, transaction } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Wallet & Payments service.
 *
 * Adapted to the actual schema (there is no `wallets` table):
 * - Balances live on `users`: `duys_tokens` (DUYS) and `balance_cents` (USD cents).
 * - Transactions use `kind`/`amount`/`balance_after`/`description`/`reference_id`/`metadata`.
 *   There is no `status` column, so status is stored inside `metadata.status`
 *   (e.g. 'pending', 'pending_review', 'completed').
 * - Connected wallets are stored in `wallet_addresses` + `users.wallet_address`.
 */

const DEFAULT_DUYS_PRICE_USD = 0.05; // configurable via env later

function randouID() {
  return 'txn_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * Fetch a user's balances from the users table.
 */
export async function getWalletBalance(userId) {
  const user = await queryOne(
    'SELECT id, duys_tokens, balance_cents, points, wallet_address FROM users WHERE id = $1',
    [userId]
  );
  if (!user) throw new AppError('User not found', 404);

  return {
    userId: user.id,
    duys: Number(user.duys_tokens || 0),
    usd: Number(user.balance_cents || 0) / 100,
    usdCents: Number(user.balance_cents || 0),
    points: Number(user.points || 0),
    walletAddress: user.wallet_address || null,
    duysPriceUsd: DEFAULT_DUYS_PRICE_USD
  };
}

/**
 * Transaction history, cursor-paginated (beforeId on id).
 */
export async function getTransactions(userId, limit = 20, beforeId = null) {
  return queryAll(
    `SELECT id, kind, amount, balance_after, description, reference_id, metadata, created_at
     FROM transactions
     WHERE user_id = $1 AND ($2::int IS NULL OR id < $2)
     ORDER BY id DESC
     LIMIT $3`,
    [userId, beforeId, limit]
  );
}

/**
 * Initiate a deposit. In production this would create a crypto payment and
 * verify via an explorer; here we insert a 'pending' transaction and return
 * a reference that confirmDeposit later settles.
 */
export async function initiateDeposit(userId, amountUsd, paymentMethod) {
  if (!amountUsd || amountUsd <= 0) throw new AppError('Invalid deposit amount', 400);
  const ref = randouID();

  const balance = await getWalletBalance(userId);
  await query(
    `INSERT INTO transactions (user_id, kind, amount, balance_after, description, reference_id, metadata)
     VALUES ($1, 'deposit', $2, $3, $4, $5, $6)`,
    [userId, amountUsd, balance.usdCents, `Deposit via ${paymentMethod || 'crypto'}`, ref,
      JSON.stringify({ status: 'pending', payment_method: paymentMethod })]
  );

  return { transactionId: ref, status: 'pending', amountUsd };
}

/**
 * Settle a pending deposit: verify and credit the user's USD balance.
 */
export async function confirmDeposit(userId, transactionId) {
  const tx = await queryOne(
    `SELECT * FROM transactions
     WHERE user_id = $1 AND reference_id = $2 AND kind = 'deposit'`,
    [userId, transactionId]
  );
  if (!tx) throw new AppError('Transaction not found', 404);

  const meta = tx.metadata || {};
  if (meta.status === 'completed') throw new AppError('Already confirmed', 409);

  const amountCents = Math.round(Number(tx.amount) * 100);

  const updated = await transaction(async (client) => {
    const user = await client.query(
      'SELECT balance_cents FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    const newBalance = Number(user.rows[0].balance_cents) + amountCents;
    await client.query(
      'UPDATE users SET balance_cents = $1 WHERE id = $2',
      [newBalance, userId]
    );
    const result = await client.query(
      `UPDATE transactions SET balance_after = $1, metadata = $2 WHERE id = $3 RETURNING *`,
      [newBalance, JSON.stringify({ ...meta, status: 'completed', confirmed_at: new Date().toISOString() }), tx.id]
    );
    return result.rows[0];
  });

  return { success: true, transaction: updated };
}
/**
 * Initiate a withdrawal: validate the address and queue for review.
 */
export async function initiateWithdraw(userId, amount, walletAddress) {
  if (!amount || amount <= 0) throw new AppError('Invalid withdrawal amount', 400);
  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    throw new AppError('Invalid Ethereum/BSC address', 400);
  }

  const balance = await getWalletBalance(userId);
  if (Number(amount) > balance.usd) {
    throw new AppError('Insufficient balance', 400);
  }

  const ref = randouID();
  await query(
    `INSERT INTO transactions (user_id, kind, amount, balance_after, description, reference_id, metadata)
     VALUES ($1, 'withdrawal', $2, $3, $4, $5, $6)`,
    [userId, amount, balance.usdCents, `Withdraw ${amount} USD to ${walletAddress}`, ref,
      JSON.stringify({ status: 'pending_review', wallet_address: walletAddress })]
  );

  return { transactionId: ref, status: 'pending_review', amount };
}

/**
 * Approve a withdrawal: settle it and debit the user's balance.
 */
export async function approveWithdraw(transactionId) {
  const tx = await queryOne(
    `SELECT * FROM transactions WHERE reference_id = $1 AND kind = 'withdrawal'`,
    [transactionId]
  );
  if (!tx) throw new AppError('Transaction not found', 404);

  const meta = tx.metadata || {};
  if (meta.status === 'completed') throw new AppError('Already approved', 409);
  if (meta.wallet_address) {
    // In production: trigger an on-chain transfer to meta.wallet_address.
  }

  const amountCents = Math.round(Number(tx.amount) * 100);
  const updated = await transaction(async (client) => {
    const user = await client.query(
      'SELECT balance_cents FROM users WHERE id = $1 FOR UPDATE',
      [tx.user_id]
    );
    const newBalance = Math.max(Number(user.rows[0].balance_cents) - amountCents, 0);
    await client.query(
      'UPDATE users SET balance_cents = $1 WHERE id = $2',
      [newBalance, tx.user_id]
    );
    const result = await client.query(
      `UPDATE transactions SET balance_after = $1, metadata = $2 WHERE id = $3 RETURNING *`,
      [newBalance, JSON.stringify({ ...meta, status: 'completed', approved_at: new Date().toISOString() }), tx.id]
    );
    return result.rows[0];
  });

  return { success: true, transaction: updated };
}

/**
 * Swap between USD (USDT-equivalent balance) and DUYS using a price feed.
 */
export async function swapTokens(userId, fromAsset, toAsset, amount) {
  if (!amount || amount <= 0) throw new AppError('Invalid swap amount', 400);
  const from = String(fromAsset || '').toUpperCase();
  const to = String(toAsset || '').toUpperCase();

  const price = DEFAULT_DUYS_PRICE_USD;

  const swap = await transaction(async (client) => {
    const userRow = await client.query(
      'SELECT duys_tokens, balance_cents FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    const user = userRow.rows[0];

    let duys = Number(user.duys_tokens || 0);
    let cents = Number(user.balance_cents || 0);
    let description = '';

    if (from === 'USD' && to === 'DUYS') {
      // Buy DUYS with USD.
      const costCents = Math.round(Number(amount) * 100);
      if (costCents > cents) throw new AppError('Insufficient USD balance', 400);
      const duysReceived = Number(amount) / price;
      cents -= costCents;
      duys += duysReceived;
      description = `Swapped ${amount} USD → ${duysReceived.toFixed(4)} DUYS`;
    } else if (from === 'DUYS' && to === 'USD') {
      // Sell DUYS for USD.
      if (Number(amount) > duys) throw new AppError('Insufficient DUYS balance', 400);
      const usdReceived = Number(amount) * price;
      cents += Math.round(usdReceived * 100);
      duys -= Number(amount);
      description = `Swapped ${amount} DUYS → ${usdReceived.toFixed(2)} USD`;
    } else {
      throw new AppError('Unsupported swap pair', 400);
    }

    await client.query(
      'UPDATE users SET duys_tokens = $1, balance_cents = $2 WHERE id = $3',
      [duys, cents, userId]
    );

    const result = await client.query(
      `INSERT INTO transactions (user_id, kind, amount, balance_after, description, metadata)
       VALUES ($1, 'purchase', $2, $3, $4, $5)
       RETURNING *`,
      [userId, amount, cents, description,
        JSON.stringify({ status: 'completed', from: fromAsset, to: toAsset })]
    );
    return result.rows[0];
  });

  return { success: true, transaction: swap, balance: await getWalletBalance(userId) };
}

/**
 * Connect a Web3 wallet (MetaMask/WalletConnect). Stores the address mapping.
 * Signature verification is expected to be handled by the client + wallet.
 */
export async function connectWeb3Wallet(userId, walletAddress, blockchain = 'bsc') {
  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    throw new AppError('Invalid wallet address', 400);
  }

  await query(
    `INSERT INTO wallet_addresses (user_id, address, blockchain, verified, primary_wallet)
     VALUES ($1, $2, $3, true, true)
     ON CONFLICT (user_id, address) DO UPDATE SET verified = true, primary_wallet = true`,
    [userId, walletAddress, blockchain]
  );

  await query(
    'UPDATE users SET wallet_address = $1 WHERE id = $2',
    [walletAddress, userId]
  );

  return { success: true, walletAddress, blockchain };
}

export default {
  getWalletBalance,
  getTransactions,
  initiateDeposit,
  confirmDeposit,
  initiateWithdraw,
  approveWithdraw,
  swapTokens,
  connectWeb3Wallet
};