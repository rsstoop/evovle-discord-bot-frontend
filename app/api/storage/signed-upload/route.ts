import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'

export async function POST() {
  const cookieStore = await cookies()
  const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated'
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = getSupabaseAdmin()
    const bucket = process.env.SUPABASE_AUDIO_BUCKET || 'kb-media'
    // Ensure bucket exists
    const { data: buckets } = await (supabase as any).storage.listBuckets()
    const exists = Array.isArray(buckets) && buckets.some((b: any) => b.name === bucket)
    if (!exists) {
      const { error: createErr } = await (supabase as any).storage.createBucket(bucket, { public: false })
      if (createErr) throw createErr
    }
    const path = `${randomUUID()}.mp3`
    const { data, error } = await (supabase as any).storage.from(bucket).createSignedUploadUrl(path)
    if (error) throw error
    return NextResponse.json({ bucket, path, token: data?.token })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create signed upload URL' }, { status: 500 })
  }
}


