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

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  console.log('[delete-kb] DELETE request received')

  const cookieStore = await cookies()
  const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated'
  console.log('[delete-kb] Auth check:', { authed })

  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = await context.params
  const id = params?.id
  console.log('[delete-kb] Document ID:', id)

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  try {
    console.log('[delete-kb] Initializing Supabase admin client...')
    const supabaseAdmin = getSupabaseAdmin()
    console.log('[delete-kb] Admin client initialized successfully')

    // Determine if we're dealing with numeric doc_id or UUID id
    const numericId = Number(id)
    const isNumericId = !isNaN(numericId) && isFinite(numericId)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

    // If numeric ID, we need to look up the UUID first
    let documentUuid = id
    if (isNumericId) {
      console.log('[delete-kb] Looking up UUID for doc_id:', numericId)
      const { data: doc, error: lookupError } = await supabaseAdmin
        .from('dashboard_knowledge_base')
        .select('id')
        .eq('doc_id', numericId)
        .single()

      if (lookupError || !doc) {
        console.error('[delete-kb] Document not found:', lookupError)
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }
      documentUuid = doc.id
      console.log('[delete-kb] Found UUID:', documentUuid)
    }

    // Hard delete - permanently remove the document
    console.log('[delete-kb] Deleting document with UUID:', documentUuid)

    // CRITICAL: Use .select() to verify deletion
    const { data: deletedRows, error, status, statusText } = await supabaseAdmin
      .from('dashboard_knowledge_base')
      .delete()
      .eq('id', documentUuid)
      .select('id')  // ← Returns the deleted row(s)

    console.log('[delete-kb] Delete result:', {
      error,
      status,
      statusText,
      rowsDeleted: deletedRows?.length || 0
    })

    if (error) {
      console.error('[delete-kb] Delete failed:', error)
      throw new Error(`Delete failed: ${error.message}`)
    }

    // CRITICAL: Verify at least one row was deleted
    if (!deletedRows || deletedRows.length === 0) {
      console.error('[delete-kb] Silent failure: 0 rows deleted', {
        documentUuid,
        error,
        status
      })
      throw new Error(
        `Delete failed: Document not found or blocked by database policy (UUID: ${documentUuid})`
      )
    }

    console.log('[delete-kb] Document deleted successfully, rows affected:', deletedRows.length)
    return NextResponse.json({ success: true, deletedCount: deletedRows.length })
  } catch (error: any) {
    console.error('[delete-kb] Error:', error)
    return NextResponse.json({ error: error?.message ?? 'Failed to delete document' }, { status: 500 })
  }
}



