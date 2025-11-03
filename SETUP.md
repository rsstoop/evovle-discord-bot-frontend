# Database Setup Instructions

This dashboard is now connected to Supabase for data storage. Follow these steps to complete the setup.

## 1. Environment Variables Setup

Create a `.env.local` file in the root directory of your project with the following variables:

```env
# Supabase Configuration
# Get these from your Supabase project dashboard: https://supabase.com/dashboard
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Dashboard Password Protection
# Set a secure password to protect access to your dashboard
DASHBOARD_PASSWORD=your_secure_password_here

# Domain Configuration (optional - defaults provided)
# Dashboard domain - requires password authentication
DASHBOARD_DOMAIN=evolve-dashboard.stoopdynamics.com
# Public docs domain - no authentication required
DOCS_DOMAIN=docs-evolve.stoopdynamics.com

# OpenAI API Configuration (optional)
# This is used server-side only and is NEVER exposed to the browser
OPENAI_API_KEY=your_openai_api_key_here
```

### Getting Supabase Credentials:

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Create a new project or select an existing one
3. Navigate to **Settings** → **API**
4. Copy your **Project URL** (for `NEXT_PUBLIC_SUPABASE_URL`)
5. Copy your **anon/public** key (for `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

### Setting Dashboard Password:

- Choose any secure password you want
- This will be stored in plain text in your `.env.local` file
- Never commit `.env.local` to version control

## 2. First Run

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Navigate to `http://localhost:3000`
3. You'll be redirected to the login page
4. Enter your `DASHBOARD_PASSWORD` to access the dashboard

## 3. Database Connection

The Supabase client is configured in `lib/supabase.ts` and ready to use. You can import it in any component:

```typescript
import { supabase } from '@/lib/supabase'

// Example query
const { data, error } = await supabase
  .from('your_table')
  .select('*')
```

## 4. Next Steps

Tell me which tables you want to connect to, and I'll help you integrate them into your dashboard!


