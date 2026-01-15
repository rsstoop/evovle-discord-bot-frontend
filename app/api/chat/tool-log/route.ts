import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: Request) {
  try {
    const { tool, requestId } = await request.json()

    if (!tool) {
      return NextResponse.json({ error: 'tool is required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Store the tool call with requestId if provided, otherwise use 'pending'
    // N8N should pass the requestId it received from the webhook
    const { error } = await supabase
      .from('chat_logs')
      .insert({
        request_id: requestId || 'pending',
        type: 'tool_call',
        tool_name: tool,
        tool_timestamp: Date.now(),
        created_at: new Date().toISOString(),
      })

    if (error) {
      console.error('[tool-log] Error storing tool call:', error)
      throw error
    }

    console.log('[tool-log] Tool call logged:', { tool, requestId: requestId || 'pending' })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[tool-log] POST error', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const requestId = searchParams.get('requestId')
    const since = searchParams.get('since') // ISO timestamp to filter by

    const supabase = getSupabaseAdmin()

    // Simple query - just filter by type and optionally by since
    let query = supabase
      .from('chat_logs')
      .select('tool_name, tool_timestamp, request_id, created_at')
      .eq('type', 'tool_call')
      .order('tool_timestamp', { ascending: true })

    // If since timestamp provided, only get tool calls after that time
    if (since) {
      query = query.gte('created_at', since)
    }

    const { data, error } = await query

    if (error) {
      console.error('[tool-log] Error fetching tool calls:', error)
      throw error
    }

    // Filter in JS if requestId provided (matches requestId or 'pending')
    let filteredData = data || []
    if (requestId && !since) {
      // Only filter by requestId if we're not already filtering by since
      filteredData = filteredData.filter(tc => 
        tc.request_id === requestId || tc.request_id === 'pending'
      )
    }

    // Deduplicate tool calls - keep only unique tools (same tool name)
    const seenTools = new Set<string>()
    const uniqueToolCalls = filteredData
      .map(tc => ({
        tool: tc.tool_name,
        timestamp: tc.tool_timestamp,
      }))
      .filter(tc => {
        if (seenTools.has(tc.tool)) {
          return false
        }
        seenTools.add(tc.tool)
        return true
      })

    return NextResponse.json({ toolCalls: uniqueToolCalls })
  } catch (error: any) {
    console.error('[tool-log] GET error', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const all = searchParams.get('all') === 'true'

    const supabase = getSupabaseAdmin()

    if (all) {
      // Delete ALL tool calls (used when starting a new request)
      const { error } = await supabase
        .from('chat_logs')
        .delete()
        .eq('type', 'tool_call')
        .gte('created_at', '1970-01-01T00:00:00.000Z') // Matches all records

      if (error) throw error
      console.log('[tool-log] Deleted all tool calls')
    } else {
      // Delete old tool calls only (cleanup)
      const { error } = await supabase
        .from('chat_logs')
        .delete()
        .eq('type', 'tool_call')
        .lt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

      if (error) throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[tool-log] DELETE error', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error' },
      { status: 500 }
    )
  }
}

