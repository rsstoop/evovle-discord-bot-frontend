import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { compressAudioToSize, isCloudinaryConfigured } from '@/lib/cloudinary'

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

    let fileBuffer: Buffer = Buffer.from(ab!)

    // Detect if this is a video file that needs audio extraction
    const isVideo = path.match(/\.(mp4|mov|avi|webm|mkv|flv)$/i)
    const isAudio = path.match(/\.(mp3|wav|m4a|ogg)$/i)

    if (isVideo) {
      console.log('[transcribe-from-storage] 📍 Video file detected, extracting audio via Cloudinary...', {
        path,
        originalVideoSizeMB: (fileBuffer.length / 1024 / 1024).toFixed(2),
      })

      // Check if Cloudinary is configured
      if (!isCloudinaryConfigured()) {
        console.error('[transcribe-from-storage] ❌ Cloudinary not configured for video processing')
        return NextResponse.json(
          { error: 'Cloudinary is not configured. Please add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to environment variables.' },
          { status: 500 }
        )
      }

      // Extract and compress audio using Cloudinary
      const extractionStartTime = Date.now()
      try {
        const format = path.split('.').pop()?.toLowerCase() || 'mp4'
        const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024 // 25MB

        const compressedAudio = await compressAudioToSize(fileBuffer, MAX_AUDIO_SIZE_BYTES, format)
        fileBuffer = compressedAudio as Buffer

        const extractionElapsed = Date.now() - extractionStartTime
        const audioSizeMB = (fileBuffer.length / 1024 / 1024).toFixed(2)

        console.log('[transcribe-from-storage] ✅ Audio extracted successfully', {
          audioSizeMB,
          extractionElapsed: `${extractionElapsed}ms`,
        })
      } catch (extractionErr: any) {
        console.error('[transcribe-from-storage] ❌ Audio extraction failed', {
          error: extractionErr.message,
          elapsed: `${Date.now() - extractionStartTime}ms`,
        })
        return NextResponse.json(
          { error: `Audio extraction failed: ${extractionErr.message}` },
          { status: 500 }
        )
      }
    }

    const fileSizeMB = (fileBuffer.length / 1024 / 1024).toFixed(2)
    const fileSizeBytes = fileBuffer.length
    const MAX_FILE_SIZE_MB = 25
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

    // Check file size before proceeding (applies to final audio, not original video)
    if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
      console.error('[transcribe-from-storage] ❌ File size exceeds maximum', {
        fileSizeMB: parseFloat(fileSizeMB),
        maxSizeMB: MAX_FILE_SIZE_MB,
        fileSizeBytes,
      })
      return NextResponse.json(
        { error: `Audio size (${fileSizeMB}MB) exceeds maximum allowed size (${MAX_FILE_SIZE_MB}MB)` },
        { status: 400 }
      )
    }

    console.log('[transcribe-from-storage] 📍 STEP 4: File buffer created, preparing for transcription...', {
      fileSizeMB: parseFloat(fileSizeMB),
      fileSizeBytes,
      maxSizeMB: MAX_FILE_SIZE_MB,
    })

    // Transcribe with OpenRouter
    const openRouterKey = process.env.OPENROUTER_API_KEY
    // Default to google/gemini-2.5-flash if not specified (supports audio transcription)
    const audioModel = process.env.OPENROUTER_MODEL_AUDIO || 'google/gemini-2.5-flash'
    if (!openRouterKey) {
      console.error('[transcribe-from-storage] ❌ OPENROUTER_API_KEY missing from environment')
      return NextResponse.json({ error: 'Server missing OPENROUTER_API_KEY' }, { status: 500 })
    }
    
    // Detect audio format from file path or default to mp3
    const audioFormat = path.toLowerCase().endsWith('.wav') ? 'wav' :
                       path.toLowerCase().endsWith('.mp3') ? 'mp3' :
                       path.toLowerCase().endsWith('.m4a') ? 'm4a' :
                       path.toLowerCase().endsWith('.ogg') ? 'ogg' : 'mp3'
    
    console.log('[transcribe-from-storage] 📍 STEP 5: Starting transcription via OpenRouter...', {
      model: audioModel,
      format: audioFormat,
      fileSizeMB,
      fileSizeBytes: fileBuffer.length,
    })
    const transcriptionStartTime = Date.now()
    
    // Convert audio to base64 (clean, no data URL prefix)
    const base64Audio = fileBuffer.toString('base64')
    const base64LengthKB = (base64Audio.length / 1024).toFixed(2)
    console.log('[transcribe-from-storage] 📍 STEP 5.1: Audio converted to base64', {
      base64Length: base64Audio.length,
      base64LengthKB,
    })
    
    let tr: any
    let transcriptionAttempts = 0
    const maxTranscriptionAttempts = 2
    while (transcriptionAttempts < maxTranscriptionAttempts) {
      try {
        transcriptionAttempts++
        console.log(`[transcribe-from-storage] 🔄 Transcription attempt ${transcriptionAttempts}/${maxTranscriptionAttempts} (sending ${fileSizeMB}MB to OpenRouter)...`)
        const attemptStartTime = Date.now()
        
        // Use OpenRouter's chat completions endpoint with audio (matching their docs exactly)
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://stoopdynamics.com',
            'X-Title': 'Audio Transcription',
          },
          body: JSON.stringify({
            model: audioModel,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Please transcribe this audio file.',
                  },
                  {
                    type: 'input_audio',
                    input_audio: {
                      data: base64Audio,
                      format: audioFormat,
                    },
                  },
                ],
              },
            ],
          }),
        })
        
        if (!response.ok) {
          let errorText = ''
          try {
            errorText = await response.text()
            // Try to parse as JSON for better error messages
            try {
              const errorJson = JSON.parse(errorText)
              throw new Error(`OpenRouter API error (${response.status}): ${errorJson.error?.message || errorJson.error || JSON.stringify(errorJson)}`)
            } catch {
              // If not JSON, use the text as-is
              if (errorText.length > 500) {
                errorText = errorText.substring(0, 500) + '... (truncated)'
              }
              throw new Error(`OpenRouter API error (${response.status} ${response.statusText}): ${errorText}`)
            }
          } catch (parseErr: any) {
            throw parseErr
          }
        }
        
        const data = await response.json()
        const transcriptionElapsed = Date.now() - attemptStartTime
        
        // Validate response structure
        if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
          throw new Error(`Invalid response structure from OpenRouter: ${JSON.stringify(data).substring(0, 200)}`)
        }
        
        // Extract transcript from response
        const transcriptText = data.choices[0]?.message?.content?.trim() || ''
        
        if (!transcriptText) {
          throw new Error('Empty transcript returned from OpenRouter')
        }
        
        // Log response for debugging
        console.log('[transcribe-from-storage] Raw response', {
          responseId: data.id || 'unknown',
          transcriptLength: transcriptText.length,
          transcriptPreview: transcriptText.substring(0, 200),
          usage: data.usage || null,
        })
        
        // Check if the response is instructions or error message instead of a transcript
        const isInstructionResponse = transcriptText.toLowerCase().includes('please upload') || 
                                     transcriptText.toLowerCase().includes('provide a link') ||
                                     transcriptText.toLowerCase().includes('i can transcribe') ||
                                     transcriptText.toLowerCase().includes('optional: please specify') ||
                                     transcriptText.toLowerCase().includes('cannot process') ||
                                     transcriptText.toLowerCase().includes('not supported')
        
        if (isInstructionResponse) {
          console.error('[transcribe-from-storage] ⚠️ Model returned instructions/error instead of transcript', {
            transcriptText: transcriptText.substring(0, 500),
          })
          throw new Error('Model returned instructions instead of transcript. The audio format may not be supported or the model may not have processed the audio correctly.')
        }
        
        console.log('[transcribe-from-storage] ✅ Transcription completed', { 
          elapsed: `${transcriptionElapsed}ms`,
          attempt: transcriptionAttempts,
          totalElapsed: `${Date.now() - transcriptionStartTime}ms`,
          model: audioModel,
          format: audioFormat,
          responseId: data.id || 'unknown',
          transcriptLength: transcriptText.length,
          wordCount: transcriptText.split(/\s+/).length,
          transcriptPreview: transcriptText.substring(0, 100) + (transcriptText.length > 100 ? '...' : ''),
          usage: data.usage || null,
        })
        
        tr = { text: transcriptText }
        break
      } catch (transcriptionErr: any) {
        if (transcriptionAttempts >= maxTranscriptionAttempts) {
          console.error('[transcribe-from-storage] ❌ Transcription failed after all retries', { 
            attempts: transcriptionAttempts,
            error: transcriptionErr.message || transcriptionErr,
            errorType: transcriptionErr.constructor?.name,
            elapsed: `${Date.now() - transcriptionStartTime}ms`
          })
          throw new Error(`Transcription failed: ${transcriptionErr.message || 'Unknown error'}`)
        }
        const backoffMs = 2000 * transcriptionAttempts
        console.warn(`[transcribe-from-storage] ⚠️ Transcription attempt ${transcriptionAttempts} failed, retrying in ${backoffMs}ms...`, { 
          error: transcriptionErr.message || transcriptionErr,
          errorType: transcriptionErr.constructor?.name,
          nextAttempt: transcriptionAttempts + 1 
        })
        await new Promise(r => setTimeout(r, backoffMs))
      }
    }
    
    const text = typeof tr?.text === 'string' ? tr.text.trim() : ''
    if (!text) {
      console.error('[transcribe-from-storage] ❌ Empty transcript returned', { 
        tr: tr ? Object.keys(tr) : 'null',
        totalElapsed: `${Date.now() - startTime}ms`
      })
      return NextResponse.json({ error: 'Empty transcript returned' }, { status: 500 })
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


