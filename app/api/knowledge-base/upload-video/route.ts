import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import OpenAI from 'openai'
import { writeFile, readFile, unlink } from 'fs/promises'
import { randomUUID } from 'crypto'
import { htmlToText } from 'html-to-text'
import { KB_SUMMARY_SYSTEM_PROMPT, TRANSCRIPT_TO_HTML_SYSTEM_PROMPT, GEMINI_TRANSCRIPTION_PROMPT } from '@/lib/prompts'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager } from '@google/generative-ai/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  console.log('[upload-audio] request received')
  const cookieStore = await cookies()
  const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated'
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const titleInput = (form.get('title') as string | null)?.trim() || ''
    const parentInput = (form.get('parent') as string | null)?.trim() || ''

    if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    const lower = (file.name || '').toLowerCase()
    if (!(file.type === 'audio/mpeg' || lower.endsWith('.mp3'))) {
      return NextResponse.json({ error: 'Only MP3 (audio/mpeg) is accepted' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()

    // Write input to /tmp
    const inputName = `${randomUUID()}`
    const inputPath = `/tmp/${inputName}.mp3`

    const ab = await file.arrayBuffer()
    const buf = Buffer.from(ab)
    if (buf.length > 200 * 1024 * 1024) {
      console.error('[upload-audio] MP3 too large (>', buf.length, 'bytes)')
      return NextResponse.json({ error: 'MP3 too large. Please upload a smaller file.' }, { status: 413 })
    }
    await writeFile(inputPath, buf)
    console.log('[upload-audio] wrote input mp3 to', inputPath, 'size', (Buffer.byteLength(buf) / 1024 / 1024).toFixed(2), 'MB')

    // Kick off background processing and return immediately
    ;(async () => {
      try {
        // Transcribe: primary OpenAI Whisper, fallback Gemini
        let safeTranscript = ''
        try {
          const openaiKey = process.env.OPENAI_API_KEY
          if (!openaiKey) throw new Error('OPENAI_API_KEY not set for Whisper')
          const client = new OpenAI({ apiKey: openaiKey })
          const mp3Buffer = await readFile(inputPath)
          const mp3Bytes = new Uint8Array(mp3Buffer)
          const mp3File = new File([mp3Bytes], 'audio.mp3', { type: 'audio/mpeg' })
          console.log('[upload-audio:bg] transcribing with Whisper primary')
          const transcriptResp = await client.audio.transcriptions.create({ model: 'whisper-1', file: mp3File, language: 'en' as any })
          const transcript = typeof transcriptResp?.text === 'string' ? transcriptResp.text : ''
          safeTranscript = transcript.trim()
          if (!safeTranscript) throw new Error('Whisper returned empty transcript')
          console.log('[upload-audio:bg] got transcript via Whisper length', safeTranscript.length)
        } catch (whisperErr) {
          console.error('[upload-audio:bg] Whisper failed, falling back to Gemini', whisperErr)
          const geminiApiKey = process.env.GEMINI_API_KEY
          if (!geminiApiKey) throw new Error('GEMINI_API_KEY not set for fallback')
          const genAI = new GoogleGenerativeAI(geminiApiKey)
          const fileManager = new GoogleAIFileManager(geminiApiKey)
          console.log('[upload-audio:bg] uploading mp3 to Gemini')
          const uploadResult = await fileManager.uploadFile(inputPath, { mimeType: 'audio/mpeg', displayName: 'audio.mp3' })
          console.log('[upload-audio:bg] upload result', { name: uploadResult?.file?.name, state: uploadResult?.file?.state })
          let lastState: any = uploadResult?.file?.state
          let status = (typeof lastState === 'string' ? lastState : (lastState?.name || 'UNKNOWN'))
          for (let i = 0; i < 300 && status !== 'ACTIVE'; i++) {
            await new Promise((r) => setTimeout(r, 1000))
            const refreshed = await fileManager.getFile(uploadResult.file.name)
            lastState = refreshed?.state
            status = (typeof lastState === 'string' ? lastState : (lastState?.name || 'UNKNOWN'))
            if ((i + 1) % 10 === 0) console.log('[upload-audio:bg] poll', i + 1, 'state =', status)
            if (status === 'FAILED') throw new Error('Gemini file processing failed')
          }
          if (status !== 'ACTIVE') throw new Error(`Gemini file not ready (last state: ${status})`)

          const modelName = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash-lite'
          const model = genAI.getGenerativeModel({ model: modelName })
          const transcriptionPrompt = GEMINI_TRANSCRIPTION_PROMPT
          const generationConfig = { responseMimeType: 'application/json', responseSchema: { type: 'object', properties: { language: { type: 'string' }, text: { type: 'string' } }, required: ['language', 'text'] } } as any
          console.log('[upload-audio:bg] calling generateContent (fallback)')
          const geminiResp = await (async () => {
            const maxAttempts = 5
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              try {
                return await model.generateContent({ contents: [{ role: 'user', parts: [ { fileData: { mimeType: 'audio/mpeg', fileUri: uploadResult.file.uri } }, { text: transcriptionPrompt } ] }], generationConfig })
              } catch (err: any) {
                const status = err?.status || err?.statusCode
                const isRetryable = status === 429 || status === 500 || status === 502 || status === 503 || status === 504
                console.error(`[upload-audio:bg] generateContent error (attempt ${attempt})`, status, err?.message)
                if (attempt === maxAttempts || !isRetryable) throw err
                const backoffMs = Math.min(30000, 1000 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 500)
                await new Promise((r) => setTimeout(r, backoffMs))
              }
            }
            throw new Error('unreachable')
          })()
          const rawText = geminiResp.response?.text()?.trim() || ''
          const stripCodeFences = (s: string) => { const t = s.trim(); if (t.startsWith('```') && t.endsWith('```')) { const lines = t.split('\n'); return lines.slice(1, -1).join('\n').trim() } return t }
          const cleaned = stripCodeFences(rawText)
          let payload: { language?: string; text?: string } = {}
          try { const maybe = cleaned.toLowerCase().startsWith('json\n') ? cleaned.split('\n').slice(1).join('\n') : cleaned; payload = JSON.parse(maybe) } catch { payload = { language: 'en', text: cleaned } }
          const removeTimestamps = (text: string) => { const pattern = /[\[(]?\b\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?\b[\])]?/g; return text.split('\n').map((line) => line.replace(pattern, '').replace(/\s{2,}/g, ' ').trim()).filter(Boolean).join('\n') }
          safeTranscript = removeTimestamps(String(payload.text || '')).trim()
          if (!safeTranscript) throw new Error('Gemini fallback returned empty transcript')
          console.log('[upload-audio:bg] got transcript via Gemini fallback length', safeTranscript.length)
        }

        // Generate structured HTML article with OpenAI gpt-5-nano
        let html = ''
        let computedTitle = titleInput
        try {
          const openaiKey = process.env.OPENAI_API_KEY
          if (!openaiKey) throw new Error('OPENAI_API_KEY not set for HTML generation')
          const client = new OpenAI({ apiKey: openaiKey })
          console.log('[upload-audio:bg] generating HTML article with gpt-5-nano')
          const completionHtml = await client.chat.completions.create({
            model: 'gpt-5-nano',
            messages: [
              { role: 'system', content: TRANSCRIPT_TO_HTML_SYSTEM_PROMPT },
              { role: 'user', content: safeTranscript },
            ],
          })
          html = completionHtml.choices?.[0]?.message?.content?.trim() || ''
          // Strip accidental code fences
          if (html.startsWith('```')) {
            const lines = html.split('\n')
            html = lines.slice(1, -1).join('\n').trim()
          }
          if (!html.toLowerCase().includes('<article')) {
            // Ensure article wrapper
            html = `<article>${html}</article>`
          }
          // Derive title from <h1>
          const m = html.match(/<h1[^>]*>(.*?)<\/h1>/i)
          computedTitle = computedTitle || (m && m[1] ? m[1].trim().slice(0, 120) : '')
          if (!computedTitle) computedTitle = (safeTranscript.split('\n').find(Boolean)?.slice(0, 80) || 'Untitled Transcript')
          console.log('[upload-audio:bg] HTML article generated, length', html.length)
        } catch (e) {
          console.error('[upload-audio:bg] HTML generation failed, falling back to simple paragraphs', e)
          const fallbackTitle = titleInput || (safeTranscript.split('\n').find(Boolean)?.slice(0, 80) || 'Untitled Transcript')
          const paragraphs = safeTranscript.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('\n')
          html = `<article><header><h1>${fallbackTitle.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h1></header>\n${paragraphs}</article>`
          computedTitle = fallbackTitle
        }

        const { data: maxData } = await supabaseAdmin.from('dashboard_knowledge_base').select('doc_id').order('doc_id', { ascending: false }).limit(1)
        const nextDocId = (Array.isArray(maxData) && maxData[0]?.doc_id ? Number(maxData[0].doc_id) + 1 : 1)
        const { data: inserted, error: insertErr } = await supabaseAdmin
          .from('dashboard_knowledge_base')
          .insert({ source_filename: (file as any)?.name || 'uploaded-video', title: computedTitle, html, parent: parentInput || null, doc_id: nextDocId, transcript: safeTranscript })
          .select('id')
          .single()
        if (insertErr) throw insertErr

        // Summary from generated HTML
        try {
          const openaiKey = process.env.OPENAI_API_KEY
          if (openaiKey) {
            const client = new OpenAI({ apiKey: openaiKey })
            const textPlain = htmlToText(html, { wordwrap: 0 })
            const content = textPlain.length > 12000 ? textPlain.slice(0, 12000) : textPlain
            const completion = await client.chat.completions.create({ model: 'gpt-5-nano', messages: [{ role: 'system', content: KB_SUMMARY_SYSTEM_PROMPT }, { role: 'user', content: `Document content (plain text):\n\n${content}` }] })
            const summary = completion.choices?.[0]?.message?.content?.trim()
            if (summary) await supabaseAdmin.from('dashboard_knowledge_base').update({ summary }).eq('id', inserted.id)
          }
        } catch (e) {
          console.error('[upload-audio:bg] summary failed', e)
        }
      } catch (err) {
        console.error('[upload-audio:bg] processing failed', err)
      } finally {
        try { await unlink(inputPath) } catch {}
      }
    })()

    return NextResponse.json({ accepted: true, status: 'processing' }, { status: 202 })
  } catch (error: any) {
    console.error('[upload-audio] error', error)
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}


