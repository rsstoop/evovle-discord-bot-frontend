import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import OpenAI from 'openai'
import { TRANSCRIPT_TO_HTML_SYSTEM_PROMPT } from '@/lib/prompts'

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated'
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { transcript } = await req.json()
    if (!transcript || typeof transcript !== 'string') {
      return NextResponse.json({ error: 'transcript (string) required' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'Server missing OPENAI_API_KEY' }, { status: 500 })
    const client = new OpenAI({ apiKey })

    const completion = await client.chat.completions.create({
      model: 'gpt-5-nano',
      messages: [
        { role: 'system', content: TRANSCRIPT_TO_HTML_SYSTEM_PROMPT },
        { role: 'user', content: transcript },
      ],
    })

    let html = completion.choices?.[0]?.message?.content?.trim() || ''
    if (!html) return NextResponse.json({ error: 'Empty HTML generated' }, { status: 500 })

    // Strip accidental code fences
    if (html.startsWith('```')) {
      const lines = html.split('\n')
      html = lines.slice(1, -1).join('\n').trim()
    }

    // Ensure article wrapper if missing
    if (!html.toLowerCase().includes('<article')) {
      html = `<article>${html}</article>`
    }

    return NextResponse.json({ html })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'HTML generation failed' }, { status: 500 })
  }
}

