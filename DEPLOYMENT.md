# Deployment Guide

## Deploy to Vercel (Recommended)

### Quick Deploy
1. Push your code to GitHub
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import your repository
4. Vercel will auto-detect Next.js - click Deploy
5. Your dashboard will be live in ~2 minutes!

### Using Vercel CLI
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Deploy to production
vercel --prod
```

## Environment Variables

If you plan to connect a real Discord bot later, add these in Vercel:

- `DISCORD_WEBHOOK_URL` - Your Discord webhook URL
- `DISCORD_BOT_TOKEN` - Your bot token
- `NEXT_PUBLIC_API_URL` - Your API endpoint (if applicable)

## Build Details

- **Framework**: Next.js 15
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm install`
- **Development Command**: `npm run dev`

## Performance

The dashboard is fully static and optimized:
- All pages pre-rendered at build time
- ~102 KB shared JavaScript bundle
- ~123 KB max page load (Content Ideas page)
- Perfect for showcasing to clients

## Custom Domain

1. Go to your Vercel project settings
2. Click on "Domains"
3. Add your custom domain
4. Update your DNS records as instructed

## Post-Deployment

After deployment, share the URL with your client to showcase:
- Modern, clean UI with dark mode
- Interactive content ideas chat
- Analytics dashboard
- Trending topics and FAQs
- Responsive mobile design




## Database: pgvector and embeddings (RAG)

Run this SQL in your Postgres (Supabase) project to enable vector search and store embeddings for `embedded_knowledge_base`:

```sql
-- 1) Enable pgvector extension (run once per database)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2) Add vector column sized to your embedding model
--   Use 1536 for OpenAI text-embedding-3-small/large; adjust if you pick another model
ALTER TABLE IF EXISTS embedded_knowledge_base
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 3) Create HNSW index for efficient approximate nearest neighbor search (cosine)
CREATE INDEX IF NOT EXISTS idx_embedded_kb_embedding_hnsw
ON embedded_knowledge_base USING hnsw (embedding vector_cosine_ops);

-- 4) Optional: additional filter index to combine metadata filtering + ANN
CREATE INDEX IF NOT EXISTS idx_embedded_kb_parent_title
ON embedded_knowledge_base (parent, title);
```

If you change embedding models later, you may need to recreate the column with the correct dimension.
