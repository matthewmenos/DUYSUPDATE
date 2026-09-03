# DUYS - Social Media Platform

A modern social media platform similar to TikTok with Web3/crypto integration, built with **Node.js + React + PostgreSQL**.

> **Note:** This is a complete rewrite from the original Flask + SQLite version. See [MIGRATION_README.md](MIGRATION_README.md) for full architecture details, setup instructions, and API documentation.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 13+
- npm or yarn

### Setup

**1. Backend Setup**
```bash
cd backend
npm install
createdb duys_db
psql duys_db < src/config/schema.sql
cp .env.example .env
# Edit .env with your configuration
npm run dev
```

Backend runs on `http://localhost:5000`

**2. Frontend Setup** (in new terminal)
```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with your configuration
npm run dev
```

Frontend runs on `http://localhost:3000`

## 📁 Project Structure

```
DUYSUPDATE/
├── backend/                 # Node.js + Express API
│   ├── src/
│   │   ├── app.js
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── routes/
│   │   └── services/
│   ├── package.json
│   └── .env.example
│
├── frontend/                # React + Vite SPA
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── stores/
│   │   ├── api/
│   │   └── index.css
│   ├── package.json
│   └── .env.example
│
└── MIGRATION_README.md      # Complete documentation
```

## 🎯 Features

### Authentication ✅
- Email/password registration & login
- Google OAuth integration
- JWT tokens with refresh
- Persistent authentication

### Social ✅
- Follow/unfollow users
- User profiles & discovery
- Search functionality

### Content ✅
- Create, read, update, delete posts
- Like posts & comments
- Repost & quote posts
- Infinite scroll feeds

### Feed Algorithms ✅
- For You personalized feed
- Following feed
- Trending posts
- Hashtag search

### UI/UX ✅
- Dark theme design
- Responsive layout
- Real-time notifications (ready)
- Toast alerts

## 🔧 Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite, React Router, Zustand, Tailwind CSS |
| **Backend** | Node.js, Express, JWT, Joi, bcryptjs |
| **Database** | PostgreSQL with 40+ tables |
| **State** | Zustand + React Query |
| **Styling** | Tailwind CSS |
| **API** | REST with JSON |

## 📚 Documentation

Full documentation available in [MIGRATION_README.md](MIGRATION_README.md):
- Architecture overview
- API endpoints reference
- Database schema
- Environment configuration
- Deployment instructions
- Security features
- Performance optimizations

## 🔐 Security Features

- ✅ JWT authentication with expiration
- ✅ SQL injection prevention (parameterized queries)
- ✅ XSS protection (HTML sanitization)
- ✅ CORS configuration
- ✅ Rate limiting ready
- ✅ Secure password hashing

## 📊 API Overview

### Authentication
- `POST /auth/register` - Create account
- `POST /auth/login` - Login
- `POST /auth/google` - Google OAuth

### Users
- `GET /users/me` - Current user
- `GET /users/:userId` - User profile
- `PATCH /users/me` - Update profile
- `POST /users/:userId/follow` - Follow user

### Posts
- `POST /posts` - Create post
- `GET /posts/:postId` - Get post
- `POST /posts/:postId/like` - Like post
- `POST /posts/:postId/comments` - Comment

### Feed
- `GET /feed/for-you` - Personalized feed
- `GET /feed/following` - Following feed
- `GET /feed/trending` - Trending posts

See [MIGRATION_README.md](MIGRATION_README.md) for complete API documentation.

## 🚢 Deployment

Both frontend and backend deploy to **a single Vercel project** (see
[deployment docs](MIGRATION_README.md#6-deployment-vercel--single-project)):

- `vercel.json` builds the frontend (`frontend/dist`) and serves it statically
- The backend runs as a serverless function from the root `api/index.js`
- `/api/*` routes to the backend; everything else falls back to the SPA
- **Root Directory must stay at the repository root** when importing to Vercel

```bash
# Push to production — Vercel handles the rest
git push
```

> ⚠️ Serverless functions cannot hold WebSocket connections, so Socket.io
> real-time features need a long-running host (Render/Fly.io/Railway) or a
> polling fallback in fully serverless deployments.

## 🧪 Testing

```bash
# Backend
cd backend
npm test

# Frontend
cd frontend
npm test
```

## 📝 Environment Variables

**Backend** (`.env`):
```
DATABASE_URL=postgresql://user:password@localhost:5432/duys_db
JWT_SECRET=your-secret-key
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

**Frontend** (`.env`):
```
VITE_API_URL=http://localhost:5000
VITE_GOOGLE_CLIENT_ID=...
```

See `.env.example` files for complete lists.

## 🛣️ Roadmap

### Phase 2 (Current)
- [ ] Stories (upload, view, reactions)
- [ ] Live streaming rooms
- [ ] Direct messaging
- [ ] Wallet integration
- [ ] Admin dashboard
- [ ] Notifications system

### Phase 3
- [ ] Real-time features (WebSocket)
- [ ] File uploads (S3/R2)
- [ ] Web3 integration
- [ ] Advanced analytics

## 🤝 Contributing

Contributions welcome! Please follow existing code style and add tests for new features.

## 📄 License

MIT

## 📞 Support

For issues or questions, please open a GitHub issue.

---

**Last Updated:** 2026-09-01  
**Status:** Production Ready (Core Features)  
**Database:** PostgreSQL 13+  
**Node Version:** 18+