import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { htmlToText } from 'html-to-text'
import { KB_SUMMARY_SYSTEM_PROMPT } from '@/lib/prompts'
import { embedDocument } from '@/lib/embedDocument'

const MAX_CONTENT_CHARS = 12000;

async function generateSummary(html: string): Promise<string> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const textModel = process.env.OPENROUTER_MODEL;
  if (!openRouterKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }
  if (!textModel) {
    throw new Error('OPENROUTER_MODEL is not configured');
  }

  const text = htmlToText(html, { wordwrap: 0 });
  const content = text.length > MAX_CONTENT_CHARS ? text.slice(0, MAX_CONTENT_CHARS) : text;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openRouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://github.com/your-repo',
      'X-Title': 'Knowledge Base Summary Generator',
    },
    body: JSON.stringify({
      model: textModel,
      messages: [
        { role: 'system', content: KB_SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: `Document content (plain text):\n\n${content}` },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  const summary = data.choices?.[0]?.message?.content?.trim() || '';
  
  if (!summary) {
    throw new Error('Empty summary returned from API');
  }

  return summary;
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated'
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('[upload-html] request received')
    const supabaseAdmin = getSupabaseAdmin()
    const { source_filename, html, title: incomingTitle, parent, transcript, video_storage_path, video_storage_bucket } = await req.json()
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

    // Generate summary from HTML
    console.log('[upload-html] Generating summary...')
    let summary: string | null = null
    try {
      summary = await generateSummary(html)
      console.log('[upload-html] Summary generated', { summaryLength: summary.length })
    } catch (summaryError: any) {
      console.error('[upload-html] Summary generation failed, continuing without summary', {
        error: summaryError?.message || summaryError,
      })
      // Continue without summary - don't fail the entire upload
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('dashboard_knowledge_base')
      .insert({
        source_filename,
        title,
        html,
        parent: parent ?? null,
        doc_id: nextDocId,
        transcript: transcript ?? null,
        summary: summary ?? null,
      })
      .select('id')
      .single()

    if (insertErr) throw insertErr
    console.log('[upload-html] inserted doc id', inserted?.id, { hasSummary: !!summary })

    // Embed the document automatically
    // Note: In Vercel serverless, we need to await or the function may terminate before completion
    if (inserted?.id) {
      try {
        // Use Promise.race to timeout after 240 seconds (leaving buffer for 300s maxDuration)
        const embeddingPromise = embedDocument(inserted.id, true)
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Embedding timeout')), 240000)
        )
        
        await Promise.race([embeddingPromise, timeoutPromise])
        console.log('[upload-html] Document embedded successfully')
      } catch (embedErr: any) {
        // Log error but don't fail the upload - embeddings can be regenerated later
        console.error('[upload-html] Failed to embed document (non-fatal):', embedErr.message)
      }
    }

    // Clean up video file from Supabase Storage (keep audio files)
    if (video_storage_path && video_storage_bucket) {
      const isVideoFile = video_storage_path.match(/\.(mp4|mov|avi|webm|mkv|flv)$/i)
      if (isVideoFile) {
        try {
          console.log('[upload-html] Deleting video file from storage', { bucket: video_storage_bucket, path: video_storage_path })
          const { error: deleteErr } = await supabaseAdmin.storage
            .from(video_storage_bucket)
            .remove([video_storage_path])

          if (deleteErr) {
            console.error('[upload-html] Failed to delete video file (non-fatal):', deleteErr)
          } else {
            console.log('[upload-html] Video file deleted successfully from Supabase Storage')
          }
        } catch (deleteError: any) {
          console.error('[upload-html] Error deleting video file (non-fatal):', deleteError)
        }
      } else {
        console.log('[upload-html] Audio file detected, keeping in storage', { path: video_storage_path })
      }
    }

    return NextResponse.json({ success: true, doc_id: nextDocId, summary: summary || null })
  } catch (error: any) {
    console.error('[upload-html] error', error)
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}


