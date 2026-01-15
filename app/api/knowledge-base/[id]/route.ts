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
    console.log(`[delete-kb] Supabase admin initialized`, {
      hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...'
    })

    // Determine if we're dealing with numeric doc_id or UUID id
    const numericId = Number(id)
    const isNumericId = !isNaN(numericId) && isFinite(numericId)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

    console.log(`[delete-kb] ID type check:`, { isNumericId, isUUID, id })

    // First, check if the document exists (search by appropriate field)
    // UUID → query by 'id' (UUID primary key)
    // Number → query by 'doc_id' (integer display ID)
    let query = supabaseAdmin.from('dashboard_knowledge_base').select('id, doc_id, title')

    if (isUUID) {
      query = query.eq('id', id)
    } else if (isNumericId) {
      query = query.eq('doc_id', numericId)
    } else {
      // Fallback: try as string ID
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
    // UUID → delete by 'id' (UUID primary key)
    // Number → delete by 'doc_id' (integer display ID)
    console.log(`[delete-kb] Preparing DELETE query:`, {
      isUUID,
      isNumericId,
      queryField: isUUID ? 'id' : isNumericId ? 'doc_id' : 'id (fallback)',
      queryValue: isUUID ? id : isNumericId ? numericId : id,
      actualDocumentId: existingDoc.id
    })

    let deleteQuery = supabaseAdmin.from('dashboard_knowledge_base').delete()

    if (isUUID) {
      deleteQuery = deleteQuery.eq('id', id)
    } else if (isNumericId) {
      deleteQuery = deleteQuery.eq('doc_id', numericId)
    } else {
      // Fallback: try as string ID
      deleteQuery = deleteQuery.eq('id', id)
    }

    const { error: deleteError, count } = await deleteQuery

    console.log(`[delete-kb] DELETE executed:`, {
      deleteError: deleteError?.message,
      count,
      id,
      expectedDocId: existingDoc.id
    })

    if (deleteError) {
      throw new Error(`Failed to delete: ${deleteError.message || JSON.stringify(deleteError)}`)
    }

    // Verify deletion
    const { data: checkDoc, error: checkError } = await supabaseAdmin
      .from('dashboard_knowledge_base')
      .select('id')
      .eq('id', existingDoc.id)
      .maybeSingle()

    console.log(`[delete-kb] Post-delete verification:`, {
      stillExists: !!checkDoc,
      checkError: checkError?.message,
      success: !checkDoc
    })

    if (checkDoc) {
      console.error(`[delete-kb] CRITICAL: Document still exists after DELETE!`, {
        documentId: existingDoc.id,
        doc_id: existingDoc.doc_id,
        title: existingDoc.title
      })
      return NextResponse.json({
        error: 'Delete operation failed - document still exists in database',
        details: 'The DELETE query executed but the row was not removed. Check RLS policies and database permissions.'
      }, { status: 500 })
    }

    console.log(`[delete-kb] SUCCESS: Document deleted and verified`)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error(`[delete-kb] Final error:`, error)
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}


