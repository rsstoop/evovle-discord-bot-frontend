import { getSupabaseAdmin } from './supabaseAdmin'
import { htmlToText } from 'html-to-text'

// Configuration - match embed_kb.cjs defaults
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'openai/text-embedding-3-small'
const CHUNK_MAX_CHARS = Number(process.env.KB_CHUNK_MAX_CHARS || 4500)
const CHUNK_OVERLAP_CHARS = Number(process.env.KB_CHUNK_OVERLAP_CHARS || 680)
const EMBED_BATCH_SIZE = Number(process.env.KB_EMBED_BATCH_SIZE || 100)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings'

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[\t\r]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractTitleFromHtml(html: string): string | undefined {
  const match = html.match(/<h1[^>]*>(.*?)<\/h1>/i)
  if (match && match[1]) return htmlToText(match[1], { wordwrap: false, preserveNewlines: true }).trim()
  return undefined
}

function htmlToPlainText(html: string): string {
  const text = htmlToText(html, {
    wordwrap: false,
    preserveNewlines: true,
    selectors: [
      { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
      { selector: 'img', format: 'skip' },
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'h1', options: { uppercase: false } },
      { selector: 'h2', options: { uppercase: false } },
      { selector: 'h3', options: { uppercase: false } },
      { selector: 'h4', options: { uppercase: false } },
      { selector: 'h5', options: { uppercase: false } },
      { selector: 'h6', options: { uppercase: false } },
    ],
  })
  return normalizeWhitespace(text)
}

function splitSectionsByHeadings(html: string) {
  const sections: Array<{ level: number | null; headingText: string | null; html: string }> = []
  const headingRegex = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi
  const tokens: Array<{ level: number; innerHtml: string; index: number; length: number }> = []
  let match: RegExpExecArray | null

  while ((match = headingRegex.exec(html)) !== null) {
    tokens.push({
      level: parseInt(match[1], 10),
      innerHtml: match[2],
      index: match.index,
      length: match[0].length,
    })
  }

  if (tokens.length === 0) {
    sections.push({ level: null, headingText: null, html })
    return sections
  }

  if (tokens[0].index > 0) {
    sections.push({ level: null, headingText: null, html: html.slice(0, tokens[0].index) })
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const start = t.index
    const end = i + 1 < tokens.length ? tokens[i + 1].index : html.length
    const slice = html.slice(start, end)
    const headingText = htmlToText(t.innerHtml, { wordwrap: false, preserveNewlines: true })
    sections.push({
      level: t.level,
      headingText: normalizeWhitespace(headingText),
      html: slice,
    })
  }

  return sections
}

function buildChunksFromSectionText(fullText: string, headingText: string | null, maxChars: number, overlap: number): string[] {
  if (fullText.length <= maxChars) return [fullText]

  const chunks: string[] = []
  const paragraphs = fullText.split('\n\n')

  if (headingText && paragraphs.length && paragraphs[0].trim() === headingText) {
    paragraphs.shift()
  }

  const headerPrefix = headingText ? headingText + '\n\n' : ''
  const budget = maxChars - headerPrefix.length

  let current = ''
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i].trim()
    if (!p) continue

    if (p.length > budget) {
      let start = 0
      while (start < p.length) {
        const end = Math.min(start + budget, p.length)
        const window = p.slice(start, end)
        const content = headerPrefix + window
        chunks.push(content.trim())
        if (end === p.length) break
        start = Math.max(0, end - overlap)
      }
      current = ''
      continue
    }

    if ((current ? current.length + 2 : 0) + p.length <= budget) {
      current = current ? current + '\n\n' + p : p
    } else {
      if (current) chunks.push((headerPrefix + current).trim())
      current = p
    }
  }
  if (current) chunks.push((headerPrefix + current).trim())
  return chunks
}

function isHtml(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content)
}

function chunkHtmlSectionAware(html: string, maxChars: number, overlap: number): string[] {
  const sections = splitSectionsByHeadings(html)
  const allChunks: string[] = []
  for (const section of sections) {
    const sectionText = htmlToPlainText(section.html)
    const chunks = buildChunksFromSectionText(sectionText, section.headingText, maxChars, overlap)
    for (const c of chunks) if (c) allChunks.push(c)
  }
  return allChunks
}

function chunkContent(content: string, maxChars: number, overlap: number): string[] {
  if (isHtml(content)) {
    return chunkHtmlSectionAware(content, maxChars, overlap)
  }
  const normalized = normalizeWhitespace(content)
  return buildChunksFromSectionText(normalized, null, maxChars, overlap)
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured')
  }

  const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://github.com/your-repo',
      'X-Title': 'Knowledge Base Embeddings',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const data = await response.json()

  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('Invalid response format from OpenRouter embeddings API')
  }

  return data.data.map((d: any) => d.embedding)
}

/**
 * Embed a single document by its ID
 * @param sourceId - The ID of the document in dashboard_knowledge_base
 * @param rebuild - If true, rebuild all chunks. If false, only embed new/missing chunks
 * @returns The number of chunks embedded
 */
export async function embedDocument(sourceId: number, rebuild: boolean = false): Promise<number> {
  const supabase = getSupabaseAdmin()

  // Fetch the document
  const { data: article, error: fetchError } = await supabase
    .from('dashboard_knowledge_base')
    .select('id, doc_id, title, parent, source_filename, html, transcript')
    .eq('id', sourceId)
    .single()

  if (fetchError || !article) {
    throw new Error(`Document not found: ${fetchError?.message || 'Unknown error'}`)
  }

  const { id, doc_id, title, parent, source_filename, html, transcript } = article

  // Skip if no content
  const contentToEmbed = html || transcript
  if (!contentToEmbed || contentToEmbed.trim().length === 0) {
    console.log(`[embed-doc] ${source_filename || doc_id || sourceId}: skipping (no html or transcript)`)
    return 0
  }

  const derivedTitle = title || (html ? extractTitleFromHtml(html) : null) || 'Untitled'

  // Embed the full document first (for dashboard_knowledge_base.embedding column)
  try {
    // Convert HTML to plain text for full document embedding
    const fullText = isHtml(contentToEmbed) ? htmlToPlainText(contentToEmbed) : normalizeWhitespace(contentToEmbed)
    const fullEmbeddings = await embedBatch([fullText])
    const fullDocumentEmbedding = fullEmbeddings[0]

    // Update the embedding column in dashboard_knowledge_base
    const { error: updateError } = await supabase
      .from('dashboard_knowledge_base')
      .update({ embedding: fullDocumentEmbedding })
      .eq('id', sourceId)

    if (updateError) {
      console.warn(`[embed-doc] Failed to update full document embedding: ${updateError.message}`)
    } else {
      console.log(`[embed-doc] Updated full document embedding for ${source_filename || doc_id || sourceId}`)
    }
  } catch (fullEmbedError: any) {
    console.warn(`[embed-doc] Failed to embed full document (continuing with chunks): ${fullEmbedError.message}`)
  }

  // Chunk the content
  const chunks = chunkContent(contentToEmbed, CHUNK_MAX_CHARS, CHUNK_OVERLAP_CHARS)
  const validChunks = chunks.filter(c => c && c.trim().length > 0)

  if (validChunks.length === 0) {
    console.log(`[embed-doc] ${source_filename || doc_id || sourceId}: skipping (no valid chunks)`)
    return 0
  }

  // Determine which chunks to process
  let targetIndexesToProcess = validChunks.map((_, i) => i)
  if (!rebuild) {
    const { data: existingData } = await supabase
      .from('embedded_knowledge_base')
      .select('chunk_index')
      .eq('source_id', sourceId)

    const existing = new Set((existingData || []).map(r => r.chunk_index))
    targetIndexesToProcess = targetIndexesToProcess.filter(i => !existing.has(i))
  }

  if (targetIndexesToProcess.length === 0) {
    console.log(`[embed-doc] ${source_filename || doc_id || sourceId}: up-to-date (${validChunks.length} chunks)`)
    return 0
  }

  // Embed in batches
  let totalEmbedded = 0
  const batchInputs = targetIndexesToProcess.map(i => validChunks[i])

  for (let i = 0; i < batchInputs.length; i += EMBED_BATCH_SIZE) {
    const inputs = batchInputs.slice(i, i + EMBED_BATCH_SIZE)
    const indices = targetIndexesToProcess.slice(i, i + EMBED_BATCH_SIZE)

    const embeddings = await embedBatch(inputs)
    totalEmbedded += embeddings.length

    const rows = embeddings.map((embedding, k) => {
      const chunkIndex = indices[k]
      const content = validChunks[chunkIndex]
      return {
        source_id: sourceId,
        chunk_index: chunkIndex,
        content,
        title: derivedTitle,
        parent: parent || null,
        source_filename: source_filename || null,
        doc_id: doc_id || null,
        chunk_length: content.length,
        embedding,
      }
    })

    const { error: upsertError } = await supabase
      .from('embedded_knowledge_base')
      .upsert(rows, { onConflict: 'source_id,chunk_index' })

    if (upsertError) {
      throw new Error(`Failed to upsert embeddings: ${upsertError.message}`)
    }
  }

  console.log(`[embed-doc] ${source_filename || doc_id || sourceId}: embedded ${totalEmbedded} chunks`)
  return totalEmbedded
}

/**
 * Delete all embeddings for a document
 * Note: Only deletes chunked embeddings. The full document embedding will be deleted when the document is deleted.
 */
export async function deleteDocumentEmbeddings(sourceId: number): Promise<void> {
  const supabase = getSupabaseAdmin()
  
  // Delete chunked embeddings from embedded_knowledge_base
  const { error: chunkError } = await supabase
    .from('embedded_knowledge_base')
    .delete()
    .eq('source_id', sourceId)

  if (chunkError) {
    throw new Error(`Failed to delete chunked embeddings: ${chunkError.message}`)
  }

  // Note: We don't clear the full document embedding here because:
  // 1. The document is about to be deleted anyway
  // 2. The embedding column will be automatically cleared when the document row is deleted
  // If we need to clear it separately, do it before deleting the document

  console.log(`[embed-doc] Deleted chunked embeddings for source_id: ${sourceId}`)
}

