import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface SimilarPair {
  doc1: {
    id: string
    doc_id: number
    title: string
    parent: string | null
  }
  doc2: {
    id: string
    doc_id: number
    title: string
    parent: string | null
  }
  similarity: number
}

export async function GET(_req: Request) {
  const cookieStore = await cookies()
  const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated'
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabaseAdmin = getSupabaseAdmin()

    // Get all documents with embeddings
    const { data: allDocs, error: docsError } = await supabaseAdmin
      .from('dashboard_knowledge_base')
      .select('id, doc_id, title, parent, embedding')
      .not('embedding', 'is', null)
      .is('deleted_at', null)

    if (docsError) {
      console.error('[similar-pairs] Error fetching documents:', docsError)
      return NextResponse.json({ error: docsError.message }, { status: 500 })
    }

    if (!allDocs || allDocs.length < 2) {
      return NextResponse.json({ pairs: [], message: 'Not enough documents with embeddings' })
    }

    console.log('[similar-pairs] Processing', allDocs.length, 'documents')

    // Parse all embeddings first
    const docsWithParsedEmbeddings = allDocs.map((doc: any) => ({
      id: doc.id,
      doc_id: doc.doc_id,
      title: doc.title,
      parent: doc.parent,
      embedding: parseEmbedding(doc.embedding)
    })).filter(doc => doc.embedding.length > 0)

    console.log('[similar-pairs] Parsed embeddings for', docsWithParsedEmbeddings.length, 'documents')

    // Compare all pairs and collect those above threshold
    const similarPairs: SimilarPair[] = []
    const SIMILARITY_THRESHOLD = 0.70 // Only show pairs with 70%+ similarity

    for (let i = 0; i < docsWithParsedEmbeddings.length; i++) {
      for (let j = i + 1; j < docsWithParsedEmbeddings.length; j++) {
        const doc1 = docsWithParsedEmbeddings[i]
        const doc2 = docsWithParsedEmbeddings[j]

        const similarity = cosineSimilarity(doc1.embedding, doc2.embedding)

        if (similarity >= SIMILARITY_THRESHOLD) {
          similarPairs.push({
            doc1: {
              id: doc1.id,
              doc_id: doc1.doc_id,
              title: doc1.title,
              parent: doc1.parent
            },
            doc2: {
              id: doc2.id,
              doc_id: doc2.doc_id,
              title: doc2.title,
              parent: doc2.parent
            },
            similarity: Math.round(similarity * 1000) / 1000
          })
        }
      }
    }

    // Sort by similarity descending
    similarPairs.sort((a, b) => b.similarity - a.similarity)

    console.log('[similar-pairs] Found', similarPairs.length, 'similar pairs above', SIMILARITY_THRESHOLD * 100, '% threshold')
    if (similarPairs.length > 0) {
      console.log('[similar-pairs] Top pairs:', similarPairs.slice(0, 5).map(p => ({
        doc1: p.doc1.doc_id,
        doc2: p.doc2.doc_id,
        similarity: p.similarity
      })))
    }

    return NextResponse.json({
      pairs: similarPairs,
      totalDocs: docsWithParsedEmbeddings.length,
      threshold: SIMILARITY_THRESHOLD
    })
  } catch (error: any) {
    console.error('[similar-pairs] Error:', error)
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}

// Parse embedding - handle both array and string formats (pgvector returns strings)
function parseEmbedding(embedding: any): number[] {
  if (Array.isArray(embedding)) {
    return embedding
  }
  if (typeof embedding === 'string') {
    // pgvector format: "[0.123,0.456,...]"
    try {
      const cleaned = embedding.replace(/^\[|\]$/g, '')
      return cleaned.split(',').map((s: string) => parseFloat(s.trim()))
    } catch (e) {
      console.error('[similar-pairs] Failed to parse embedding string:', e)
      return []
    }
  }
  return []
}

// Cosine similarity calculation
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0

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
