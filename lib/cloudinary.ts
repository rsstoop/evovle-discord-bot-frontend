import { v2 as cloudinary } from 'cloudinary';

/**
 * Ensures Cloudinary is configured before each API call
 */
function ensureCloudinaryConfig() {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary credentials not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  console.log('[Cloudinary] Configured with cloud_name:', process.env.CLOUDINARY_CLOUD_NAME);
}

/**
 * Extracts audio from a video file using Cloudinary transformations
 * Uploads video, transforms to MP3, downloads result, and deletes from Cloudinary
 *
 * @param videoBuffer - Video file as a Buffer
 * @param targetBitrate - Target audio bitrate (e.g., '64k', '32k')
 * @param format - Original video format extension (e.g., 'mp4', 'mov')
 * @returns Extracted and compressed audio as Buffer
 */
export async function extractAudioFromVideo(
  videoBuffer: Buffer,
  targetBitrate: string = '64k',
  format: string = 'mp4'
): Promise<Buffer> {
  let publicId: string | null = null;

  try {
    // Ensure Cloudinary is configured
    ensureCloudinaryConfig();

    console.log(`[Cloudinary] Starting audio extraction. Video size: ${videoBuffer.length} bytes, target bitrate: ${targetBitrate}`);

    // Upload video to Cloudinary WITHOUT any format conversion or transformations
    // This avoids the "too large to process synchronously" error
    const uploadResult = await new Promise<any>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'video',
          folder: 'temp-video-processing',
          // Don't specify format - upload as-is to avoid sync processing
          // Don't use eager transformations - we'll request the transformation on-demand
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      uploadStream.end(videoBuffer);
    });

    publicId = uploadResult.public_id;
    console.log(`[Cloudinary] Video uploaded successfully. Public ID: ${publicId}`);

    if (!publicId) {
      throw new Error('Failed to get public_id from Cloudinary upload response');
    }

    // Generate transformation URL - this will trigger on-demand transformation
    console.log(`[Cloudinary] Requesting audio transformation (this will process asynchronously)...`);

    const audioUrl = cloudinary.url(publicId, {
      resource_type: 'video',
      format: 'mp3',
      audio_codec: 'mp3',
      bit_rate: targetBitrate,
    });

    console.log(`[Cloudinary] Audio transformation URL: ${audioUrl}`);

    // Poll for the transformed audio to be ready (on-demand transformations process async)
    console.log(`[Cloudinary] Polling for audio extraction to complete...`);

    let pollAttempts = 0;
    const maxPollAttempts = 60; // 60 attempts x 3 seconds = 3 minutes max wait
    let audioReady = false;

    while (pollAttempts < maxPollAttempts && !audioReady) {
      pollAttempts++;

      try {
        // Attempt to fetch the audio file
        const response = await fetch(audioUrl, { method: 'HEAD' });

        if (response.ok) {
          // Transformation is ready
          audioReady = true;
          console.log(`[Cloudinary] Audio extraction completed after ${pollAttempts} attempts (${pollAttempts * 3}s)`);
          break;
        } else if (response.status === 423) {
          // 423 = Locked, still processing
          console.log(`[Cloudinary] Still processing... (attempt ${pollAttempts}/${maxPollAttempts})`);
        } else if (response.status === 404 || response.status === 202) {
          // 404 or 202 = Not ready yet, transformation queued
          console.log(`[Cloudinary] Transformation queued/processing... (attempt ${pollAttempts}/${maxPollAttempts})`);
        } else {
          console.log(`[Cloudinary] Status ${response.status}, retrying... (attempt ${pollAttempts}/${maxPollAttempts})`);
        }
      } catch (fetchError) {
        console.log(`[Cloudinary] Fetch error during poll, retrying... (attempt ${pollAttempts}/${maxPollAttempts})`);
      }

      // Wait 3 seconds before next poll (give Cloudinary time to process)
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    if (!audioReady) {
      throw new Error('Audio extraction timed out after 3 minutes. Video may be too large or complex to process.');
    }

    console.log(`[Cloudinary] Audio is ready for download`);

    // Download the transformed audio with retry logic
    const audioBuffer = await downloadWithRetry(audioUrl, 3);

    console.log(`[Cloudinary] Audio extracted successfully. Size: ${audioBuffer.length} bytes`);

    return audioBuffer;
  } finally {
    // Always clean up: delete the video from Cloudinary
    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
        console.log(`[Cloudinary] Video deleted successfully. Public ID: ${publicId}`);
      } catch (deleteError) {
        console.error(`[Cloudinary] Failed to delete video. Public ID: ${publicId}`, deleteError);
        // Don't throw - cleanup failure shouldn't block the flow
      }
    }
  }
}

/**
 * Compresses audio to meet size requirements by trying multiple bitrates
 *
 * @param videoBuffer - Original video file as Buffer
 * @param maxSizeBytes - Maximum allowed audio size in bytes (default: 25MB)
 * @param format - Original video format
 * @returns Compressed audio buffer that meets size requirement
 * @throws Error if unable to compress below size limit
 */
export async function compressAudioToSize(
  videoBuffer: Buffer,
  maxSizeBytes: number = 25 * 1024 * 1024, // 25MB default
  format: string = 'mp4'
): Promise<Buffer> {
  // Try different bitrates in descending order
  const bitrates = ['64k', '48k', '32k', '24k', '16k'];

  for (const bitrate of bitrates) {
    console.log(`[Cloudinary] Attempting compression with bitrate: ${bitrate}`);

    const audioBuffer = await extractAudioFromVideo(videoBuffer, bitrate, format);

    console.log(`[Cloudinary] Compressed audio size: ${audioBuffer.length} bytes (${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

    if (audioBuffer.length <= maxSizeBytes) {
      console.log(`[Cloudinary] Compression successful at ${bitrate}`);
      return audioBuffer;
    }

    console.log(`[Cloudinary] Still too large. Trying next bitrate...`);
  }

  // If we've tried all bitrates and still too large
  const sizeInMB = (maxSizeBytes / 1024 / 1024).toFixed(2);
  throw new Error(
    `Unable to compress audio below ${sizeInMB}MB. Video is too long or has too much audio content. ` +
    `Please upload a shorter video or trim the content.`
  );
}

/**
 * Downloads a file from URL with retry logic
 *
 * @param url - URL to download from
 * @param maxRetries - Maximum number of retry attempts
 * @returns Downloaded file as Buffer
 */
async function downloadWithRetry(url: string, maxRetries: number = 3): Promise<Buffer> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Cloudinary] Download attempt ${attempt}/${maxRetries}`);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      lastError = error as Error;
      console.error(`[Cloudinary] Download attempt ${attempt} failed:`, error);

      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`[Cloudinary] Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new Error(`Failed to download after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Validates Cloudinary configuration
 * @returns true if properly configured, false otherwise
 */
export function isCloudinaryConfigured(): boolean {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}
