import { query, queryOne, queryAll, transaction } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import * as pointsService from './pointsService.js';
import * as notificationsService from './notificationsService.js';

/**
 * Creator shop — verified users sell downloadable files for DUYS.
 * Ported from legacy `DUYS/duys/routes/shop.py`.
 */

export const MAX_FILE_MB = 50;

export async function getUserByUsername(username) {
  return queryOne(
    'SELECT id, username, display_name, avatar_url, verified_badge, bio FROM users WHERE LOWER(username) = LOWER($1)',
    [username]
  );
}

/** Sell page data: seller + their listings + the viewer's purchased ids. */
export async function getSellerShop(username, viewerId) {
  const seller = await getUserByUsername(username);
  if (!seller) return null;

  const isSelf = seller.id === viewerId;

  const listings = await (isSelf
    ? queryAll(
        'SELECT * FROM shop_listings WHERE seller_id = $1 ORDER BY id DESC',
        [seller.id]
      )
    : queryAll(
        'SELECT * FROM shop_listings WHERE seller_id = $1 AND active = true ORDER BY id DESC',
        [seller.id]
      ));

  let purchasedIds = [];
  if (!isSelf && viewerId) {
    const rows = await queryAll(
      'SELECT listing_id FROM shop_purchases WHERE buyer_id = $1',
      [viewerId]
    );
    purchasedIds = rows.map((r) => r.listing_id);
  }

  return {
    seller: { ...seller, isSelf },
    listings: listings.map((l) => ({ ...l, price_duys: Number(l.price_duys) })),
    purchasedIds
  };
}

/** Create a listing (seller only, must be verified). */
export async function createListing(sellerId, data) {
  const seller = await queryOne('SELECT verified_badge FROM users WHERE id = $1', [sellerId]);
  if (!seller?.verified_badge) throw new AppError('Only verified creators can open a shop', 403);

  const { title = '', description = '', priceDuys = 0, fileKey = '', fileUrl = '', fileName = '' } = data;
  if (!title.trim()) throw new AppError('Title is required', 400);
  if (!fileKey || !fileUrl) throw new AppError('A file is required', 400);

  const row = await queryOne(
    `INSERT INTO shop_listings (seller_id, title, description, file_key, file_url, file_name, price_duys)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [sellerId, String(title).slice(0, 128), String(description || '').slice(0, 1000),
      fileKey, fileUrl, String(fileName || '').slice(0, 255), Number(priceDuys) || 0]
  );
  return row;
}

export async function toggleListing(listingId, sellerId) {
  const row = await queryOne('SELECT id, seller_id, active FROM shop_listings WHERE id = $1', [listingId]);
  if (!row) throw new AppError('Listing not found', 404);
  if (row.seller_id !== sellerId) throw new AppError('Forbidden', 403);
  const active = !row.active;
  await query('UPDATE shop_listings SET active = $1 WHERE id = $2', [active, listingId]);
  return { ok: true, active };
}

export async function deleteListing(listingId, sellerId) {
  const row = await queryOne('SELECT id, seller_id, file_key FROM shop_listings WHERE id = $1', [listingId]);
  if (!row) throw new AppError('Listing not found', 404);
  if (row.seller_id !== sellerId) throw new AppError('Forbidden', 403);
  await query('DELETE FROM shop_listings WHERE id = $1', [listingId]);
  return { ok: true, fileKey: row.file_key };
}
/** Buy a listing with in-app DUYS; returns the purchasable file URL. */
export async function buyListing(listingId, buyerId) {
  return transaction(async (client) => {
    const listingRes = await client.query(
      'SELECT * FROM shop_listings WHERE id = $1 AND active = true',
      [listingId]
    );
    const listing = listingRes.rows[0];
    if (!listing) throw new AppError('Listing not found', 404);
    if (listing.seller_id === buyerId) throw new AppError('You cannot buy your own listing', 400);

    const existing = await client.query(
      'SELECT 1 FROM shop_purchases WHERE buyer_id = $1 AND listing_id = $2',
      [buyerId, listingId]
    );
    if (existing.rows[0]) {
      return { ok: true, fileUrl: listing.file_url, alreadyOwned: true };
    }

    const price = Number(listing.price_duys || 0);
    if (price > 0) {
      // Atomic spend of in-app DUYS.
      const spendRes = await client.query(
        'UPDATE users SET duys_tokens = duys_tokens - $1 WHERE id = $2 AND duys_tokens >= $1',
        [price, buyerId]
      );
      if (spendRes.rowCount === 0) throw new AppError('Insufficient DUYS balance', 400);

      await client.query(
        'UPDATE users SET duys_tokens = duys_tokens + $1 WHERE id = $2',
        [price, listing.seller_id]
      );
      await client.query(
        `INSERT INTO point_ledger (user_id, delta, reason, ref) VALUES ($1, $2, 'shop_purchase_out', $3)`,
        [buyerId, -price, `listing:${listingId}`]
      );
      await client.query(
        `INSERT INTO point_ledger (user_id, delta, reason, ref) VALUES ($1, $2, 'shop_sale_in', $3)`,
        [listing.seller_id, price, `listing:${listingId}`]
      );
    }

    await client.query(
      'INSERT INTO shop_purchases (buyer_id, listing_id, paid) VALUES ($1, $2, $3)',
      [buyerId, listingId, price]
    );

    notificationsService.createNotification({
      userId: listing.seller_id,
      actorId: buyerId,
      kind: 'payment',
      title: `Someone bought your shop item "${listing.title}"!`,
      message: '',
      entityType: 'listing',
      entityId: Number(listingId)
    }).catch(() => {});

    return { ok: true, fileUrl: listing.file_url };
  });
}

/** Ensure the viewer may download a listing (owner or purchaser). */
export async function canDownload(listingId, userId) {
  const listing = await queryOne('SELECT seller_id FROM shop_listings WHERE id = $1', [listingId]);
  if (!listing) throw new AppError('Listing not found', 404);
  if (listing.seller_id === userId) return true;
  const purchase = await queryOne(
    'SELECT 1 FROM shop_purchases WHERE buyer_id = $1 AND listing_id = $2',
    [userId, listingId]
  );
  return !!purchase;
}

export default {
  getUserByUsername, getSellerShop, createListing,
  toggleListing, deleteListing, buyListing, canDownload
};