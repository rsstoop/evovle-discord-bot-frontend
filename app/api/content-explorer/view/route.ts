import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated'
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const fileName = searchParams.get('file')

    if (!fileName) {
      return NextResponse.json({ error: 'File name is required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const bucket = 'public'
    const filePath = `content_explorer/${fileName}`

    // Download the file content
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(filePath)

    if (error) {
      // Try to get public URL as fallback (this is expected to work for public files)
      const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath)
      
      if (publicUrlData?.publicUrl) {
        try {
          // Fetch from public URL
          const publicResponse = await fetch(publicUrlData.publicUrl)
          if (publicResponse.ok) {
            const htmlContent = await publicResponse.text()
            return NextResponse.json({ content: htmlContent, fileName, useIframe: true })
          }
        } catch (fetchError) {
          console.error('Public URL fetch error:', fetchError)
        }
      }
      
      // Only log error if fallback also failed
      console.error('Storage download error (fallback also failed):', error)
      return NextResponse.json({ 
        error: error.message || 'Failed to download file'
      }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'File not found or empty' }, { status: 404 })
    }

    // Convert blob to text - return full HTML for iframe approach
    const htmlContent = await data.text()

    // Return the full HTML document - no extraction needed!
    // The client will load this in an iframe which preserves everything
    // Note: 100vh/100vw work correctly in iframes, so no replacement needed
    return NextResponse.json({ content: htmlContent, fileName, useIframe: true })
  } catch (e: any) {
    console.error('Failed to fetch file content:', e)
    return NextResponse.json({ error: e?.message || 'Failed to fetch file content' }, { status: 500 })
  }
}

