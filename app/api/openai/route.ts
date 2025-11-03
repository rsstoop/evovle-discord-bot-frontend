import { NextRequest, NextResponse } from 'next/server';

const DOCS_DOMAIN = process.env.DOCS_DOMAIN || 'docs-evolve.stoopdynamics.com';

export async function POST(request: NextRequest) {
  try {
    // Block access from public docs domain
    const hostname = request.headers.get('host') || '';
    const isDocsDomain = hostname === DOCS_DOMAIN || hostname.includes(DOCS_DOMAIN);
    
    if (isDocsDomain) {
      return NextResponse.json(
        { error: 'Not Found' },
        { status: 404 }
      );
    }

    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Get OpenAI API key from environment variable (server-side only)
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error('OPENAI_API_KEY not configured');
      return NextResponse.json(
        { error: 'OpenAI API not configured' },
        { status: 500 }
      );
    }

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      return NextResponse.json(
        { error: 'OpenAI API request failed' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ result: data.choices[0]?.message?.content || '' });

  } catch (error) {
    console.error('Error calling OpenAI:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

