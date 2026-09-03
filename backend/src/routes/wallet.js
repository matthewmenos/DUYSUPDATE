import express from 'express';
import Joi from 'joi';
import * as walletService from '../services/walletService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * GET /wallet/balance
 * Get the user's DUYS + USD balances.
 */
router.get('/balance', async (req, res) => {
  try {
    const balance = await walletService.getWalletBalance(req.userId);
    res.json(balance);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /wallet/transactions?limit=&beforeId=
 * Cursor-paginated transaction history.
 */
router.get('/transactions', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const beforeId = req.query.beforeId ? parseInt(req.query.beforeId, 10) : null;
    const transactions = await walletService.getTransactions(req.userId, limit, beforeId);
    res.json({ transactions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /wallet/deposit
 * Initiate a crypto deposit.
 */
router.post('/deposit', async (req, res) => {
  const schema = Joi.object({
    amountUsd: Joi.number().positive().required(),
    paymentMethod: Joi.string().max(100).allow('').default('crypto')
  });
  const { error, value } = schema.validate(req.body || {});
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const result = await walletService.initiateDeposit(req.userId, value.amountUsd, value.paymentMethod);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /wallet/deposit/confirm
 * Confirm a pending deposit and credit the balance.
 */
router.post('/deposit/confirm', async (req, res) => {
  const schema = Joi.object({
    transactionId: Joi.string().required()
  });
  const { error, value } = schema.validate(req.body || {});
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const result = await walletService.confirmDeposit(req.userId, value.transactionId);
    res.json(result);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /wallet/withdraw
 * Initiate a withdrawal (validated, queued for review).
 */
router.post('/withdraw', async (req, res) => {
  const schema = Joi.object({
    amount: Joi.number().positive().required(),
    walletAddress: Joi.string().required()
  });
  const { error, value } = schema.validate(req.body || {});
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const result = await walletService.initiateWithdraw(req.userId, value.amount, value.walletAddress);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /wallet/swap
 * Swap USDT-equivalent USD ↔ DUYS.
 */
router.post('/swap', async (req, res) => {
  const schema = Joi.object({
    fromAsset: Joi.string().valid('USD', 'USDT', 'DUYS').required(),
    toAsset: Joi.string().valid('USD', 'USDT', 'DUYS').required(),
    amount: Joi.number().positive().required()
  });
  const { error, value } = schema.validate(req.body || {});
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const result = await walletService.swapTokens(
      req.userId,
      value.fromAsset === 'USDT' ? 'USD' : value.fromAsset,
      value.toAsset === 'USDT' ? 'USD' : value.toAsset,
      value.amount
    );
    res.json(result);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /wallet/connect
 * Connect a Web3 wallet (MetaMask/WalletConnect).
 */
router.post('/connect', async (req, res) => {
  const schema = Joi.object({
    walletAddress: Joi.string().required(),
    blockchain: Joi.string().max(50).default('bsc')
  });
  const { error, value } = schema.validate(req.body || {});
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const result = await walletService.connectWeb3Wallet(req.userId, value.walletAddress, value.blockchain);
    res.json(result);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;
