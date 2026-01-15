'use strict';

// Load environment variables from project root (handle running from any CWD)
const path = require('path');
try { require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') }); } catch (_) {}
try { require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); } catch (_) {}
// Also try default resolution as a fallback
try { require('dotenv').config({ path: '.env.local' }); } catch (_) {}
try { require('dotenv').config(); } catch (_) {}

const { createClient } = require('@supabase/supabase-js');
const { htmlToText } = require('html-to-text');

// Configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'x-ai/grok-4.1-fast';
const MAX_CONTENT_CHARS = 99000;
const SOURCE_TABLE = 'dashboard_knowledge_base';

// CLI flags
const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const LIMIT = (() => {
  const flag = argv.find(a => a.startsWith('--limit='));
  if (!flag) return undefined;
  const v = Number(flag.split('=')[1]);
  return Number.isFinite(v) ? v : undefined;
})();
const ID = (() => {
  const flag = argv.find(a => a.startsWith('--id='));
  if (!flag) return undefined;
  const v = flag.split('=')[1];
  return v ? Number(v) : undefined;
})();
const REBUILD = argv.includes('--rebuild');

// Env validation
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PRIVATE_KEY || process.env.SERVICE_ROLE_KEY;

if (!SUPABASE_URL) throw new Error('Missing Supabase URL (set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL)');
if (!SUPABASE_SERVICE_ROLE) throw new Error('Missing Supabase service role key (set SUPABASE_SERVICE_ROLE)');
if (!OPENROUTER_API_KEY) throw new Error('Missing OPENROUTER_API_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

const SYSTEM_PROMPT = `You are a precise document summarizer for a retrieval system. The summary will be given to an LLM together with the rest of the summaries of other documents. what this means for you is that no humans will be reading the summary, so it should be as consice/token efficient and factual as possible so the document selection LLM can do a good job on choosing what documents are relevant to the user query.

Task: For the provided document/text, write a short, neutral summary (max 200 words) that helps the retrieval system decide if this document is relevant to a user query.

The summary MUST clearly state:
- What specific types of questions or user intents this document best answers (e.g., “explains how to…”, “provides pricing for…”, “lists troubleshooting steps for…”, “compares X vs Y on…”)
- The core subjects, topics, entities and details it covers.

Focus only on factual content. Do not add external knowledge or speculation. Use concise, keyword-rich language to improve retrieval accuracy.

Output only the summary, nothing else.`;

async function generateSummary(html) {
  const text = htmlToText(html, { wordwrap: 0 });
  const content = text.length > MAX_CONTENT_CHARS ? text.slice(0, MAX_CONTENT_CHARS) : text;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://github.com/your-repo',
      'X-Title': 'Knowledge Base Summary Generator',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Document content (plain text):\n\n${content}` },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  const summary = data.choices?.[0]?.message?.content?.trim() || '';
  
  if (!summary) {
    throw new Error('Empty summary returned from API');
  }

  return summary;
}

async function fetchArticles() {
  let query = supabase
    .from(SOURCE_TABLE)
    .select('id, doc_id, source_filename, title, html, summary')
    .order('id', { ascending: true });

  if (ID) {
    query = query.eq('id', ID);
  }

  if (LIMIT) {
    query = query.limit(LIMIT);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

async function updateSummary(id, summary) {
  const { error } = await supabase
    .from(SOURCE_TABLE)
    .update({ summary, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

async function main() {
  console.log(`[summary] Model=${MODEL} rebuild=${REBUILD} limit=${LIMIT ?? 'none'} id=${ID ?? 'none'} dryRun=${DRY_RUN}`);
  
  const articles = await fetchArticles();
  console.log(`[summary] Found ${articles.length} articles`);

  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const article of articles) {
    const { id, doc_id, source_filename, title, html, summary } = article;

    // Skip if summary exists and not rebuilding
    if (summary && !REBUILD) {
      console.log(`[summary] ${source_filename || doc_id || id}: skipping (summary exists)`);
      totalSkipped++;
      continue;
    }

    if (!html) {
      console.log(`[summary] ${source_filename || doc_id || id}: skipping (no HTML content)`);
      totalSkipped++;
      continue;
    }

    console.log(`[summary] ${source_filename || doc_id || id}: generating summary...`);

    if (DRY_RUN) {
      console.log(`[summary][dry] ${source_filename || doc_id || id}: would generate summary`);
      totalProcessed++;
      continue;
    }

    try {
      const generatedSummary = await generateSummary(html);
      
      await updateSummary(id, generatedSummary);
      
      console.log(`[summary] ${source_filename || doc_id || id}: summary generated and stored (${generatedSummary.length} chars)`);
      totalUpdated++;
      totalProcessed++;

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`[summary] ${source_filename || doc_id || id}: error -`, error.message);
      totalErrors++;
      totalProcessed++;
    }
  }

  console.log(`[summary] Done. Processed: ${totalProcessed}, Updated: ${totalUpdated}, Skipped: ${totalSkipped}, Errors: ${totalErrors}`);
}

main().catch(err => {
  console.error('[summary] Error:', err);
  process.exit(1);
});

