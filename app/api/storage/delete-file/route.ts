import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // Check authentication
  const cookieStore = await cookies();
  const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated';
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { bucket, path } = await req.json();

    if (!bucket || !path) {
      console.error('[delete-file] Missing required parameters:', { bucket, path });
      return NextResponse.json(
        { error: 'Missing required parameters: bucket and path' },
        { status: 400 }
      );
    }

    console.log('[delete-file] Deleting file from storage', { bucket, path });

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage.from(bucket).remove([path]);

    if (error) {
      console.error('[delete-file] Failed to delete file:', error);
      return NextResponse.json(
        { error: `Failed to delete file: ${error.message}` },
        { status: 500 }
      );
    }

    console.log('[delete-file] File deleted successfully', { bucket, path });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[delete-file] Error:', error);
    return NextResponse.json(
      { error: `Failed to delete file: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
