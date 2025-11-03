# Discord Ecom Dashboard

A modern Next.js dashboard for managing a Discord ecommerce community help bot. Built with React, TypeScript, and shadcn/ui components.

## 🔗 Live Demo

**Production**: https://shaun-eng-ecom-community-evolve-91qrtzkns.vercel.app

## Features

- **Database Integration**: Connected to Supabase for persistent data storage
- **Password Protection**: Secure single-user dashboard access
- **Analytics Dashboard**: Track community metrics, active members, and engagement rates
- **Content Ideas**: AI-powered chat interface to brainstorm content based on trending community topics
- **Trending Topics**: View hot discussions and frequently asked questions
- **Settings**: Configure bot behavior and API integrations
- **Dark Mode**: Modern monochrome design with green accents
- **Responsive**: Mobile-first design with collapsible sidebar

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables (see [SETUP.md](./SETUP.md) for detailed instructions):
```bash
# Create .env.local file
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
DASHBOARD_PASSWORD=your_secure_password_here
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser
5. Login with your dashboard password to access the dashboard

## Tech Stack

- **Next.js 15**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **shadcn/ui**: High-quality React components
- **Lucide Icons**: Beautiful icon set
- **Supabase**: PostgreSQL database with real-time capabilities

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/discord-ecom-dashboard)

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new).

## Project Structure

```
├── app/
│   ├── analytics/      # Analytics page
│   ├── settings/       # Settings page
│   ├── login/         # Password login page
│   ├── api/auth/      # Authentication API routes
│   ├── layout.tsx      # Root layout
│   ├── page.tsx        # Home/Content Ideas page
│   └── globals.css     # Global styles
├── components/
│   ├── ui/            # shadcn/ui components
│   ├── sidebar.tsx    # Navigation sidebar
│   └── content-ideas.tsx  # Content Ideas component
├── lib/
│   ├── utils.ts       # Utility functions
│   └── supabase.ts    # Supabase client configuration
├── middleware.ts       # Password protection middleware
└── SETUP.md           # Database setup instructions
```

## Customization

- Modify `app/globals.css` to adjust the color scheme
- Edit navigation in `components/sidebar.tsx`
- Add new pages in the `app/` directory
- Customize components in `components/`

