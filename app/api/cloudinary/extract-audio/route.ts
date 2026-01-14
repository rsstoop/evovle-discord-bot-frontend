import { NextRequest, NextResponse } from 'next/server';
import { compressAudioToSize, isCloudinaryConfigured } from '@/lib/cloudinary';
import { createClient } from '@supabase/supabase-js';

const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024; // 25MB - transcription API limit

export async function POST(req: NextRequest) {
  try {
    console.log('[Extract Audio] API called');

    // Validate Cloudinary configuration
    if (!isCloudinaryConfigured()) {
      console.error('[Extract Audio] Cloudinary not configured');
      return NextResponse.json(
        { error: 'Cloudinary is not configured. Please add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to environment variables.' },
        { status: 500 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { bucket, path, format } = body;

    if (!bucket || !path) {
      console.error('[Extract Audio] Missing required parameters:', { bucket, path });
      return NextResponse.json(
        { error: 'Missing required parameters: bucket and path' },
        { status: 400 }
      );
    }

    console.log(`[Extract Audio] Processing video: ${bucket}/${path}`);

    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Generate signed URL for video download (5-minute expiry)
    const { data: signedData, error: signedError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 300);

    if (signedError || !signedData?.signedUrl) {
      console.error('[Extract Audio] Failed to generate signed URL:', signedError);
      return NextResponse.json(
        { error: 'Failed to generate signed URL for video' },
        { status: 500 }
      );
    }

    console.log('[Extract Audio] Signed URL generated, downloading video...');

    // Download video from Supabase Storage with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2-minute timeout for large videos

    let videoResponse: Response;
    try {
      videoResponse = await fetch(signedData.signedUrl, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!videoResponse.ok) {
      console.error('[Extract Audio] Failed to download video:', videoResponse.status);
      return NextResponse.json(
        { error: `Failed to download video: ${videoResponse.statusText}` },
        { status: 500 }
      );
    }

    const videoArrayBuffer = await videoResponse.arrayBuffer();
    const videoBuffer = Buffer.from(videoArrayBuffer);

    const videoSizeMB = (videoBuffer.length / 1024 / 1024).toFixed(2);
    console.log(`[Extract Audio] Video downloaded successfully. Size: ${videoSizeMB} MB`);

    // Detect format from path if not provided
    const detectedFormat = format || path.split('.').pop()?.toLowerCase() || 'mp4';
    console.log(`[Extract Audio] Detected format: ${detectedFormat}`);

    // Extract and compress audio using Cloudinary
    console.log('[Extract Audio] Starting audio extraction with Cloudinary...');
    const audioBuffer = await compressAudioToSize(
      videoBuffer,
      MAX_AUDIO_SIZE_BYTES,
      detectedFormat
    );

    const audioSizeMB = (audioBuffer.length / 1024 / 1024).toFixed(2);
    console.log(`[Extract Audio] Audio extraction complete. Final audio size: ${audioSizeMB} MB`);

    // Return audio as base64
    const audioBase64 = audioBuffer.toString('base64');

    return NextResponse.json({
      success: true,
      audio: audioBase64,
      audioSize: audioBuffer.length,
      audioSizeMB: parseFloat(audioSizeMB),
      format: 'mp3',
    });
  } catch (error: any) {
    console.error('[Extract Audio] Error:', error);

    // Handle specific error types
    if (error.message?.includes('compress audio below')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Video download timeout. Please try with a smaller video file.' },
        { status: 408 }
      );
    }

    return NextResponse.json(
      { error: `Failed to extract audio: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
