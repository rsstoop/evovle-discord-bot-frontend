import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface SimilarDocument {
  id: string
  doc_id: number
  title: string
  similarity: number
  parent: string | null
}

export async function GET(
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

    // Determine if we're dealing with numeric doc_id or UUID id
    const numericId = Number(id)
    const isNumericId = !isNaN(numericId) && isFinite(numericId)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

    // First, get the source document's UUID
    let documentUuid: string
    if (isUUID) {
      documentUuid = id
    } else if (isNumericId) {
      const { data: doc, error: lookupError } = await supabaseAdmin
        .from('dashboard_knowledge_base')
        .select('id')
        .eq('doc_id', numericId)
        .single()

      if (lookupError || !doc) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }
      documentUuid = doc.id
    } else {
      documentUuid = id
    }

    // Get all documents with embeddings (for client-side similarity calculation)
    const { data: allDocs, error: docsError } = await supabaseAdmin
      .from('dashboard_knowledge_base')
      .select('id, doc_id, title, parent, embedding')
      .not('embedding', 'is', null)
      .is('deleted_at', null)

    if (docsError) {
      console.error('[similar-docs] Error fetching documents:', docsError)
      return NextResponse.json({ error: docsError.message }, { status: 500 })
    }

    // Find the source document's embedding
    const sourceDoc = (allDocs || []).find((doc: any) => doc.id === documentUuid)

    console.log('[similar-docs] Debug info:', {
      documentUuid,
      totalDocs: allDocs?.length || 0,
      sourceDocFound: !!sourceDoc,
      sourceEmbeddingType: sourceDoc?.embedding ? typeof sourceDoc.embedding : 'none',
      sourceEmbeddingIsArray: Array.isArray(sourceDoc?.embedding),
      sourceEmbeddingSample: sourceDoc?.embedding
        ? (typeof sourceDoc.embedding === 'string'
            ? sourceDoc.embedding.substring(0, 100)
            : Array.isArray(sourceDoc.embedding)
              ? `Array[${sourceDoc.embedding.length}]: [${sourceDoc.embedding.slice(0, 3).join(', ')}...]`
              : JSON.stringify(sourceDoc.embedding).substring(0, 100))
        : 'none'
    })

    if (!sourceDoc?.embedding) {
      return NextResponse.json({
        similar: [],
        message: 'Source document has no embedding'
      }, { status: 200 })
    }

    // Parse embedding - handle both array and string formats (pgvector returns strings)
    const parseEmbedding = (embedding: any): number[] => {
      if (Array.isArray(embedding)) {
        return embedding
      }
      if (typeof embedding === 'string') {
        // pgvector format: "[0.123,0.456,...]"
        try {
          const cleaned = embedding.replace(/^\[|\]$/g, '')
          return cleaned.split(',').map((s: string) => parseFloat(s.trim()))
        } catch (e) {
          console.error('[similar-docs] Failed to parse embedding string:', e)
          return []
        }
      }
      return []
    }

    // Calculate cosine similarity for all other documents
    const sourceEmbedding = parseEmbedding(sourceDoc.embedding)

    console.log('[similar-docs] Source embedding parsed:', {
      length: sourceEmbedding.length,
      sample: sourceEmbedding.slice(0, 5),
      hasValidValues: sourceEmbedding.length > 0 && !isNaN(sourceEmbedding[0])
    })

    const filteredDocs = (allDocs || []).filter((doc: any) => doc.id !== documentUuid && doc.embedding)

    console.log('[similar-docs] Filtered docs count:', filteredDocs.length)

    const docsWithSimilarity: SimilarDocument[] = []

    for (let i = 0; i < filteredDocs.length; i++) {
      const doc = filteredDocs[i]
      const docEmbedding = parseEmbedding(doc.embedding)
      const similarity = cosineSimilarity(sourceEmbedding, docEmbedding)

      // Debug first few comparisons
      if (i < 3) {
        console.log('[similar-docs] Comparison', i + 1, ':', {
          docId: doc.doc_id,
          title: doc.title,
          docEmbeddingLength: docEmbedding.length,
          docEmbeddingSample: docEmbedding.slice(0, 3),
          similarity,
          sourceLength: sourceEmbedding.length
        })
      }

      docsWithSimilarity.push({
        id: doc.id,
        doc_id: doc.doc_id,
        title: doc.title,
        parent: doc.parent,
        similarity: Math.round(similarity * 1000) / 1000 // Round to 3 decimal places
      })
    }

    // Sort by similarity descending and take top 15
    docsWithSimilarity.sort((a, b) => b.similarity - a.similarity)
    const topDocs = docsWithSimilarity.slice(0, 15)

    console.log('[similar-docs] Results:', {
      totalProcessed: docsWithSimilarity.length,
      topCount: topDocs.length,
      topSimilarities: topDocs.slice(0, 3).map(d => ({ doc_id: d.doc_id, similarity: d.similarity }))
    })

    return NextResponse.json({ similar: topDocs })
  } catch (error: any) {
    console.error('[similar-docs] Error:', error)
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}

// Cosine similarity calculation (fallback for when SQL approach doesn't work)
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}
