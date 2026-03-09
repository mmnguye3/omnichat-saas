# OmniChat SaaS - Deployment Guide

## Overview

Multi-channel messaging platform (like respond.io) that you can sell as a SaaS.

## Tech Stack

- **Frontend:** Plain HTML/JS (in `/client`)
- **Backend:** Cloudflare Workers (or Vercel)
- **Database:** Supabase (PostgreSQL)
- **Payments:** Stripe
- **Auth:** Supabase Auth

## Quick Start (Development)

```bash
# 1. Clone and install
cd omnichat-saas
npm install

# 2. Set up Supabase
# - Create a new project at supabase.com
# - Run schema.sql in the SQL editor

# 3. Set environment variables
cp .env.example .dev.vars

# 4. Run locally
npm run dev
```

## Production Deployment

### 1. Supabase Setup

1. Create project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run `schema.sql`
3. Get your `SUPABASE_URL` and create a service role key

### 2. Stripe Setup

1. Create Stripe account
2. Create 3 products (Starter, Pro, Agency) with prices
3. Get price IDs for each
4. Create webhook endpoint and get secret
5. Enable webhook events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

### 3. Deploy to Cloudflare Workers

```bash
# Install Wrangler
npm install -g wrangler

# Login
wrangler login

# Create D1 database
wrangler d1 create omnichat-db

# Update wrangler.toml with database ID

# Set secrets
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put STRIPE_STARTER_PRICE_ID
wrangler secret put STRIPE_PRO_PRICE_ID
wrangler secret put STRIPE_AGENCY_PRICE_ID

# Deploy
npm run deploy
```

### 4. Or Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Set environment variables in Vercel dashboard
# SUPABASE_URL, SUPABASE_SERVICE_KEY, STRIPE_*, APP_URL

# Deploy
vercel --prod
```

## Configuration

### Pricing Tiers

| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | 1 channel, 100 contacts |
| Starter | $29/mo | 3 channels, 1,000 contacts |
| Pro | $79/mo | 10 channels, 10,000 contacts |
| Agency | $199/mo | Unlimited everything |

### Channel Setup

**Telegram:**
1. Create bot via @BotFather
2. Get bot token
3. Add webhook: `https://your-api.workers.dev/api/webhooks/telegram`

**WhatsApp:**
1. Set up WhatsApp Business API (Meta)
2. Add webhook URL

**Discord:**
1. Create Discord bot
2. Add bot to server
3. Use bot token

## Frontend Integration

Update the frontend to call your API:

```javascript
const API_BASE = 'https://your-api.workers.dev/api';

// Auth
const { data: { session } } = await supabase.auth.signInWithPassword({
  email, password
});

// Get channels
const response = await fetch(`${API_BASE}/channels`, {
  headers: { Authorization: `Bearer ${session.access_token}` }
});
```

## Files

```
omnichat-saas/
├── api/
│   └── index.js       # All API routes
├── schema.sql         # Database schema
├── wrangler.toml      # Cloudflare config
├── package.json
└── README.md
```

## To Sell

1. **White-label:** Remove "OmniChat" branding, add your logo
2. **Custom domains:** Point customer domains to your app
3. **Onboarding:** Add setup wizard for connecting channels
4. **Support:** Add knowledge base / help docs
5. **Legal:** Terms of Service, Privacy Policy, DPA

## Roadmap

- [ ] Real-time (Supabase Realtime)
- [ ] Chat widgets for customer websites
- [ ] Email integration
- [ ] SMS/MMS
- [ ] AI auto-responses
- [ ] Reporting/analytics
- [ ] Mobile app
