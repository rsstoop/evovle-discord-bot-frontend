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

    const { error } = await supabaseAdmin
      .from('dashboard_knowledge_base')
      .update(updateData)
      .eq('id', id)

    if (error) throw error

    // Re-embed if HTML was updated
    // ID can be either number or UUID string - only embed if numeric ID
    if (html !== undefined) {
      const numericId = Number(id)
      const isNumericId = !isNaN(numericId) && isFinite(numericId)
      
      if (isNumericId) {
        try {
          // Use Promise.race to timeout after 240 seconds
          const embeddingPromise = embedDocument(numericId, true)
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Embedding timeout')), 240000)
          )
          await Promise.race([embeddingPromise, timeoutPromise])
          console.log(`[update-kb] Document ${numericId} re-embedded successfully`)
        } catch (embedErr: any) {
          // Log error but don't fail the update - embeddings can be regenerated later
          console.error(`[update-kb] Failed to re-embed document ${numericId} (non-fatal):`, embedErr.message)
        }
      } else {
        console.log(`[update-kb] Skipping embedding for UUID ID: ${id}`)
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
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = await context.params
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  try {
    const supabaseAdmin = getSupabaseAdmin()
    
    console.log(`[delete-kb] Attempting to delete document with id: ${id} (type: ${typeof id})`)

    // First, verify the document exists and get its actual ID
    const { data: existingDoc, error: fetchError } = await supabaseAdmin
      .from('dashboard_knowledge_base')
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) {
      console.error(`[delete-kb] Error checking if document exists:`, fetchError)
      throw fetchError
    }

    if (!existingDoc) {
      console.error(`[delete-kb] Document with id ${id} not found`)
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    console.log(`[delete-kb] Document exists, proceeding with deletion. Actual ID from DB:`, existingDoc.id)

    // Delete chunked embeddings first (then delete the document)
    // The full document embedding will be automatically deleted when the document row is deleted
    // ID can be either number or UUID string - try to convert to number for embeddings, but use original ID for DB operations
    const numericId = Number(id)
    const isNumericId = !isNaN(numericId) && isFinite(numericId)
    
    if (isNumericId) {
      try {
        await deleteDocumentEmbeddings(numericId)
        console.log(`[delete-kb] Deleted chunked embeddings for document ${numericId}`)
      } catch (embedErr: any) {
        // Log error but continue - document deletion should still proceed
        console.error(`[delete-kb] Failed to delete embeddings for ${numericId} (non-fatal):`, embedErr.message)
      }
    } else {
      console.log(`[delete-kb] Skipping embedding cleanup for UUID ID: ${id}`)
    }

    // Delete the document using the original ID (works for both numeric and UUID)
    const { data: deletedData, error } = await supabaseAdmin
      .from('dashboard_knowledge_base')
      .delete()
      .eq('id', id)
      .select()

    if (error) {
      console.error(`[delete-kb] Failed to delete document ${id}:`, error)
      throw error
    }

    // Check if any rows were actually deleted
    if (!deletedData || deletedData.length === 0) {
      console.error(`[delete-kb] No rows deleted for id ${id}. This might indicate a type mismatch.`)
      return NextResponse.json({ error: 'Document not found or could not be deleted' }, { status: 404 })
    }

    console.log(`[delete-kb] Successfully deleted document ${id} (deleted ${deletedData.length} row(s))`)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}


