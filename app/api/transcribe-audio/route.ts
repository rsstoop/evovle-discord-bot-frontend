import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated';
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const startTime = Date.now();
  try {
    const { audioBase64, format = 'mp3' } = await req.json();

    if (!audioBase64) {
      console.error('[transcribe-audio] missing audioBase64');
      return NextResponse.json({ error: 'audioBase64 required' }, { status: 400 });
    }

    console.log('[transcribe-audio] 📍 STEP 1: Request received', {
      format,
      audioBase64Length: audioBase64.length,
      timestamp: new Date().toISOString()
    });

    // Convert base64 to buffer to check size
    const fileBuffer = Buffer.from(audioBase64, 'base64');
    const fileSizeMB = (fileBuffer.length / 1024 / 1024).toFixed(2);
    const fileSizeBytes = fileBuffer.length;
    const MAX_FILE_SIZE_MB = 25;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

    // Check file size
    if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
      console.error('[transcribe-audio] ❌ File size exceeds maximum', {
        fileSizeMB: parseFloat(fileSizeMB),
        maxSizeMB: MAX_FILE_SIZE_MB,
        fileSizeBytes,
      });
      return NextResponse.json(
        { error: `Audio size (${fileSizeMB}MB) exceeds maximum allowed size (${MAX_FILE_SIZE_MB}MB)` },
        { status: 400 }
      );
    }

    console.log('[transcribe-audio] 📍 STEP 2: Starting transcription via OpenRouter...', {
      fileSizeMB: parseFloat(fileSizeMB),
      fileSizeBytes,
      maxSizeMB: MAX_FILE_SIZE_MB,
    });

    // Transcribe with OpenRouter
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const audioModel = process.env.OPENROUTER_MODEL_AUDIO || 'google/gemini-2.5-flash';

    if (!openRouterKey) {
      console.error('[transcribe-audio] ❌ OPENROUTER_API_KEY missing from environment');
      return NextResponse.json({ error: 'Server missing OPENROUTER_API_KEY' }, { status: 500 });
    }

    console.log('[transcribe-audio] 🔄 Transcription attempt with model:', audioModel);
    const attemptStartTime = Date.now();

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
                  data: audioBase64,
                  format: format,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      let errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(`OpenRouter API error (${response.status}): ${errorJson.error?.message || errorJson.error || JSON.stringify(errorJson)}`);
      } catch {
        if (errorText.length > 500) {
          errorText = errorText.substring(0, 500) + '... (truncated)';
        }
        throw new Error(`OpenRouter API error (${response.status} ${response.statusText}): ${errorText}`);
      }
    }

    const data = await response.json();
    const transcriptionElapsed = Date.now() - attemptStartTime;

    // Validate response structure
    if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      throw new Error(`Invalid response structure from OpenRouter: ${JSON.stringify(data).substring(0, 200)}`);
    }

    // Extract transcript from response
    const transcriptText = data.choices[0]?.message?.content?.trim() || '';

    if (!transcriptText) {
      throw new Error('Empty transcript returned from OpenRouter');
    }

    console.log('[transcribe-audio] ✅ Transcription completed', {
      elapsed: `${transcriptionElapsed}ms`,
      model: audioModel,
      format: format,
      responseId: data.id || 'unknown',
      transcriptLength: transcriptText.length,
      wordCount: transcriptText.split(/\s+/).length,
      transcriptPreview: transcriptText.substring(0, 100) + (transcriptText.length > 100 ? '...' : ''),
      usage: data.usage || null,
    });

    const totalElapsed = Date.now() - startTime;
    console.log('[transcribe-audio] ✅✅✅ COMPLETE - Transcription successful!', {
      transcriptLength: transcriptText.length,
      wordCount: transcriptText.split(/\s+/).length,
      totalElapsed: `${totalElapsed}ms`,
      totalElapsedSeconds: `${(totalElapsed / 1000).toFixed(1)}s`
    });

    return NextResponse.json({ text: transcriptText });
  } catch (e: any) {
    const totalElapsed = Date.now() - startTime;
    console.error('[transcribe-audio] ❌❌❌ FATAL ERROR', {
      error: e?.message || e,
      errorType: e?.constructor?.name,
      stack: e?.stack?.split('\n').slice(0, 3).join(' | '),
      totalElapsed: `${totalElapsed}ms`
    });
    return NextResponse.json({ error: e?.message || 'Transcription failed' }, { status: 500 });
  }
}
