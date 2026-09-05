import express from 'express';
import * as pointsService from '../services/pointsService.js';
import * as earnService from '../services/earnService.js';
import * as referralService from '../services/referralService.js';
import * as leaderboardService from '../services/leaderboardService.js';
import * as boostService from '../services/boostService.js';
import * as swapService from '../services/swapService.js';
const router = express.Router();

/* ── Points balance & ledger ── */
router.get('/points', async (req, res, next) => {
  try {
    const points = await pointsService.getPointsBalance(req.user.id);
    const ledger = await pointsService.getPointLedger(req.user.id, 50);
    res.json({ points, ledger });
  } catch (err) { next(err); }
});

/* ── Referral ── */
router.get('/referral', async (req, res, next) => {
  try {
    res.json(await referralService.getReferralInfo(req.user.id));
  } catch (err) { next(err); }
});

/* ── Leaderboard ── */
router.get('/leaderboard', async (req, res, next) => {
  try {
    res.json(await leaderboardService.getLeaderboard(req.user.id, 100));
  } catch (err) { next(err); }
});

/* ── Earn ── */
router.get('/earn', async (req, res, next) => {
  try {
    const info = await earnService.claimInfo(req.user.id);
    const stats = await earnService.adStats(req.user.id);
    res.json({ ...info, ...stats });
  } catch (err) { next(err); }
});

router.post('/earn/claim', async (req, res, next) => {
  try {
    res.json(await earnService.claimTokens(req.user.id));
  } catch (err) { next(err); }
});

/* HypeLab S2S webhook — no auth, raw body. Mounted publicly in app.js. */
export const adWebhookRouter = express.Router();
adWebhookRouter.post('/earn/ad-webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const sig = req.headers['x-hypelab-signature'];
  const secret = process.env.HYPELAB_WEBHOOK_SECRET;
  if (!earnService.verifyHypelabSignature(req.body, sig, secret)) {
    return res.status(401).send('Invalid signature');
  }
  try {
    const body = JSON.parse(req.body.toString());
    const reward = Number(process.env.HYPELAB_REWARD_POINTS || 10);
    const result = await earnService.creditHypelabEvent(body.event_id, body.user_id, reward);
    res.json(result);
  } catch (err) {
    console.error('[ad-webhook]', err);
    res.status(400).send('Bad payload');
  }
});

/* ── Swap ── */
router.get('/swap/config', async (req, res, next) => {
  try {
    res.json(await swapService.swapConfig(req.user.id));
  } catch (err) { next(err); }
});

router.post('/swap/quote', async (req, res, next) => {
  try {
    const { side, amount } = req.body;
    res.json(await swapService.quote(side, amount));
  } catch (err) { next(err); }
});

router.post('/swap', async (req, res, next) => {
  try {
    const { side, amount, depositTx } = req.body;
    res.json(await swapService.startSwap(req.user.id, side, amount, depositTx));
  } catch (err) { next(err); }
});

router.post('/swap/:id/settle', async (req, res, next) => {
  try {
    const { depositTx } = req.body;
    res.json(await swapService.settleSwap(req.params.id, req.user.id, depositTx));
  } catch (err) { next(err); }
});

/* ── Boost ── */
router.get('/boost/rate', async (req, res, next) => {
  try {
    res.json(await boostService.boostRate());
  } catch (err) { next(err); }
});

router.post('/boost', async (req, res, next) => {
  try {
    const { postId, days, geo, audience, landingUrl, cta, ageMin, ageMax } = req.body;
    res.json(await boostService.boostPost(postId, req.user.id, { days, geo, audience, landingUrl, cta, ageMin, ageMax }));
  } catch (err) { next(err); }
});

export default router;
