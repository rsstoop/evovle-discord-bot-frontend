import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { v2 as cloudinary } from 'cloudinary';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for video processing

const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

function ensureCloudinaryConfig() {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary credentials not configured');
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

async function downloadWithRetry(url: string, maxRetries: number = 3): Promise<Buffer> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new Error(`Failed to download after ${maxRetries} attempts: ${lastError?.message}`);
}

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const cookieStore = await cookies();
    const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated';
    if (!authed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { publicId, bitrate = '64k' } = await req.json();

    if (!publicId) {
      return NextResponse.json(
        { error: 'Missing publicId parameter' },
        { status: 400 }
      );
    }

    console.log('[process-video] Processing video from Cloudinary', { publicId, bitrate });

    ensureCloudinaryConfig();

    // Generate audio transformation URL
    const audioUrl = cloudinary.url(publicId, {
      resource_type: 'video',
      format: 'mp3',
      audio_codec: 'mp3',
      bit_rate: bitrate,
    });

    console.log('[process-video] Audio transformation URL:', audioUrl);

    // Poll for transformation to complete
    let pollAttempts = 0;
    const maxPollAttempts = 60;
    let audioReady = false;

    while (pollAttempts < maxPollAttempts && !audioReady) {
      pollAttempts++;

      try {
        const response = await fetch(audioUrl, { method: 'HEAD' });

        if (response.ok) {
          audioReady = true;
          break;
        }
      } catch (fetchError) {
        console.log(`[process-video] Poll attempt ${pollAttempts} failed, retrying...`);
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    if (!audioReady) {
      throw new Error('Audio extraction timed out after 3 minutes');
    }

    console.log('[process-video] Audio is ready, downloading...');

    // Download audio
    const audioBuffer = await downloadWithRetry(audioUrl, 3);
    const audioSizeMB = (audioBuffer.length / 1024 / 1024).toFixed(2);

    console.log('[process-video] Audio downloaded', { audioSizeMB });

    // Check if we need more aggressive compression
    if (audioBuffer.length > MAX_AUDIO_SIZE_BYTES && bitrate !== '16k') {
      console.log('[process-video] Audio too large, trying lower bitrate');

      // Try next lower bitrate
      const bitrates = ['64k', '48k', '32k', '24k', '16k'];
      const currentIndex = bitrates.indexOf(bitrate);

      if (currentIndex < bitrates.length - 1) {
        const nextBitrate = bitrates[currentIndex + 1];

        // Recursive call with lower bitrate
        return NextResponse.json({
          needsRecompression: true,
          nextBitrate,
        });
      } else {
        throw new Error('Unable to compress audio below 25MB');
      }
    }

    // Delete video from Cloudinary
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
      console.log('[process-video] Video deleted from Cloudinary');
    } catch (deleteError) {
      console.error('[process-video] Failed to delete video (non-fatal):', deleteError);
    }

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
    console.error('[process-video] Error:', error);
    return NextResponse.json(
      { error: `Failed to process video: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
