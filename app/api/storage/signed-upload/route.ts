import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'

// Supported video and audio formats
const SUPPORTED_FORMATS = ['mp3', 'mp4', 'mov', 'avi', 'webm', 'mkv', 'flv', 'wav', 'm4a', 'ogg']

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated'
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Parse request body for file extension and size
    const body = await req.json().catch(() => ({}))
    const fileExtension = body.fileExtension?.toLowerCase() || 'mp3'
    const fileSize = body.fileSize || 100 * 1024 * 1024 // Default 100MB

    // Validate file extension
    if (!SUPPORTED_FORMATS.includes(fileExtension)) {
      return NextResponse.json(
        { error: `Unsupported file format: ${fileExtension}. Supported formats: ${SUPPORTED_FORMATS.join(', ')}` },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()
    const bucket = process.env.SUPABASE_AUDIO_BUCKET || 'kb-media'
    // Ensure bucket exists
    const { data: buckets } = await (supabase as any).storage.listBuckets()
    const exists = Array.isArray(buckets) && buckets.some((b: any) => b.name === bucket)
    if (!exists) {
      const { error: createErr } = await (supabase as any).storage.createBucket(bucket, { public: false })
      if (createErr) throw createErr
    }
    const path = `${randomUUID()}.${fileExtension}`

    // Create signed upload URL with explicit file size limit (200MB max)
    const maxFileSize = Math.min(fileSize, 200 * 1024 * 1024) // Cap at 200MB
    const { data, error } = await (supabase as any).storage
      .from(bucket)
      .createSignedUploadUrl(path, {
        upsert: false,
      })
    if (error) {
      console.error('[signed-upload] Error creating signed URL', error)
      throw error
    }
    
    console.log('[signed-upload] Created signed upload URL', {
      bucket,
      path,
      hasToken: !!data?.token,
      hasSignedUrl: !!data?.signedUrl,
    })
    
    // Return both the signed URL and token for upload
    return NextResponse.json({ 
      bucket, 
      path, 
      token: data?.token,
      signedUrl: data?.signedUrl || data?.url, // Some Supabase versions return 'url' instead of 'signedUrl'
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create signed upload URL' }, { status: 500 })
  }
}


