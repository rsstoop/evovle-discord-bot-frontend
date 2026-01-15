import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { embedDocument, deleteDocumentEmbeddings } from '@/lib/embedDocument'

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

    // Determine if we're dealing with numeric ID or UUID (doc_id)
    const numericId = Number(id)
    const isNumericId = !isNaN(numericId) && isFinite(numericId)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

    // Build the update query with the appropriate field
    let updateQuery = supabaseAdmin.from('dashboard_knowledge_base').update(updateData)

    if (isNumericId) {
      updateQuery = updateQuery.eq('id', numericId)
    } else if (isUUID) {
      updateQuery = updateQuery.eq('doc_id', id)
    } else {
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
  const cookieStore = await cookies()
  const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated'
  console.log(`[delete-kb] Auth check:`, { authed })

  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = await context.params
  const id = params?.id
  console.log(`[delete-kb] Params received:`, { id, type: typeof id, params })

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  try {
    const supabaseAdmin = getSupabaseAdmin()
    console.log(`[delete-kb] Supabase admin initialized`)

    // Determine if we're dealing with numeric ID or UUID (doc_id)
    const numericId = Number(id)
    const isNumericId = !isNaN(numericId) && isFinite(numericId)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

    console.log(`[delete-kb] ID type check:`, { isNumericId, isUUID, id })

    // First, check if the document exists (search by appropriate field)
    let query = supabaseAdmin.from('dashboard_knowledge_base').select('id, doc_id, title')

    if (isNumericId) {
      query = query.eq('id', numericId)
    } else if (isUUID) {
      query = query.eq('doc_id', id)
    } else {
      query = query.eq('id', id)
    }

    const { data: existingDoc, error: fetchError } = await query.single()

    console.log(`[delete-kb] Document lookup:`, {
      exists: !!existingDoc,
      doc: existingDoc,
      fetchError: fetchError?.message
    })

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw new Error(`Error checking document: ${fetchError.message}`)
    }

    if (!existingDoc) {
      return NextResponse.json({ error: `Document with id ${id} not found` }, { status: 404 })
    }

    // Delete chunked embeddings first using the actual numeric ID
    const actualNumericId = existingDoc.id
    if (typeof actualNumericId === 'number') {
      try {
        await deleteDocumentEmbeddings(actualNumericId)
        console.log(`[delete-kb] Deleted chunked embeddings for document ${actualNumericId}`)
      } catch (embedErr: any) {
        console.error(`[delete-kb] Failed to delete embeddings (non-fatal):`, embedErr.message)
      }
    }

    // Delete the document using the appropriate field
    let deleteQuery = supabaseAdmin.from('dashboard_knowledge_base').delete()

    if (isNumericId) {
      deleteQuery = deleteQuery.eq('id', numericId)
    } else if (isUUID) {
      deleteQuery = deleteQuery.eq('doc_id', id)
    } else {
      deleteQuery = deleteQuery.eq('id', id)
    }

    const { error: deleteError } = await deleteQuery

    console.log(`[delete-kb] DELETE executed:`, {
      deleteError: deleteError?.message,
      id
    })

    if (deleteError) {
      throw new Error(`Failed to delete: ${deleteError.message || JSON.stringify(deleteError)}`)
    }

    // Verify deletion
    const { data: checkDoc } = await supabaseAdmin
      .from('dashboard_knowledge_base')
      .select('id')
      .eq('id', id)
      .single()

    console.log(`[delete-kb] Post-delete verification:`, {
      stillExists: !!checkDoc,
      success: !checkDoc
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error(`[delete-kb] Final error:`, error)
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}


