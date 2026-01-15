import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash } from 'crypto';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const cookieStore = await cookies();
    const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated';
    if (!authed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      return NextResponse.json(
        { error: 'Cloudinary not configured' },
        { status: 500 }
      );
    }

    // Generate upload parameters
    const timestamp = Math.round(Date.now() / 1000);
    const folder = 'temp-video-processing';

    // Create signature for secure upload
    const signatureString = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = createHash('sha256').update(signatureString).digest('hex');

    return NextResponse.json({
      cloudName,
      apiKey,
      timestamp,
      signature,
      folder,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
    });
  } catch (error: any) {
    console.error('[upload-params] Error:', error);
    return NextResponse.json(
      { error: `Failed to generate upload params: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
