import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { htmlToText } from 'html-to-text'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_CONTENT_CHARS = 8000 // Per document, so total ~16k for both

const REVIEW_SYSTEM_PROMPT = `You are a document similarity analyst for a knowledge base. Your job is to compare two documents and determine if they are duplicates that should be consolidated.

IMPORTANT CONTEXT:
- All documents in this knowledge base are generated from video/audio transcripts
- Duplicates typically occur when the SAME transcript was accidentally uploaded twice
- Documents from the same transcript will have nearly identical content, just possibly different titles or minor formatting differences
- Documents covering SIMILAR topics but from DIFFERENT transcripts are NOT duplicates - they may offer different perspectives or details

Analyze the two documents provided and respond with a JSON object containing:
1. "isDuplicate": boolean - true if these appear to be from the SAME source transcript
2. "confidence": "high" | "medium" | "low" - how confident you are
3. "reason": string - brief explanation (1-2 sentences)
4. "recommendation": "merge" | "keep_both" | "review_manually" - what action to take
5. "differences": string[] - list of key differences if any (max 3 items)

Consider documents as duplicates if:
- They appear to be generated from the same transcript (nearly identical content/structure)
- One is a subset of the other from the same source
- They have the same examples, quotes, or specific details (indicating same transcript)

Keep both if:
- They cover similar topics but with different examples or explanations (different transcripts)
- They have different structure suggesting different source recordings
- They offer complementary information on the same topic

Respond ONLY with valid JSON, no other text.`

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated'
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { doc1Id, doc2Id } = await req.json()

    if (!doc1Id || !doc2Id) {
      return NextResponse.json({ error: 'Missing document IDs' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()

    // Fetch both documents
    const { data: docs, error: fetchError } = await supabaseAdmin
      .from('dashboard_knowledge_base')
      .select('id, doc_id, title, html')
      .in('id', [doc1Id, doc2Id])

    if (fetchError) {
      console.error('[review-duplicate] Fetch error:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!docs || docs.length !== 2) {
      return NextResponse.json({ error: 'Could not find both documents' }, { status: 404 })
    }

    const doc1 = docs.find((d: any) => d.id === doc1Id)
    const doc2 = docs.find((d: any) => d.id === doc2Id)

    if (!doc1?.html || !doc2?.html) {
      return NextResponse.json({ error: 'One or both documents have no content' }, { status: 400 })
    }

    // Convert HTML to text and truncate
    const text1 = htmlToText(doc1.html, { wordwrap: 0 })
    const text2 = htmlToText(doc2.html, { wordwrap: 0 })

    const content1 = text1.length > MAX_CONTENT_CHARS ? text1.slice(0, MAX_CONTENT_CHARS) + '...[truncated]' : text1
    const content2 = text2.length > MAX_CONTENT_CHARS ? text2.slice(0, MAX_CONTENT_CHARS) + '...[truncated]' : text2

    // Call OpenRouter API
    const openRouterKey = process.env.OPENROUTER_API_KEY
    if (!openRouterKey) {
      return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 500 })
    }

    const userPrompt = `Compare these two documents:

=== DOCUMENT 1: "${doc1.title}" (ID: ${doc1.doc_id}) ===
${content1}

=== DOCUMENT 2: "${doc2.title}" (ID: ${doc2.doc_id}) ===
${content2}

Are these duplicates that should be consolidated?`

    console.log('[review-duplicate] Calling OpenRouter for docs:', doc1.doc_id, 'vs', doc2.doc_id)

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://github.com/your-repo',
        'X-Title': 'Knowledge Base Duplicate Reviewer',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: REVIEW_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[review-duplicate] OpenRouter error:', response.status, errorText)
      return NextResponse.json({ error: `AI API error: ${response.status}` }, { status: 500 })
    }

    const data = await response.json()
    const aiResponse = data.choices?.[0]?.message?.content?.trim()

    console.log('[review-duplicate] AI response:', aiResponse)

    if (!aiResponse) {
      return NextResponse.json({ error: 'Empty response from AI' }, { status: 500 })
    }

    // Parse the JSON response
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON found in response')
      }
      const review = JSON.parse(jsonMatch[0])

      return NextResponse.json({
        review: {
          isDuplicate: review.isDuplicate ?? false,
          confidence: review.confidence ?? 'low',
          reason: review.reason ?? 'Unable to determine',
          recommendation: review.recommendation ?? 'review_manually',
          differences: review.differences ?? [],
        },
        doc1: { id: doc1.id, doc_id: doc1.doc_id, title: doc1.title },
        doc2: { id: doc2.id, doc_id: doc2.doc_id, title: doc2.title },
      })
    } catch (parseError) {
      console.error('[review-duplicate] Failed to parse AI response:', parseError, aiResponse)
      return NextResponse.json({
        review: {
          isDuplicate: false,
          confidence: 'low',
          reason: aiResponse.slice(0, 200),
          recommendation: 'review_manually',
          differences: [],
        },
        doc1: { id: doc1.id, doc_id: doc1.doc_id, title: doc1.title },
        doc2: { id: doc2.id, doc_id: doc2.doc_id, title: doc2.title },
        parseError: true,
      })
    }
  } catch (error: any) {
    console.error('[review-duplicate] Error:', error)
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}
