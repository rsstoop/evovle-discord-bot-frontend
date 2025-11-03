import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  const cookieStore = await cookies()
  const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated'
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('dashboard')
      .select('included_channel_ids')
      .single()

    if (error) {
      // If no row exists, return empty array
      if (error.code === 'PGRST116') {
        return NextResponse.json({ included_channel_ids: [] })
      }
      throw error
    }

    return NextResponse.json({
      included_channel_ids: data?.included_channel_ids || []
    })
  } catch (error: any) {
    console.error('[dashboard] GET error', error)
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const cookieStore = await cookies()
  const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated'
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabaseAdmin = getSupabaseAdmin()
    const { included_channel_ids } = await req.json()

    if (!Array.isArray(included_channel_ids)) {
      return NextResponse.json({ error: 'included_channel_ids must be an array' }, { status: 400 })
    }

    // Validate all items are strings
    if (!included_channel_ids.every((id: any) => typeof id === 'string')) {
      return NextResponse.json({ error: 'All channel IDs must be strings' }, { status: 400 })
    }

    // Check if row exists
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('dashboard')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError
    }

    if (existing) {
      // Update existing row
      const { error: updateError } = await supabaseAdmin
        .from('dashboard')
        .update({ included_channel_ids })
        .eq('id', existing.id)

      if (updateError) throw updateError
    } else {
      // Insert new row
      const { error: insertError } = await supabaseAdmin
        .from('dashboard')
        .insert({ included_channel_ids })

      if (insertError) throw insertError
    }

    return NextResponse.json({ success: true, included_channel_ids })
  } catch (error: any) {
    console.error('[dashboard] PUT error', error)
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}

