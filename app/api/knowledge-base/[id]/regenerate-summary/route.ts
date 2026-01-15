import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { htmlToText } from 'html-to-text'
import { KB_SUMMARY_SYSTEM_PROMPT } from '@/lib/prompts' // Using the detailed e-commerce course summary prompt

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

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies()
  const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated'
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = await context.params
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  try {
    const supabaseAdmin = getSupabaseAdmin()

    // Determine if we're dealing with numeric doc_id or UUID id
    const numericId = Number(id)
    const isNumericId = !isNaN(numericId) && isFinite(numericId)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

    // Fetch the document using the appropriate field
    let query = supabaseAdmin.from('dashboard_knowledge_base').select('id, html')

    if (isUUID) {
      query = query.eq('id', id)
    } else if (isNumericId) {
      query = query.eq('doc_id', numericId)
    } else {
      query = query.eq('id', id)
    }

    const { data: doc, error: fetchError } = await query.single()

    if (fetchError) throw fetchError
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }
    if (!doc.html) {
      return NextResponse.json({ error: 'Document has no HTML content' }, { status: 400 })
    }

    // Generate summary
    const summary = await generateSummary(doc.html)

    // Update the document using the UUID id from the fetched document
    const { error: updateError } = await supabaseAdmin
      .from('dashboard_knowledge_base')
      .update({ summary, updated_at: new Date().toISOString() })
      .eq('id', doc.id)

    if (updateError) throw updateError

    return NextResponse.json({ success: true, summary })
  } catch (error: any) {
    console.error('[regenerate-summary] error', error)
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}

