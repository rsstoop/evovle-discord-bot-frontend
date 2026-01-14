import { NextRequest, NextResponse } from 'next/server';
import { compressAudioToSize, isCloudinaryConfigured } from '@/lib/cloudinary';
import { cookies } from 'next/headers';

const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024; // 25MB - transcription API limit

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const cookieStore = await cookies();
    const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated';
    if (!authed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Upload and Extract] API called');

    // Validate Cloudinary configuration
    if (!isCloudinaryConfigured()) {
      console.error('[Upload and Extract] Cloudinary not configured');
      return NextResponse.json(
        { error: 'Cloudinary is not configured. Please add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to environment variables.' },
        { status: 500 }
      );
    }

    // Parse multipart form data
    const formData = await req.formData();
    const videoFile = formData.get('video') as File | null;
    const format = formData.get('format') as string | null;

    if (!videoFile) {
      console.error('[Upload and Extract] Missing video file');
      return NextResponse.json(
        { error: 'Missing video file in request' },
        { status: 400 }
      );
    }

    console.log(`[Upload and Extract] Processing video: ${videoFile.name}, size: ${(videoFile.size / 1024 / 1024).toFixed(2)}MB`);

    // Convert File to Buffer
    const arrayBuffer = await videoFile.arrayBuffer();
    const videoBuffer = Buffer.from(arrayBuffer);

    // Detect format from filename if not provided
    const detectedFormat = format || videoFile.name.split('.').pop()?.toLowerCase() || 'mp4';
    console.log(`[Upload and Extract] Detected format: ${detectedFormat}`);

    // Extract and compress audio using Cloudinary
    console.log('[Upload and Extract] Starting audio extraction with Cloudinary...');
    const audioBuffer = await compressAudioToSize(
      videoBuffer,
      MAX_AUDIO_SIZE_BYTES,
      detectedFormat
    );

    const audioSizeMB = (audioBuffer.length / 1024 / 1024).toFixed(2);
    console.log(`[Upload and Extract] Audio extraction complete. Final audio size: ${audioSizeMB} MB`);

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
    console.error('[Upload and Extract] Error:', error);

    // Handle specific error types
    if (error.message?.includes('compress audio below')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: `Failed to extract audio: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
