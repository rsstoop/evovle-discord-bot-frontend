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
      .select('included_channel_ids, greeting_reply_guidelines')
      .single()

    if (error) {
      // If no row exists, return empty values
      if (error.code === 'PGRST116') {
        return NextResponse.json({ 
          included_channel_ids: [],
          greeting_reply_guidelines: ''
        })
      }
      throw error
    }

    return NextResponse.json({
      included_channel_ids: data?.included_channel_ids || [],
      greeting_reply_guidelines: data?.greeting_reply_guidelines || ''
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
    const { included_channel_ids, greeting_reply_guidelines } = await req.json()

    // Validate included_channel_ids if provided
    if (included_channel_ids !== undefined) {
      if (!Array.isArray(included_channel_ids)) {
        return NextResponse.json({ error: 'included_channel_ids must be an array' }, { status: 400 })
      }

      // Validate all items are strings
      if (!included_channel_ids.every((id: any) => typeof id === 'string')) {
        return NextResponse.json({ error: 'All channel IDs must be strings' }, { status: 400 })
      }
    }

    // Validate greeting_reply_guidelines if provided
    if (greeting_reply_guidelines !== undefined && typeof greeting_reply_guidelines !== 'string') {
      return NextResponse.json({ error: 'greeting_reply_guidelines must be a string' }, { status: 400 })
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

    // Build update object with only provided fields
    const updateData: any = {}
    if (included_channel_ids !== undefined) {
      updateData.included_channel_ids = included_channel_ids
    }
    if (greeting_reply_guidelines !== undefined) {
      updateData.greeting_reply_guidelines = greeting_reply_guidelines
    }

    if (existing) {
      // Update existing row
      const { error: updateError } = await supabaseAdmin
        .from('dashboard')
        .update(updateData)
        .eq('id', existing.id)

      if (updateError) throw updateError
    } else {
      // Insert new row with defaults for missing fields
      const insertData = {
        included_channel_ids: included_channel_ids || [],
        greeting_reply_guidelines: greeting_reply_guidelines || '',
      }
      const { error: insertError } = await supabaseAdmin
        .from('dashboard')
        .insert(insertData)

      if (insertError) throw insertError
    }

    return NextResponse.json({ success: true, ...updateData })
  } catch (error: any) {
    console.error('[dashboard] PUT error', error)
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}

