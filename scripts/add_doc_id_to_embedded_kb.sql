-- Add doc_id column to embedded_knowledge_base table
-- This allows linking chunks back to the original document via doc_id

ALTER TABLE embedded_knowledge_base
ADD COLUMN IF NOT EXISTS doc_id TEXT;

-- Create index on doc_id for faster lookups when filtering by document
CREATE INDEX IF NOT EXISTS idx_embedded_kb_doc_id
ON embedded_knowledge_base (doc_id);

-- Optional: Create composite index for common query patterns (doc_id + parent)
CREATE INDEX IF NOT EXISTS idx_embedded_kb_doc_id_parent
ON embedded_knowledge_base (doc_id, parent);
