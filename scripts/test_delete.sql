-- Check the structure and data of dashboard_knowledge_base table
SELECT
  id,
  doc_id,
  title,
  source_filename,
  pg_typeof(id) as id_type
FROM dashboard_knowledge_base
ORDER BY id DESC
LIMIT 5;

-- Check if there are any triggers or constraints that might prevent deletion
SELECT
  tgname AS trigger_name,
  tgtype AS trigger_type,
  tgrelid::regclass AS table_name
FROM pg_trigger
WHERE tgrelid = 'dashboard_knowledge_base'::regclass
  AND tgisinternal = false;
