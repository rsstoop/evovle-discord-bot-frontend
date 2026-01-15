-- Create table for chat responses and tool calls
-- This replaces the in-memory storage to work properly in serverless environments

CREATE TABLE IF NOT EXISTS chat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('response', 'tool_call')),
  content TEXT,
  tool_name TEXT,
  tool_timestamp BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for fast lookups by request_id
CREATE INDEX IF NOT EXISTS idx_chat_logs_request_id ON chat_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_created_at ON chat_logs(created_at);

-- Create a function to clean up old records (older than 1 hour)
CREATE OR REPLACE FUNCTION cleanup_old_chat_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM chat_logs WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- Optional: Create a scheduled job to run cleanup (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-chat-logs', '0 * * * *', 'SELECT cleanup_old_chat_logs();');








