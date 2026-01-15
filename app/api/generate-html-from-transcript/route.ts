import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { TRANSCRIPT_TO_HTML_SYSTEM_PROMPT } from '@/lib/prompts'

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated'
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const startTime = Date.now()
  try {
    const { transcript } = await req.json()
    if (!transcript || typeof transcript !== 'string') {
      return NextResponse.json({ error: 'transcript (string) required' }, { status: 400 })
    }

    const openRouterKey = process.env.OPENROUTER_API_KEY
    const textModel = process.env.OPENROUTER_MODEL
    if (!openRouterKey) {
      return NextResponse.json({ error: 'Server missing OPENROUTER_API_KEY' }, { status: 500 })
    }
    if (!textModel) {
      return NextResponse.json({ error: 'Server missing OPENROUTER_MODEL' }, { status: 500 })
    }

    console.log('[generate-html-from-transcript] Request received', {
      transcriptLength: transcript.length,
      transcriptPreview: transcript.substring(0, 100) + (transcript.length > 100 ? '...' : ''),
      model: textModel,
      timestamp: new Date().toISOString(),
    })

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://github.com/your-repo',
        'X-Title': 'Transcript to HTML Generator',
      },
      body: JSON.stringify({
        model: textModel,
        messages: [
          { role: 'system', content: TRANSCRIPT_TO_HTML_SYSTEM_PROMPT },
          { role: 'user', content: transcript },
        ],
        // No max_tokens limit - let the model generate the full HTML based on its context window
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const data = await response.json()
    let html = data.choices?.[0]?.message?.content?.trim() || ''
    
    console.log('[generate-html-from-transcript] Response received', {
      model: textModel,
      responseId: data.id || 'unknown',
      htmlLength: html.length,
      htmlPreview: html.substring(0, 500) + (html.length > 500 ? '...' : ''),
      fullHtml: html, // Log full HTML for debugging
      usage: data.usage || null,
    })
    
    if (!html) {
      console.error('[generate-html-from-transcript] Empty HTML generated', { data })
      return NextResponse.json({ error: 'Empty HTML generated' }, { status: 500 })
    }
    
    // Remove test content that might be injected by the model - AGGRESSIVE FILTERING
    const originalHtml = html
    
    // Remove test content in various forms
    const testPatterns = [
      /this\s+is\s+a\s+test/gi,
      /the\s+message\s+states[^<]*"this\s+is\s+a\s+test[^"]*"/gi,
      /<p[^>]*>.*?this\s+is\s+a\s+test.*?<\/p>/gi,
      /<h[1-6][^>]*>.*?this\s+is\s+a\s+test.*?<\/h[1-6]>/gi,
      /<div[^>]*>.*?this\s+is\s+a\s+test.*?<\/div>/gi,
      /this\s+is\s+a\s+test[^<]*/gi,
      /test\s+content/gi,
      /test\s+document/gi,
    ]
    
    let testContentFound = false
    for (const pattern of testPatterns) {
      if (pattern.test(html)) {
        testContentFound = true
        html = html.replace(pattern, '').trim()
      }
    }
    
    // Remove any HTML elements that contain ONLY test-related content
    html = html.replace(/<p[^>]*>[\s\n]*[^<]*this\s+is\s+a\s+test[^<]*[\s\n]*<\/p>/gi, '')
    html = html.replace(/<p[^>]*>[\s\n]*[^<]*the\s+message\s+states[^<]*[\s\n]*<\/p>/gi, '')
    html = html.replace(/<div[^>]*>[\s\n]*[^<]*this\s+is\s+a\s+test[^<]*[\s\n]*<\/div>/gi, '')
    
    // Remove empty paragraphs and clean up
    html = html.replace(/<p[^>]*>\s*<\/p>/gi, '')
    html = html.replace(/<p[^>]*>\s*\.\s*<\/p>/gi, '')
    html = html.replace(/\s{2,}/g, ' ')
    html = html.replace(/\n{3,}/g, '\n\n')
    
    // Final pass: remove any remaining test content strings
    html = html.replace(/this\s+is\s+a\s+test/gi, '')
    html = html.replace(/the\s+message\s+states[^<]*"this\s+is\s+a\s+test[^"]*"/gi, '')
    
    if (testContentFound || originalHtml.toLowerCase() !== html.toLowerCase()) {
      console.warn('[generate-html-from-transcript] ⚠️ Detected and removed test content', {
        beforeLength: originalHtml.length,
        afterLength: html.length,
        removed: originalHtml.length - html.length,
        beforePreview: originalHtml.substring(0, 300),
        afterPreview: html.substring(0, 300),
      })
    }

    // Strip accidental code fences
    if (html.startsWith('```')) {
      const lines = html.split('\n')
      html = lines.slice(1, -1).join('\n').trim()
    }

    // Ensure article wrapper if missing
    if (!html.toLowerCase().includes('<article')) {
      html = `<article>${html}</article>`
    }

    const totalElapsed = Date.now() - startTime
    console.log('[generate-html-from-transcript] ✅ HTML generation completed', {
      totalElapsed: `${totalElapsed}ms`,
      totalElapsedSeconds: `${(totalElapsed / 1000).toFixed(1)}s`,
      originalLength: originalHtml.length,
      finalLength: html.length,
      testContentRemoved: originalHtml.length !== html.length,
    })

    return NextResponse.json({ html })
  } catch (e: any) {
    const totalElapsed = Date.now() - startTime
    console.error('[generate-html-from-transcript] ❌ Error', {
      error: e?.message || e,
      errorType: e?.constructor?.name,
      stack: e?.stack?.split('\n').slice(0, 3).join(' | '),
      totalElapsed: `${totalElapsed}ms`,
    })
    return NextResponse.json({ error: e?.message || 'HTML generation failed' }, { status: 500 })
  }
}

