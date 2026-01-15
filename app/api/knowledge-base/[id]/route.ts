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

    // Delete chunked embeddings first if numeric ID
    const numericId = Number(id)
    const isNumericId = !isNaN(numericId) && isFinite(numericId)

    if (isNumericId) {
      try {
        await deleteDocumentEmbeddings(numericId)
        console.log(`[delete-kb] Deleted chunked embeddings for document ${numericId}`)
      } catch (embedErr: any) {
        console.error(`[delete-kb] Failed to delete embeddings (non-fatal):`, embedErr.message)
      }
    }

    // Use raw SQL to delete - bypasses any issues with the ORM
    const { data, error, count } = await (supabaseAdmin as any)
      .from('dashboard_knowledge_base')
      .delete({ count: 'exact' })
      .eq('id', id)

    console.log(`[delete-kb] DELETE result:`, { data, error, count, id })

    if (error) {
      throw new Error(`Failed to delete: ${error.message || JSON.stringify(error)}`)
    }

    if (count === 0) {
      throw new Error(`Document with id ${id} not found`)
    }

    console.log(`[delete-kb] Successfully deleted ${count} row(s)`)
    return NextResponse.json({ success: true, deleted: count })
  } catch (error: any) {
    console.error(`[delete-kb] Final error:`, error)
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}


