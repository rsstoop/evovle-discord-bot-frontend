import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: Request) {
  try {
    const { content, toolCalls, requestId } = await request.json()

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'content is required and must be a string' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Store the response with requestId if provided, otherwise use 'pending'
    const reqId = requestId || 'pending'

    const { error: responseError } = await supabase
      .from('chat_logs')
      .insert({
        request_id: reqId,
        type: 'response',
        content: content,
        created_at: new Date().toISOString(),
      })

    if (responseError) {
      console.error('[response-log] Error storing response:', responseError)
      throw responseError
    }

    // Store tool calls if provided with the response
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      const toolCallInserts = toolCalls.map((tc: { tool: string; timestamp: number }) => ({
        request_id: reqId,
        type: 'tool_call',
        tool_name: tc.tool,
        tool_timestamp: tc.timestamp,
        created_at: new Date().toISOString(),
      }))

      const { error: toolError } = await supabase
        .from('chat_logs')
        .insert(toolCallInserts)

      if (toolError) {
        console.error('[response-log] Error storing tool calls:', toolError)
      }
    }

    console.log('[response-log] Response logged:', { 
      requestId: reqId,
      contentLength: content.length,
      toolCallsCount: toolCalls?.length || 0,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[response-log] POST error', error)
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

    // Simple query for responses
    let query = supabase
      .from('chat_logs')
      .select('*')
      .eq('type', 'response')
      .order('created_at', { ascending: false })

    // If since timestamp provided, only get responses after that time
    if (since) {
      query = query.gte('created_at', since)
    }

    const { data: allResponses, error: responseError } = await query

    if (responseError) {
      console.error('[response-log] Error fetching response:', responseError)
      throw responseError
    }

    // Filter in JS if requestId provided (matches requestId or 'pending')
    let filteredResponses = allResponses || []
    if (requestId && !since) {
      filteredResponses = filteredResponses.filter(r => 
        r.request_id === requestId || r.request_id === 'pending'
      )
    }

    // Get the most recent one
    const responseData = filteredResponses[0] || null

    if (!responseData) {
      return NextResponse.json({ response: null })
    }

    // Get tool calls created after since (or all if no since)
    let toolQuery = supabase
      .from('chat_logs')
      .select('tool_name, tool_timestamp, request_id')
      .eq('type', 'tool_call')
      .order('tool_timestamp', { ascending: true })

    if (since) {
      toolQuery = toolQuery.gte('created_at', since)
    }

    const { data: allToolCalls } = await toolQuery

    // Filter tool calls in JS
    let toolCallsData = allToolCalls || []
    if (!since && requestId) {
      toolCallsData = toolCallsData.filter(tc => 
        tc.request_id === requestId || tc.request_id === 'pending'
      )
    }

    // Deduplicate tool calls
    const seenTools = new Set<string>()
    const toolCalls = toolCallsData
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

    return NextResponse.json({
      response: {
        content: responseData.content,
        timestamp: new Date(responseData.created_at).getTime(),
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      },
    })
  } catch (error: any) {
    console.error('[response-log] GET error', error)
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
      // Delete ALL responses (used when starting a new request)
      const { error } = await supabase
        .from('chat_logs')
        .delete()
        .eq('type', 'response')
        .gte('created_at', '1970-01-01T00:00:00.000Z') // Matches all records

      if (error) throw error
      console.log('[response-log] Deleted all responses')
    } else {
      // Delete old responses only (cleanup)
      const { error } = await supabase
        .from('chat_logs')
        .delete()
        .eq('type', 'response')
        .lt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

      if (error) throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[response-log] DELETE error', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error' },
      { status: 500 }
    )
  }
}

