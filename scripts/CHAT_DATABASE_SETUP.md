# Chat Database Setup

This document explains how to set up the Supabase database tables for the chat logging system.

## Why This Was Needed

The previous implementation used in-memory storage, which doesn't work reliably in serverless environments (like Vercel). Each serverless instance has its own memory, causing:
- Responses stored on instance A might not be accessible from instance B
- Tool calls might be lost or duplicated
- Race conditions between different instances

Using Supabase (PostgreSQL) ensures all instances share the same data store.

## Setup Instructions

1. **Run the SQL migration** in your Supabase SQL Editor:

   ```sql
   -- Copy and paste the contents of scripts/create_chat_tables.sql
   ```

   Or run it via Supabase CLI:
   ```bash
   supabase db execute -f scripts/create_chat_tables.sql
   ```

2. **Verify the table was created**:
   ```sql
   SELECT * FROM chat_logs LIMIT 1;
   ```

## Table Structure

The `chat_logs` table stores:
- `id`: Unique UUID for each log entry
- `request_id`: UUID or 'pending' (groups tool calls and responses)
- `type`: Either 'response' or 'tool_call'
- `content`: The response content (for type='response')
- `tool_name`: The tool name (for type='tool_call')
- `tool_timestamp`: Timestamp when tool was called
- `created_at`: When the record was created

## How It Works

1. When a user sends a message, old logs are cleared and a `request_id` (UUID) is generated
2. The frontend records the start time and only looks for logs created AFTER this time
3. N8N logs tool calls and responses (optionally with requestId)
4. The frontend polls using `since` parameter to only get new logs
5. Tool calls are deduplicated (unique tool names only)
6. When response arrives, all logs are cleared

## N8N Integration

N8N can log tool calls and responses. The `requestId` is optional but recommended:

**Logging a tool call:**
```javascript
POST https://your-dashboard.com/api/chat/tool-log
Body: {
  "tool": "search_discord",
  "requestId": "{{ $json.requestId }}" // Optional but recommended
}
```

**Logging a response:**
```javascript
POST https://your-dashboard.com/api/chat/response-log
Body: {
  "content": "Your response here",
  "requestId": "{{ $json.requestId }}" // Optional but recommended
}
```

If `requestId` is not provided, it defaults to 'pending' and the frontend will still pick it up using the `since` timestamp filter.

## API Endpoints

### Tool Log

- `POST /api/chat/tool-log` - Log a tool call
  - Body: `{ "tool": "tool_name", "requestId": "optional" }`
  
- `GET /api/chat/tool-log?requestId=xxx&since=2024-01-01T00:00:00Z`
  - Returns tool calls for the request or created after `since`
  
- `DELETE /api/chat/tool-log?all=true` - Delete ALL tool calls

### Response Log

- `POST /api/chat/response-log` - Log a response
  - Body: `{ "content": "response text", "requestId": "optional" }`
  
- `GET /api/chat/response-log?requestId=xxx&since=2024-01-01T00:00:00Z`
  - Returns response for the request or created after `since`
  
- `DELETE /api/chat/response-log?all=true` - Delete ALL responses

## Cleanup

Old records (older than 1 hour) can be cleaned up by calling DELETE without `all=true`. You can also manually run:

```sql
SELECT cleanup_old_chat_logs();
```

Or set up a cron job in Supabase to run this automatically.

