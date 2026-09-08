# DUYS — Architecture, Setup, API & Database Reference

This document is the complete technical reference for **DUYS**, a short-form
social video platform similar to TikTok with deep Web3 / crypto integration.

It covers the full rewrite from the **original Flask + SQLite** codebase to the
current **Node.js (Express) + React (Vite) + PostgreSQL** stack, including the
database schema, every REST/WebSocket endpoint, environment configuration, and
deployment options.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Why the Flask → Node.js Migration](#2-why-the-flask--nodejs-migration)
3. [Repository Structure](#3-repository-structure)
4. [Prerequisites](#4-prerequisites)
5. [Local Development Setup](#5-local-development-setup)
6. [Environment Variables](#6-environment-variables)
7. [Database Schema](#7-database-schema)
8. [Authentication & Security](#8-authentication--security)
9. [API Endpoint Reference](#9-api-endpoint-reference)
10. [Real-time (Socket.io) Events](#10-real-time-socketio-events)
11. [Deployment (Vercel / long-running hosts)](#11-deployment-vercel--long-running-hosts)
12. [Performance Optimizations](#12-performance-optimizations)
13. [Testing](#13-testing)
14. [Feature Checklist](#14-feature-checklist)

---

## 1. Overview

DUYS is a **monorepo** containing:

| Directory  | Purpose                                                    |
|------------|------------------------------------------------------------|
| `backend/` | Node.js + Express REST API, Socket.io real-time server, PostgreSQL data layer |
| `frontend/`| React 18 + Vite single-page application (Tailwind CSS, Zustand, React Query) |
| `api/`     | Root Vercel serverless entry that mounts the backend for single-project deploys |
| `vercel.json` | Build/rewrite/header config for the single Vercel project |

The API is mounted under `/api` (or the root) and the frontend is served as a
static build alongside it, so **one Vercel project hosts both** the SPA and the
backend.

## 2. Why the Flask → Node.js Migration

The original product shipped as a **Flask (Python) + SQLite** prototype. It was
rewritten to a **Node.js + PostgreSQL** stack for the following reasons:

1. **Scalability** — SQLite is file-based and single-writer; PostgreSQL supports
   high concurrency, JSONB, transactions, and connection pooling (via `pg`).
2. **One language** — the frontend is React (JavaScript); keeping the backend in
   Node.js lets one developer work across both with shared tooling.
3. **Real-time support** — Socket.io is first-class on Node.js, powering live
   rooms, DMs, typing indicators, and call signaling.
4. **Ecosystem** — mature libraries for auth (JWT), validation (Joi), storage
   (AWS S3 / Cloudflare R2), and crypto (wagmi/viem) all integrate cleanly.
5. **Serverless-friendly** — Express apps deploy seamlessly to Vercel
   serverless functions, keeping hosting costs low.

> The original Flask code is not retained in this repository. This document
> exists to explain *what changed* and to serve as the living architecture guide.

---

## 3. Repository Structure

```
DUYSUPDATE/
├── api/                          # Root Vercel serverless entry
│   └── index.js                  #   Re-exports backend app (single project)
├── backend/                      # Node.js + Express API
│   ├── api/
│   │   └── index.js              #   Vercel entry for a backend-only deploy
│   ├── src/
│   │   ├── app.js                #   Express app: middleware + route mounting
│   │   ├── config/
│   │   │   ├── database.js       #   pg Pool + query helpers / transactions
│   │   │   └── schema*.sql       #   Base schema + migration files
│   │   ├── middleware/
│   │   │   ├── auth.js           #   JWT generate/verify, authenticate, requireAdmin
│   │   │   └── errorHandler.js   #   AppError + central error handler
│   │   ├── routes/               #   One Router per domain (see §9)
│   │   └── services/             #   Business logic per domain
│   ├── package.json
│   └── .env.example              # (see §6)
├── frontend/                     # React + Vite SPA
│   ├── src/
│   │   ├── api/client.js         #   Axios instance (base URL from VITE_API_URL)
│   │   ├── components/           #   Reusable UI (modals, viewers, layout)
│   │   ├── pages/                #   Route pages (Auth, Feed, Wallet, Admin, …)
│   │   ├── stores/               #   Zustand stores (auth, theme, …)
│   │   ├── hooks/                #   Custom hooks (useConfirm, …)
│   │   ├── utils/                #   web3, formatting helpers
│   │   ├── App.jsx / main.jsx    #   Router + entry
│   │   └── index.css             #   Tailwind entry
│   ├── vite.config.js            #   Dev proxy /api → :5000, build output
│   └── package.json
├── vercel.json                   # Single-project build/rewrite config
├── package.json                  # Root workspace (npm workspaces)
└── README.md
```

## 4. Prerequisites

- **Node.js 18+** (frontend build and backend runtime)
- **npm** (workspaces used at the root) or yarn
- **PostgreSQL 13+** with a created database
- (Optional) A **Google Cloud OAuth** app for Google login
- (Optional) **WalletConnect Project ID** for Web3 wallet connection
- (Optional) Cloudflare **R2 / AWS S3** credentials for media uploads

---

## 5. Local Development Setup

The project uses **npm workspaces**, so most commands run from the repo root.

### 5.1 Install dependencies

```bash
# From the repo root — installs backend + frontend
npm install
```

### 5.2 Set up the database

The **merged, idempotent schema** (`backend/src/config/schema-merged.sql`) is
built from `schema.sql` + all migrations by `scripts/build-schema.mjs` and is
applied **automatically** on server boot (see §5.2b). If you prefer to apply it
manually for a fresh database:

```bash
createdb duys_db
psql duys_db < backend/src/config/schema-merged.sql
```

> `schema-merged.sql` is the single, complete, re-runnable schema. The individual
> `schema.sql` / `schema-migration-*` files are kept for reference only.

#### 5.2b Automatic migration on boot

The backend runs the merged schema automatically at startup:

- `backend/src/config/migrate.js` executes `schema-merged.sql` (idempotent)
  inside a transaction and records the applied version in a `schema_migrations`
  table.
- `backend/src/app.js` calls `migrateOnBoot()` before `app.listen()` on the
  long-running server.
- Set `AUTO_MIGRATE=false` in the environment to skip startup migration.
- To migrate manually / in a build step: `npm --workspace backend run migrate`
  (or `cd backend && npm run migrate`).
- To regenerate `schema-merged.sql` after editing a schema file:
  `npm --workspace backend run build:schema`.

### 5.3 Configure environment

```bash
cp backend/.env.example backend/.env   # create if missing (see §6)
cp frontend/.env.example frontend/.env
```

### 5.4 Run the backend

```bash
cd backend
npm run dev          # node --watch src/app.js → http://localhost:5000
```

### 5.5 Run the frontend

In a second terminal:

```bash
cd frontend
npm run dev          # vite → http://localhost:3000
```

The Vite dev server proxies `/api/*` to `http://localhost:5000` (see
`frontend/vite.config.js`), so the frontend can call the API relative to its own
origin during development.

### 5.6 Run from the root (both at once)

```bash
npm run dev          # starts backend + frontend concurrently
```

Health check: `GET http://localhost:5000/health` → `{ "status": "ok" }`.

## 6. Environment Variables

### 6.1 Backend (`.env` in `backend/`)

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string (`postgresql://user:pass@host:5432/duys_db`) | ✅ |
| `JWT_SECRET` | Secret used to sign JWTs. **Never commit a real value.** | ✅ |
| `JWT_EXPIRE` | Access-token lifetime (default `30d`) | |
| `JWT_REFRESH_EXPIRE` | Refresh-token lifetime (default `90d`) | |
| `PORT` | HTTP port (default `5000`) | |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (for Google login) | for Google |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | for Google |
| `HYPELAB_WEBHOOK_SECRET` | HMAC secret for the HypeLab ad webhook | for ad credits |
| `HYPELAB_REWARD_POINTS` | Points rewarded per ad view (default `10`) | |
| `FRONTEND_URL` | Frontend origin used for referral links (falls back to `APP_URL`) | |
| `RTMP_URL` | RTMP ingest URL for live publishing (`rtmp://localhost:1935/live`) | for live |
| `DUYS_CONTRACT_ADDRESS` | DUYS token contract address | for Web3 |
| `USDT_CONTRACT_ADDRESS` | USDT contract address (BSC default used otherwise) | |
| `VAULT_WALLET_ADDRESS` | Wallet that receives swap/deposit funds | for swaps |
| `R2_*` / `S3_*` | Cloudflare R2 / AWS S3 bucket & credentials for media | for uploads |
| `AUTO_MIGRATE` | If `false`, skip applying the schema on boot (default `true`) | |
| `VERCEL` | Set by Vercel; makes `app.js` skip `app.listen()` (serverless) | auto |
| `RUN_MIGRATIONS` | If `1`, force-run migrations when the module is imported (CI use) | |

> ⚠️ A `backend/.env.example` is not included in the repo. Create `backend/.env`
> from the table above, and keep the root shipped `.env.example` for reference.

### 6.2 Frontend (`.env` in `frontend/`)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | API base URL. **Leave empty** in the single-project Vercel deploy so requests use the same origin (`/api`). In local dev it can be `http://localhost:5000`. |
| `VITE_GOOGLE_CLIENT_ID` | Google Identity Services client ID |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect/Reown project ID for Web3 wallet |
| `VITE_HLS_BASE_URL` | Base URL for HLS live-stream playback (no trailing slash; empty = same-origin) |

> Any variable prefixed with `VITE_` is baked into the frontend build, so never
> put secrets there.

## 7. Database Schema

`backend/src/config/schema.sql` is the **base schema** (32 tables) and the
`schema-migration-*.sql` files add **26 more tables** across later phases
(**58 tables total**). All queries use **parameterized statements** (`$1`, `$n`)
to prevent SQL injection, and `pg` connection pooling is managed in
`backend/src/config/database.js` (max 20 connections, 30s idle timeout).

### 7.1 Base tables (`schema.sql`)

| Table | Purpose |
|-------|---------|
| `users` | Accounts, profile, verification, points, flags |
| `follows` | Follow graph |
| `posts` | Text/image/video/poll/article posts |
| `media` | Uploaded media metadata |
| `likes` | Post likes |
| `comments` / `comment_likes` | Comments + their likes |
| `post_unlocks` | Paid unlocks of exclusive posts |
| `poll_options` / `poll_votes` | Polls + votes |
| `link_previews` | OpenGraph previews for URLs in post bodies |
| `hashtags` / `post_hashtags` | Hashtag index |
| `stories` / `story_views` / `story_reactions` | Ephemeral stories |
| `rooms` / `room_messages` | Live rooms + chat |
| `channels` / `channel_subscriptions` / `channel_members` | Channels |
| `conversations` / `messages` | 1:1 direct messaging |
| `notifications` | In-app notifications |
| `verifications` | Email/phone/ID verification codes |
| `transactions` | Ledger for deposits/withdrawals |
| `wallet_addresses` | Connected Web3 wallets |
| `boosts` | Promoted posts |
| `referrals` | Referral tracking |
| `reports` | User/comment/post reports |
| `admin_logs` / `feature_flags` | Admin audit + feature toggles |

### 7.2 Migration tables (later phases)

| File | Tables added | Purpose |
|------|--------------|---------|
| `schema-migration-auth-2fa.sql` | `app_config` | App-level config (Google toggle, announcement) |
| `schema-migration-posts-depth.sql` | `post_views` | Deduped post view counting |
| `schema-migration-social-depth.sql` | `message_reactions`, `message_pins`, `conversation_blocks`, `conversation_mutes`, `group_conversations`, `group_members`, `group_messages`, `group_message_reactions`, `channel_mutes`, `channel_verifications`, `group_verifications`, `room_speakers`, `room_hearts`, `calls`, `call_signals` | Social depth (group DMs, reactions, calls) |
| `schema-migration-economy.sql` | `point_ledger`, `ad_views`, `hypelab_events`, `token_claims`, `tips`, `shop_listings`, `shop_purchases`, `swaps` | Point economy, ad rewards, shop, swaps |
| `schema-migration-admin-depth.sql` | `verification_requests` | Badge / face / ID review queue |

### 7.3 Data-access helpers

`backend/src/config/database.js` exports:

- `query(text, params)` → runs a query, logs, returns the `pg` result
- `queryOne(...)` → first row or `undefined`
- `queryAll(...)` → all rows
- `transaction(callback)` → `BEGIN` / `COMMIT` / `ROLLBACK` with a per-client pool connection

## 8. Authentication & Security

### 8.1 Auth flow

1. **Register** (`POST /auth/register`) creates a user, hashes the password with
   `bcryptjs`, and returns `user + accessToken + refreshToken`.
2. **Login** (`POST /auth/login`) verifies credentials and returns JWTs. If the
   user has 2FA enabled, it returns `twofaRequired: true` plus a signed
   `challengeToken` instead.
3. **2FA challenge** (`POST /auth/2fa/challenge`) validates the TOTP code and
   returns the JWTs.
4. **Google login** (`POST /auth/google`) verifies the Google Identity Services
   `credential` against Google's `tokeninfo` endpoint — the server never trusts
   a client-supplied `googleId`/`email` blindly.

### 8.2 Tokens

- **Access token** — JWT signed with `JWT_SECRET`, payload `{ userId, email }`,
  lifetime `JWT_EXPIRE` (default **30d**).
- **Refresh token** — JWT signed with `JWT_SECRET`, payload `{ userId }`,
  lifetime `JWT_REFRESH_EXPIRE` (default **90d**).
- The `authenticateJWT` middleware reads the `Authorization` header (with or
  without `Bearer `), verifies the token, and sets `req.user` / `req.userId`.
- `requireAdmin` additionally checks `users.is_admin` for `/admin/*` routes.

### 8.3 Security controls

- **JWT auth** with expiration on all protected routes
- **Password hashing** with `bcryptjs`
- **SQL injection** prevented via parameterized queries (`pg`)
- **XSS** mitigation with `sanitize-html` on post/comment bodies
- **Input validation** with **Joi** schemas on every route
- **Helmet** sets secure HTTP headers
- **CORS** enabled for cross-origin dev
- **Rate limiting hooks** ready for CDN/proxy enforcement
- **Sensitive column stripping** — user objects returned to the client have
  `password_hash` / `twofa_secret` removed
- **HMAC-verified webhooks** for the HypeLab rewarded-ad callback
- **S2S best practices** — Google credentials verified server-side

## 9. API Endpoint Reference

All protected endpoints require an `Authorization: Bearer <accessToken>` header
(unless marked **public**). Responses are JSON. `:id` / `:userId` params are
integer IDs.

> **Route mounting (`backend/src/app.js`):** public routes are
> `/auth`, `/verify`, and the HypeLab webhook under `/economy`. Everything else
> is behind `authenticateJWT`, and `/admin/*` additionally requires `requireAdmin`.

### 9.1 Auth — `/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | public | Create account (body: email, username, password, displayName, referralCode?) |
| POST | `/login` | public | Login (email, password) → JWTs or `twofaRequired` |
| POST | `/google` | public | Google Identity Services login (credential JWT, referralCode?) |
| POST | `/refresh` | public | Refresh access token |
| POST | `/logout` | public | Logout |
| GET | `/config` | public | App config (googleEnabled, announcement) |
| POST | `/2fa/challenge` | public | Verify TOTP against a 2FA challenge token |
| POST | `/2fa/setup` | ✅ | Generate TOTP secret + QR |
| POST | `/2fa/enable` | ✅ | Enable 2FA (secret, code) |
| POST | `/2fa/disable` | ✅ | Disable 2FA |

### 9.2 Users — `/users`

| Method | Path | Description |
|--------|------|-------------|
| PATCH | `/me/password` | Change password (currentPassword, newPassword) |
| PATCH | `/me/privacy` | Privacy settings (isPrivate, whoCanMessage, showOnlineStatus) |
| PATCH | `/me/notifications` | Per-type notification preferences |
| GET | `/me/notifications/preferences` | Current notification preferences |
| GET | `/me/blocked` | List blocked users |
| POST | `/:userId/block` | Block a user |
| DELETE | `/:userId/block` | Unblock a user |
| PATCH | `/me` | Update profile (displayName, avatarUrl, bannerUrl, profileSlug, …. ) |
| GET | `/me` | Current user profile |
| GET | `/:userId` | User public profile |
| POST | `/:userId/follow` | Follow a user |
| DELETE | `/:userId/follow` | Unfollow a user |
| GET | `/:userId/followers` | Follower list (`limit`, `offset`) |
| GET | `/:userId/following` | Following list (`limit`, `offset`) |
| GET | `/search?q=` | Search users (min 2 chars) |
| GET | `/suggestions` | Follow suggestions |

### 9.3 Posts — `/posts`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Create post (kind, body, title, channelId, isExclusive, unlockPrice, scheduledAt, pollOptions, mediaUrl…) |
| GET | `/:postId` | Get a post |
| PATCH | `/:postId` | Update post (author) |
| DELETE | `/:postId` | Delete post (author) |
| POST | `/:postId/like` | Like a post |
| DELETE | `/:postId/like` | Unlike a post |
| POST | `/:postId/comments` | Comment (body) |
| GET | `/:postId/comments` | Post comments (`limit`, `offset`) |
| POST | `/:postId/repost` | Repost / share |
| POST | `/:postId/quote` | Quote a post (body) |
| POST | `/report` | Report content (entityType, entityId, reason, description?) |
| POST | `/:postId/view` | Record a deduped post view |
| POST | `/:postId/vote` | Cast a poll vote (optionId) |
| POST | `/:postId/unlock` | Pay DUYS to unlock an exclusive post |
| POST | `/:postId/pin` | Pin a post to your profile |
| DELETE | `/:postId/pin` | Unpin a post |
| POST | `/media` | Upload media (multipart `media`) → url/key |
| DELETE | `/media/:mediaId` | Delete media (body: key) |

### 9.4 Feed — `/feed`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/for-you` | Personalized feed (`limit`, `beforeId`) |
| GET | `/following` | Following feed |
| GET | `/channel/:channelId` | Channel feed |
| GET | `/trending` | Trending posts |
| GET | `/hashtags` | Trending hashtags (`q` prefix filter) |
| GET | `/hashtag/:tag` | Posts by hashtag |
| GET | `/top-verified` | Top verified users |
| GET | `/live-users` | Followed users hosting live now |
| GET | `/user/:userId` | A user's posts (profile feed) |

### 9.5 Stories — `/stories`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Create story (multipart `media` **or** JSON `{ mediaUrl, mediaKey, mediaKind, caption }`); expires in 24h |
| GET | `/` | Story feed from followed users + self (`limit`, `offset`) |
| GET | `/:storyId` | Get a single active story |
| DELETE | `/:storyId` | Soft-delete story + remove R2 file (author) |
| POST | `/:storyId/view` | Record a story view (idempotent) |
| POST | `/:storyId/react` | Add/update emoji reaction |
| DELETE | `/:storyId/react` | Remove reaction |
| GET | `/:storyId/reactions` | Aggregated reactions |

### 9.6 Live — `/live`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Create live room → RTMP stream key |
| GET | `/` | Active rooms by viewers (`limit`, `offset`) |
| GET | `/:roomId` | Room detail + viewer count |
| POST | `/:roomId/end` | End stream (host only) |
| POST | `/:roomId/join` | Track viewer join |
| POST | `/:roomId/leave` | Track viewer leave |
| GET | `/:roomId/messages` | Room chat (`limit`, `beforeId`) |
| POST | `/:roomId/heart` | Send a heart to the host |
| GET | `/:roomId/hearts` | Current hearts count |
| POST | `/:roomId/speak` | Request / accept / remove speaker (action, targetUserId?) |
| GET | `/:roomId/speakers` | List current speakers |

### 9.7 Messaging — `/messaging`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List conversations (`limit`, `offset`) |
| GET | `/unread-count` | Total unread direct messages |
| GET | `/:userId` | Get (or create) a conversation with a user |
| GET | `/:conversationId/messages` | Conversation messages (`limit`, `beforeId`) |
| POST | `/:conversationId/message` | Send a message (body) |
| PATCH | `/messages/:messageId` | Edit a message (sender) |
| DELETE | `/messages/:messageId` | Soft-delete a message (sender) |
| POST | `/:conversationId/read` | Mark conversation as read |
| POST | `/:conversationId/messages/:messageId/react` | Toggle emoji reaction |
| POST | `/messages/:messageId/pin` | Pin a message |
| DELETE | `/messages/:messageId/pin` | Unpin a message |
| GET | `/conversations/:conversationId/pins` | Pinned messages |
| GET | `/:conversationId/media` | Shared media in a conversation |

**Group DMs:**

| Method | Path | Description |
|--------|------|-------------|
| GET / POST | `/groups` | List / create groups |
| GET | `/groups/unread` | Total unread group messages |
| GET | `/groups/:groupId` | Group detail |
| POST | `/groups/join/:inviteToken` | Join by invite |
| POST | `/groups/:groupId/regen-invite` | Regenerate invite (admin) |
| POST | `/groups/:groupId/members/:targetId/promote` | Promote to admin |
| POST | `/groups/:groupId/members/:targetId/demote` | Demote admin |
| DELETE | `/groups/:groupId/members/:targetId` | Remove member |
| DELETE | `/groups/:groupId/leave` | Leave group |
| GET | `/groups/:groupId/members` | Member list |
| GET | `/groups/:groupId/messages` | Group messages (`limit`, `beforeId`) |
| POST | `/groups/:groupId/message` | Send a group message |
| POST | `/groups/:groupId/messages/:messageId/react` | React to a group message |
| POST | `/groups/:groupId/mute` | Mute group |
| DELETE | `/groups/:groupId/mute` | Unmute group |

### 9.8 Channels — `/channels`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Create channel (name, handle, description, isPrivate) |
| GET | `/` | Public channels by subscribers |
| GET | `/:channelId` | Channel detail + subscribe state |
| PATCH | `/:channelId` | Update channel (owner/moderator) |
| DELETE | `/:channelId` | Delete channel (owner) |
| POST | `/:channelId/subscribe` | Subscribe |
| DELETE | `/:channelId/subscribe` | Unsubscribe |
| GET | `/:channelId/posts` | Channel posts feed |
| POST | `/:channelId/mute` | Mute channel |
| DELETE | `/:channelId/mute` | Unmute channel |
| POST | `/:channelId/broadcast` | Broadcast announcement post (owner) |
| GET | `/:channelId/subscribers` | Subscriber list |
| POST | `/:channelId/apply-verify` | Apply for channel verification |
| POST | `/:channelId/self-verify` | Self-verify channel |
| DELETE | `/:channelId/self-verify` | Remove self-verification |
| GET | `/verifications` | List channel verification requests |
| POST | `/verifications/:id/review` | Review a request (status, badge) |

### 9.9 Wallet — `/wallet`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/balance` | DUYS + USD balances |
| GET | `/transactions` | Transaction history (`limit`, `beforeId`) |
| POST | `/deposit` | Initiate crypto deposit (amountUsd, paymentMethod) |
| POST | `/deposit/confirm` | Confirm a pending deposit (transactionId) |
| POST | `/withdraw` | Initiate withdrawal (amount, walletAddress) |
| POST | `/swap` | Swap USD/USDT ↔ DUYS (fromAsset, toAsset, amount) |
| POST | `/connect` | Connect a Web3 wallet (walletAddress, blockchain) |
| POST | `/tip` | Send a tip (toUserId, amount, message?, useDuys?) |
| GET | `/tips` | Recent tips sent/received |
| GET | `/claims` | Token claim stats |
| GET | `/shop/:username` | Creator shop page for a seller |
| POST | `/shop/listings` | Create a shop listing (verified sellers) |
| POST | `/shop/listings/:id/toggle` | Toggle listing active/inactive |
| DELETE | `/shop/listings/:id` | Delete a listing |
| POST | `/shop/purchases/:listingId` | Buy a listing with DUYS |

### 9.10 Economy — `/economy`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/points` | Points balance + ledger |
| GET | `/referral` | Referral info |
| GET | `/leaderboard` | Leaderboard (top 100) |
| GET | `/earn` | Claim info + ad stats |
| POST | `/earn/claim` | Claim earned tokens |
| POST | `/earn/ad-webhook` | **Public** HypeLab reward webhook (HMAC-verified) |
| GET | `/swap/config` | Swap config/rates |
| POST | `/swap/quote` | Get a swap quote (side, amount) |
| POST | `/swap` | Start a swap (side, amount, depositTx) |
| POST | `/swap/:id/settle` | Settle a swap (depositTx) |
| GET | `/boost/rate` | Current boost rate |
| POST | `/boost` | Boost a post (postId, days, geo, audience, cta, …) |

### 9.11 Notifications — `/notifications`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Notifications, unread first (`limit`, `offset`) |
| GET | `/unread` | Unread count + latest preview |
| PATCH | `/:notificationId/read` | Mark one as read |
| POST | `/read-all` | Mark all as read |
| DELETE | `/:notificationId` | Delete one (owner) |

### 9.12 Calls — `/calls`

Call signaling is **relayed only** (WebRTC offer/answer/ICE pass through the
server; media is peer-to-peer).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Initiate call (conversationId? or roomId?, kind) |
| POST | `/:callId/accept` | Accept (→ active) |
| POST | `/:callId/decline` | Decline (→ declined) |
| POST | `/:callId/end` | End (→ ended) |
| POST | `/:callId/signal` | Relay a WebRTC signal (to, signal) |
| POST | `/:callId/ring` | Ring callees |
| GET | `/:callId/ping` | Call status |

### 9.13 Verification — `/verify`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/email/send` | public | Send email verification code |
| POST | `/email/verify` | public | Confirm email code |
| POST | `/phone/send` | public | Send phone/SMS code |
| POST | `/phone/verify` | public | Confirm phone code |
| POST | `/id/upload` | ✅ | Upload ID/face for verification (multipart) |
| GET | `/status` | ✅ | Current verification statuses |
| POST | `/badge/request` | ✅ | Request a verified badge (blue/gold/grey) by spending points |

### 9.14 Admin — `/admin` (requires `is_admin`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard` | Platform overview stats |
| GET | `/users` | List users with moderation flags |
| GET | `/users/:userId` | Full user details + history |
| PATCH | `/users/:userId/ban` | Ban user (soft-deletes posts) |
| PATCH | `/users/:userId/unban` | Restore user |
| PATCH | `/users/:userId/economy` | Credit/debit points and/or DUYS |
| PATCH | `/users/:userId/admin` | Grant/revoke admin |
| GET | `/reports` | List reports (status filter) |
| GET | `/reports/:reportId` | Report details |
| PATCH | `/reports/:reportId` | Resolve a report (approved/rejected/warned) |
| GET | `/analytics` | DAU, signups, revenue, token volume, top creators |
| GET | `/verifications` | Badge/face/id verification requests |
| PATCH | `/verifications/:id` | Approve or reject a verification request |

### 9.15 Misc

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | public | Health check → `{ status: "ok", timestamp }` |

## 10. Real-time (Socket.io) Events

Socket.io is attached **only** in the long-running server mode (skipped on
Vercel). Clients authenticate via `socket.handshake.auth.token` (JWT).

### 10.1 Client events (emitted by the client)

| Event | Payload | Effect |
|-------|---------|--------|
| `live:join` / `live:leave` | roomId | Join/leave a live room channel |
| `channel:join` / `channel:leave` | channelId | Join/leave a channel |
| `call:join` / `call:leave` | callId | Join/leave a call room |
| `dm:join` / `dm:leave` | conversationId | Join/leave a DM conversation |
| `group:join` / `group:leave` | groupId | Join/leave a group |
| `dm:typing` / `dm:stopTyping` | { conversationId, recipientId } | Typing indicator |
| `group:typing` | { groupId, isTyping } | Group typing indicator |
| `room:mute` | { channelId } | Local channel mute echo |

### 10.2 Server events (received by the client)

| Event | Payload | Emitted when |
|-------|---------|--------------|
| `dm:message` | message | A DM is sent/edited |
| `dm:delete` | { id, conversation_id } | A DM is deleted |
| `dm:typing` | { conversationId, userId, isTyping } | A DM peer is typing |
| `live:ended` | { roomId } | A live room ends |
| `live:viewers` | { roomId, viewerCount } | A viewer joins/leaves |
| `live:heart` | { roomId, userId, total } | A heart is sent |
| `live:speak-request` / `live:speak-accepted` | { roomId, userId } | Speaker request flow |
| `group:typing` | { groupId, userId, isTyping } | Group peer typing |
| `call:incoming` | { callId, callerId, kind, … } | Incoming call |
| `call:ring` | { callId } | Ring notification |
| `call:signal` | { from, callId, signal } | WebRTC signal relay |
| `call:ended` | { callId } | Call ended |

Rooms/channels used: `user:<id>`, `room:<id>`, `channel:<id>`, `conversation:<id>`,
`group:<id>`, `call:<id>`.

---

## 11. Deployment (Vercel / long-running hosts)

### 11.1 Single Vercel project (current setup)

`vercel.json` builds the frontend and serves it alongside the backend from the
**same** project/domain:

- **Build command**: `npm run build:frontend` (writes to `frontend/dist`)
- **Output**: `frontend/dist` (static assets)
- **Serverless**: `api/index.js` → mounts the Express app under `/api` and `/`
- **Rewrites**: `/api(/.*)?` → the function; everything else → `/index.html`
- **Root directory must stay at the repo root** when importing to Vercel

The backend `app.js` detects the `VERCEL` env and skips `app.listen()`; the
serverless function (`api/index.js` → `backend/api/index.js`) handles the
request lifecycle instead.

Deploy with a normal `git push` — Vercel picks up the changes automatically.

### 11.2 SQLite → PostgreSQL on Vercel

Set `DATABASE_URL` to a hosted PostgreSQL instance (Neon, Supabase, Railway,
Render, AWS RDS). **Do not** rely on the serverless filesystem for persistence.

### 11.3 Long-running hosts (for real-time)

> ⚠️ Vercel serverless functions **cannot hold WebSocket connections**, so the
> Socket.io real-time features (live chat, presence, typing, call signaling)
> require a long-running host such as **Render, Fly.io, or Railway**.

- Backend start command: `npm --workspace backend run start` (`node src/app.js`)
- Ensure `PORT` is provided by the platform
- Point the frontend's `VITE_API_URL` to the backend origin

### 11.4 Media storage

Uploads go to object storage (Cloudflare **R2** / AWS **S3**) via
`backend/src/services/storage.js` (`uploadPublic`, `deletePublic`,
`uploadVerification`, `deleteVerification`). Configure bucket/credentials via
the R2/S3 environment variables.

---

## 12. Performance Optimizations

- **Connection pooling** (`pg` Pool, max 20, idle 30s) avoids per-request connection cost
- **Cursor pagination** (`beforeId`) on feeds and message history
- **Deduped views** — `post_views` / `story_views` count a view once per user
- **Selective loading** — heavy dependencies (Socket.io side-effects, swap/shop
  services) are `await import()`-ed only when needed, keeping the serverless
  bundle and cold-start small
- **Sensitive data stripped** from API responses to reduce payload size/leakage
- **Cache-Control** for immutable `/assets/*` (static build)
- (Opportunity) Vite has **no manual chunking** — the main bundle is large
  (several MB). Consider dynamic imports for `wagmi`/`viem`/web3-modal and
  `hls.js` to shrink the initial load.

---

## 13. Testing

The README documents `npm test`, but **no test scripts or suites are configured
yet** in either `backend/package.json` or `frontend/package.json`. This is a
documented gap — see the roadmap in `README.md`.

Local validation commands currently available:

```bash
npm run lint                          # frontend ESLint
npm --workspace frontend run build    # production build sanity check
npm --workspace backend run dev       # start backend (requires DB)
```

## 14. Feature Checklist

| Feature | Status |
|---------|--------|
| Auth (email/password, Google, JWT refresh) | ✅ |
| Two-factor authentication (TOTP) | ✅ |
| Users, profiles, follow/unfollow, suggestions, search | ✅ |
| Posts (text/image/video/poll/article), likes, comments, repost, quote | ✅ |
| Exclusive/scheduled posts (verified creators) + paid unlocks | ✅ |
| Feeds (for-you, following, trending, channel, hashtag, user) | ✅ |
| Hashtags & link previews | ✅ |
| Stories (24h, views, emoji reactions) | ✅ |
| Live rooms (RTMP key, viewers, chat, hearts, speakers) | ✅ |
| Direct messaging (1:1 + groups, reactions, pins, media, typing) | ✅ |
| Channels (subscribe, mute, broadcast, verification) | ✅ |
| Wallet (DUYS/USD balances, deposits, withdrawals, swaps, tips) | ✅ |
| Web3 wallet connect (WalletConnect / MetaMask) | ✅ |
| Economy (points, referral, leaderboard, earn/claim, boosts, ad webhook) | ✅ |
| Creator shop (listings, purchases) | ✅ |
| Notifications (in-app, unread preview) | ✅ |
| Voice/video calls (WebRTC signaling relay) | ✅ |
| Verification (email, phone, ID/face, badges) | ✅ |
| Reports & moderation | ✅ |
| Admin dashboard, users, economy, analytics, verifications | ✅ |
| Real-time Socket.io events | ✅ (long-running host only) |
| Automated tests | 🔲 (not yet configured) |
| S3/R2 media uploads | ✅ |
| Web3 token swap on-chain settlement | 🚧 (staged via depositTx) |

---

## Appendix A — Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite 5, React Router 6, Zustand, TanStack React Query, Tailwind CSS, hls.js, wagmi/viem, @web3modal/wagmi |
| **Backend** | Node.js, Express 4, JWT (jsonwebtoken), Joi, bcryptjs, multer, otplib/qrcode, socket.io, pg, sanitize-html, AWS S3/R2 |
| **Database** | PostgreSQL 13+ (58 tables) |
| **Hosting** | Vercel (serverless + static), Render/Fly.io/Railway for real-time |

---

**Last Updated:** 2026-09-07
**Migration:** Flask + SQLite → Node.js + PostgreSQL
**Status:** Core + Phase 2/3/4 social & economy features live; tests pending