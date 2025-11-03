'use strict';

// Load environment variables from project root (handle running from any CWD)
const path = require('path');
try { require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') }); } catch (_) {}
try { require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); } catch (_) {}
// Also try default resolution as a fallback
try { require('dotenv').config({ path: '.env.local' }); } catch (_) {}
try { require('dotenv').config(); } catch (_) {}

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const { htmlToText } = require('html-to-text');

// Configuration
const OPENAI_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small'; // 1536 dims
const CHUNK_MAX_CHARS = Number(process.env.KB_CHUNK_MAX_CHARS || 4500);
const CHUNK_OVERLAP_CHARS = Number(process.env.KB_CHUNK_OVERLAP_CHARS || 680);
const EMBED_BATCH_SIZE = Number(process.env.KB_EMBED_BATCH_SIZE || 100);
const SOURCE_TABLE = 'dashboard_knowledge_base';
const TARGET_TABLE = 'embedded_knowledge_base';

// CLI flags
const argv = process.argv.slice(2);
const REBUILD = argv.includes('--rebuild');
const DRY_RUN = argv.includes('--dry-run');
const LIMIT = (() => {
  const flag = argv.find(a => a.startsWith('--limit='));
  if (!flag) return undefined;
  const v = Number(flag.split('=')[1]);
  return Number.isFinite(v) ? v : undefined;
})();

// Env validation (support common aliases)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PRIVATE_KEY || process.env.SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL) throw new Error('Missing Supabase URL (set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL)');
if (!SUPABASE_SERVICE_ROLE) throw new Error('Missing Supabase service role key (set SUPABASE_SERVICE_ROLE)');
if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function normalizeWhitespace(text) {
  return text
    .replace(/[\t\r]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTitleFromHtml(html) {
  const match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (match && match[1]) return htmlToText(match[1], { wordwrap: false, preserveNewlines: true }).trim();
  return undefined;
}

function htmlToPlainText(html) {
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
  });
  return normalizeWhitespace(text);
}

function splitSectionsByHeadings(html) {
  const sections = [];
  const headingRegex = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const tokens = [];
  let match;
  while ((match = headingRegex.exec(html)) !== null) {
    tokens.push({ level: parseInt(match[1], 10), innerHtml: match[2], index: match.index, length: match[0].length });
  }
  if (tokens.length === 0) {
    sections.push({ level: null, headingText: null, html });
    return sections;
  }
  // Preface before first heading
  if (tokens[0].index > 0) {
    sections.push({ level: null, headingText: null, html: html.slice(0, tokens[0].index) });
  }
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const start = t.index;
    const end = i + 1 < tokens.length ? tokens[i + 1].index : html.length;
    const slice = html.slice(start, end);
    const headingText = htmlToText(t.innerHtml, { wordwrap: false, preserveNewlines: true });
    sections.push({ level: t.level, headingText: normalizeWhitespace(headingText), html: slice });
  }
  return sections;
}

function buildChunksFromSectionText(fullText, headingText, maxChars, overlap) {
  if (fullText.length <= maxChars) return [fullText];

  const chunks = [];
  const paragraphs = fullText.split('\n\n');

  // Remove heading-only first paragraph if present; we'll prefix to each chunk
  if (headingText && paragraphs.length && paragraphs[0].trim() === headingText) {
    paragraphs.shift();
  }

  const headerPrefix = headingText ? headingText + '\n\n' : '';
  const budget = maxChars - headerPrefix.length;

  let current = '';
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i].trim();
    if (!p) continue;
    if (p.length > budget) {
      // Fallback to raw windows with overlap within this paragraph
      let start = 0;
      while (start < p.length) {
        const end = Math.min(start + budget, p.length);
        const window = p.slice(start, end);
        const content = headerPrefix + window;
        chunks.push(content.trim());
        if (end === p.length) break;
        start = Math.max(0, end - overlap);
      }
      // Reset current as we have already emitted windows for this large paragraph
      current = '';
      continue;
    }

    if ((current ? current.length + 2 : 0) + p.length <= budget) {
      current = current ? current + '\n\n' + p : p;
    } else {
      // flush current
      if (current) chunks.push((headerPrefix + current).trim());
      current = p;
    }
  }
  if (current) chunks.push((headerPrefix + current).trim());
  return chunks;
}

function chunkHtmlSectionAware(html, maxChars, overlap) {
  const sections = splitSectionsByHeadings(html);
  const allChunks = [];
  for (const section of sections) {
    const sectionText = htmlToPlainText(section.html);
    const chunks = buildChunksFromSectionText(sectionText, section.headingText, maxChars, overlap);
    for (const c of chunks) if (c) allChunks.push(c);
  }
  return allChunks;
}

async function fetchArticles(limit) {
  const query = supabase
    .from(SOURCE_TABLE)
    .select('id, title, parent, source_filename, html')
    .order('id', { ascending: true });
  if (limit) query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function fetchExistingChunkIndexes(sourceId) {
  const { data, error } = await supabase
    .from(TARGET_TABLE)
    .select('chunk_index')
    .eq('source_id', sourceId)
    .order('chunk_index', { ascending: true });
  if (error) throw error;
  return new Set((data || []).map(r => r.chunk_index));
}

async function embedBatch(texts) {
  const response = await openai.embeddings.create({
    model: OPENAI_MODEL,
    input: texts,
  });
  return response.data.map(d => d.embedding);
}

async function upsertRows(rows) {
  const { error } = await supabase
    .from(TARGET_TABLE)
    .upsert(rows, { onConflict: 'source_id,chunk_index' });
  if (error) throw error;
}

async function main() {
  console.log(`[embed] Model=${OPENAI_MODEL} maxChars=${CHUNK_MAX_CHARS} overlap=${CHUNK_OVERLAP_CHARS} rebuild=${REBUILD} limit=${LIMIT ?? 'none'} dryRun=${DRY_RUN}`);
  const articles = await fetchArticles(LIMIT);
  console.log(`[embed] Found ${articles.length} articles`);

  let totalChunks = 0;
  let totalEmbedded = 0;

  for (const article of articles) {
    const { id: sourceId, title, parent, source_filename, html } = article;

    const derivedTitle = title || extractTitleFromHtml(html) || 'Untitled';
    const chunks = chunkHtmlSectionAware(html, CHUNK_MAX_CHARS, CHUNK_OVERLAP_CHARS);
    totalChunks += chunks.length;

    let targetIndexesToProcess = chunks.map((_, i) => i);
    if (!REBUILD) {
      const existing = await fetchExistingChunkIndexes(sourceId);
      targetIndexesToProcess = targetIndexesToProcess.filter(i => !existing.has(i));
    }

    if (targetIndexesToProcess.length === 0) {
      console.log(`[embed] ${source_filename || sourceId}: up-to-date (${chunks.length} chunks)`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`[embed][dry] ${source_filename || sourceId}: would embed ${targetIndexesToProcess.length}/${chunks.length} chunks`);
      continue;
    }

    console.log(`[embed] ${source_filename || sourceId}: embedding ${targetIndexesToProcess.length}/${chunks.length} chunks`);

    // Prepare inputs in order and batch
    const batchInputs = targetIndexesToProcess.map(i => chunks[i]);

    for (let i = 0; i < batchInputs.length; i += EMBED_BATCH_SIZE) {
      const inputs = batchInputs.slice(i, i + EMBED_BATCH_SIZE);
      const indices = targetIndexesToProcess.slice(i, i + EMBED_BATCH_SIZE);

      const embeddings = await embedBatch(inputs);
      totalEmbedded += embeddings.length;

      const rows = embeddings.map((embedding, k) => {
        const chunkIndex = indices[k];
        const content = chunks[chunkIndex];
        return {
          source_id: sourceId,
          chunk_index: chunkIndex,
          content,
          title: derivedTitle,
          parent: parent || null,
          source_filename: source_filename || null,
          chunk_length: content.length,
          embedding,
        };
      });

      await upsertRows(rows);
      console.log(`[embed] upserted ${rows.length} rows for ${source_filename || sourceId}`);
    }
  }

  console.log(`[embed] Done. Total chunks: ${totalChunks}, embedded now: ${totalEmbedded}.`);
}

main().catch(err => {
  console.error('[embed] Error:', err);
  process.exit(1);
});


