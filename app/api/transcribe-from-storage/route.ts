import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import OpenAI from 'openai'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated'
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const startTime = Date.now()
  try {
    const { bucket, path } = await req.json()
    if (!bucket || !path) {
      console.error('[transcribe-from-storage] missing params', { bucket: !!bucket, path: !!path })
      return NextResponse.json({ error: 'bucket and path required' }, { status: 400 })
    }
    
    console.log('[transcribe-from-storage] 📍 STEP 1: Request received', { bucket, path, timestamp: new Date().toISOString() })
    const supabase = getSupabaseAdmin()
    
    // Create signed URL with longer expiry
    console.log('[transcribe-from-storage] 📍 STEP 2: Creating signed URL...')
    const urlStartTime = Date.now()
    const { data, error } = await (supabase as any).storage.from(bucket).createSignedUrl(path, 300)
    if (error) {
      console.error('[transcribe-from-storage] ❌ Signed URL creation failed', { error: error.message || error, elapsed: `${Date.now() - urlStartTime}ms` })
      throw new Error(`Storage error: ${error.message || 'Failed to create signed URL'}`)
    }
    const url: string = data?.signedUrl
    if (!url) {
      console.error('[transcribe-from-storage] ❌ No signed URL in response', { data })
      throw new Error('Failed to sign storage URL')
    }
    console.log('[transcribe-from-storage] ✅ Signed URL created', { elapsed: `${Date.now() - urlStartTime}ms`, urlLength: url.length })

    // Fetch file with timeout and retry
    console.log('[transcribe-from-storage] 📍 STEP 3: Fetching MP3 file from storage...')
    const fetchStartTime = Date.now()
    let ab: ArrayBuffer
    let fetchAttempts = 0
    const maxFetchAttempts = 3
    while (fetchAttempts < maxFetchAttempts) {
      try {
        fetchAttempts++
        console.log(`[transcribe-from-storage] 🔄 Fetch attempt ${fetchAttempts}/${maxFetchAttempts}`)
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 30000) // 30s timeout
        const res = await fetch(url, { signal: controller.signal })
        clearTimeout(timeout)
        
        if (!res.ok) {
          throw new Error(`Storage fetch failed: ${res.status} ${res.statusText}`)
        }
        ab = await res.arrayBuffer()
        const sizeMB = (ab.byteLength / 1024 / 1024).toFixed(2)
        console.log('[transcribe-from-storage] ✅ File fetched successfully', { 
          sizeBytes: ab.byteLength, 
          sizeMB, 
          elapsed: `${Date.now() - fetchStartTime}ms`,
          attempt: fetchAttempts 
        })
        break
      } catch (fetchErr: any) {
        if (fetchAttempts >= maxFetchAttempts) {
          console.error('[transcribe-from-storage] ❌ Fetch failed after all retries', { 
            attempts: fetchAttempts, 
            error: fetchErr.message,
            elapsed: `${Date.now() - fetchStartTime}ms` 
          })
          throw new Error(`Failed to fetch file from storage: ${fetchErr.message}`)
        }
        const backoffMs = 1000 * fetchAttempts
        console.warn(`[transcribe-from-storage] ⚠️ Fetch attempt ${fetchAttempts} failed, retrying in ${backoffMs}ms...`, { 
          error: fetchErr.message,
          nextAttempt: fetchAttempts + 1 
        })
        await new Promise(r => setTimeout(r, backoffMs))
      }
    }

    const file = new File([new Uint8Array(ab!)], 'audio.mp3', { type: 'audio/mpeg' })
    console.log('[transcribe-from-storage] 📍 STEP 4: File object created, preparing for Whisper...')

    // Transcribe with retry
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.error('[transcribe-from-storage] ❌ OPENAI_API_KEY missing from environment')
      return NextResponse.json({ error: 'Server missing OPENAI_API_KEY' }, { status: 500 })
    }
    
    console.log('[transcribe-from-storage] 📍 STEP 5: Starting Whisper transcription...')
    const whisperStartTime = Date.now()
    const client = new OpenAI({ apiKey })
    let tr: any
    let whisperAttempts = 0
    const maxWhisperAttempts = 2
    while (whisperAttempts < maxWhisperAttempts) {
      try {
        whisperAttempts++
        console.log(`[transcribe-from-storage] 🔄 Whisper attempt ${whisperAttempts}/${maxWhisperAttempts} (sending ${(file.size / 1024 / 1024).toFixed(2)}MB to OpenAI)...`)
        const attemptStartTime = Date.now()
        tr = await client.audio.transcriptions.create({ 
          model: 'whisper-1', 
          file, 
          language: 'en' as any,
        })
        const whisperElapsed = Date.now() - attemptStartTime
        console.log('[transcribe-from-storage] ✅ Whisper transcription completed', { 
          elapsed: `${whisperElapsed}ms`,
          attempt: whisperAttempts,
          totalElapsed: `${Date.now() - whisperStartTime}ms`
        })
        break
      } catch (whisperErr: any) {
        if (whisperAttempts >= maxWhisperAttempts) {
          console.error('[transcribe-from-storage] ❌ Whisper failed after all retries', { 
            attempts: whisperAttempts,
            error: whisperErr.message || whisperErr,
            errorType: whisperErr.constructor?.name,
            elapsed: `${Date.now() - whisperStartTime}ms`
          })
          throw new Error(`Whisper transcription failed: ${whisperErr.message || 'Unknown error'}`)
        }
        const backoffMs = 2000 * whisperAttempts
        console.warn(`[transcribe-from-storage] ⚠️ Whisper attempt ${whisperAttempts} failed, retrying in ${backoffMs}ms...`, { 
          error: whisperErr.message || whisperErr,
          errorType: whisperErr.constructor?.name,
          nextAttempt: whisperAttempts + 1 
        })
        await new Promise(r => setTimeout(r, backoffMs))
      }
    }
    
    const text = typeof tr?.text === 'string' ? tr.text.trim() : ''
    if (!text) {
      console.error('[transcribe-from-storage] ❌ Empty transcript returned from Whisper', { 
        tr: tr ? Object.keys(tr) : 'null',
        totalElapsed: `${Date.now() - startTime}ms`
      })
      return NextResponse.json({ error: 'Empty transcript from Whisper' }, { status: 500 })
    }
    const totalElapsed = Date.now() - startTime
    console.log('[transcribe-from-storage] ✅✅✅ COMPLETE - Transcription successful!', { 
      transcriptLength: text.length,
      wordCount: text.split(/\s+/).length,
      totalElapsed: `${totalElapsed}ms`,
      totalElapsedSeconds: `${(totalElapsed / 1000).toFixed(1)}s`
    })
    return NextResponse.json({ text })
  } catch (e: any) {
    const totalElapsed = Date.now() - startTime
    console.error('[transcribe-from-storage] ❌❌❌ FATAL ERROR', { 
      error: e?.message || e,
      errorType: e?.constructor?.name,
      stack: e?.stack?.split('\n').slice(0, 3).join(' | '),
      totalElapsed: `${totalElapsed}ms`
    })
    return NextResponse.json({ error: e?.message || 'Transcription failed' }, { status: 500 })
  }
}


