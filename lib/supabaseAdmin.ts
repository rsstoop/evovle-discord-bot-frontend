import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY

// Log which env var is being used (only log existence, not the actual key)
if (typeof window === 'undefined') {
  console.log('[supabaseAdmin] Environment check:', {
    hasSupabaseUrl: !!supabaseUrl,
    hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE,
    hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    usingVariable: process.env.SUPABASE_SERVICE_ROLE ? 'SUPABASE_SERVICE_ROLE' : process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY' : 'NONE'
  })
}

let cachedAdmin: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE (or SUPABASE_SERVICE_ROLE_KEY) and NEXT_PUBLIC_SUPABASE_URL must be set on the server')
  }

  console.log('[supabaseAdmin] Creating client with service role', {
    hasUrl: !!supabaseUrl,
    hasKey: !!serviceRoleKey,
    keyPrefix: serviceRoleKey.substring(0, 20) + '...',
    urlPrefix: supabaseUrl.substring(0, 30) + '...'
  })

  cachedAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    db: {
      schema: 'public'
    }
  })
  return cachedAdmin
}


