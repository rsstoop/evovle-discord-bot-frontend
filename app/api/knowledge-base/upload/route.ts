import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import OpenAI from 'openai'
import { htmlToText } from 'html-to-text'
import { KB_SUMMARY_SYSTEM_PROMPT } from '@/lib/prompts'

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated'
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('[upload-html] request received')
    const supabaseAdmin = getSupabaseAdmin()
    const { source_filename, html, title: incomingTitle, parent, transcript } = await req.json()
    if (!source_filename || !html) {
      return NextResponse.json({ error: 'source_filename and html are required' }, { status: 400 })
    }

    // Compute title if not provided
    const title = (() => {
      if (incomingTitle && typeof incomingTitle === 'string') return incomingTitle
      const match = String(html).match(/<h1[^>]*>(.*?)<\/h1>/i)
      if (match?.[1]) return match[1].trim()
      const base = String(source_filename).replace(/\.[^.]+$/, '')
      return base.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    })()

    // Compute next doc_id on the server to avoid races
    const { data: maxData, error: maxErr } = await supabaseAdmin
      .from('dashboard_knowledge_base')
      .select('doc_id')
      .order('doc_id', { ascending: false })
      .limit(1)

    if (maxErr) throw maxErr

    const nextDocId = (Array.isArray(maxData) && maxData[0]?.doc_id ? Number(maxData[0].doc_id) + 1 : 1)
    console.log('[upload-html] next doc_id', nextDocId)

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('dashboard_knowledge_base')
      .insert({
        source_filename,
        title,
        html,
        parent: parent ?? null,
        doc_id: nextDocId,
        transcript: transcript ?? null,
      })
      .select('id')
      .single()

    if (insertErr) throw insertErr
    console.log('[upload-html] inserted doc id', inserted?.id)

    // Summarize synchronously to ensure it's saved before returning
    try {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        console.warn('[upload-html] OPENAI_API_KEY missing; skipping summary')
      } else {
        const client = new OpenAI({ apiKey })
        const text = htmlToText(html, { wordwrap: 0 })
        const maxChars = 12000
        const content = text.length > maxChars ? text.slice(0, maxChars) : text
        console.log('[upload-html] starting summarization with gpt-5-nano, content length', content.length)

        const runSummary = async () => {
          const completion = await client.chat.completions.create({
            model: 'gpt-5-nano',
            messages: [
              { role: 'system', content: KB_SUMMARY_SYSTEM_PROMPT },
              { role: 'user', content: `Document content (plain text):\n\n${content}` },
            ],
          })
          return completion.choices?.[0]?.message?.content?.trim() || ''
        }

        let summary = ''
        try { summary = await runSummary() } catch (err: any) {
          console.warn('[upload-html] summary attempt failed, retrying once...', err?.message)
          summary = await runSummary()
        }

        if (summary) {
          await supabaseAdmin
            .from('dashboard_knowledge_base')
            .update({ summary })
            .eq('id', inserted.id)
          console.log('[upload-html] summarization stored')
        } else {
          console.warn('[upload-html] empty summary returned')
        }
      }
    } catch (e) {
      console.error('[upload-html] summarization failed:', e)
    }

    return NextResponse.json({ success: true, doc_id: nextDocId, summarized: true })
  } catch (error: any) {
    console.error('[upload-html] error', error)
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}


