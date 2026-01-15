import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { embedDocument } from '@/lib/embedDocument'

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies()
  const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated'
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = await context.params
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  try {
    const { html, parent } = await req.json()

    if (html !== undefined && typeof html !== 'string') {
      return NextResponse.json({ error: 'html must be a string' }, { status: 400 })
    }

    if (parent !== undefined && typeof parent !== 'string' && parent !== null) {
      return NextResponse.json({ error: 'parent must be a string or null' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const updateData: any = { updated_at: new Date().toISOString() }

    if (html !== undefined) {
      updateData.html = html
    }

    if (parent !== undefined) {
      updateData.parent = parent === null || parent.trim() === '' ? null : parent.trim()
    }

    // Determine if we're dealing with numeric doc_id or UUID id
    const numericId = Number(id)
    const isNumericId = !isNaN(numericId) && isFinite(numericId)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

    // Build the update query with the appropriate field
    // UUID → query by 'id' (UUID primary key)
    // Number → query by 'doc_id' (integer display ID)
    let updateQuery = supabaseAdmin.from('dashboard_knowledge_base').update(updateData)

    if (isUUID) {
      updateQuery = updateQuery.eq('id', id)
    } else if (isNumericId) {
      updateQuery = updateQuery.eq('doc_id', numericId)
    } else {
      // Fallback: try as string ID
      updateQuery = updateQuery.eq('id', id)
    }

    const { data, error } = await updateQuery.select('id').single()

    if (error) throw error

    // Re-embed if HTML was updated - use the actual numeric ID from the result
    if (html !== undefined && data?.id) {
      const actualNumericId = data.id
      if (typeof actualNumericId === 'number') {
        try {
          // Use Promise.race to timeout after 240 seconds
          const embeddingPromise = embedDocument(actualNumericId, true)
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Embedding timeout')), 240000)
          )
          await Promise.race([embeddingPromise, timeoutPromise])
          console.log(`[update-kb] Document ${actualNumericId} re-embedded successfully`)
        } catch (embedErr: any) {
          // Log error but don't fail the update - embeddings can be regenerated later
          console.error(`[update-kb] Failed to re-embed document ${actualNumericId} (non-fatal):`, embedErr.message)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}



