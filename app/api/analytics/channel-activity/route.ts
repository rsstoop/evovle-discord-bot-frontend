import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated'
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const fromDate = searchParams.get('from')
    const toDate = searchParams.get('to')

    if (!fromDate || !toDate) {
      return NextResponse.json(
        { error: 'from and to date parameters are required' },
        { status: 400 }
      )
    }

    const supabaseAdmin = getSupabaseAdmin()
    const messagesTable =
      process.env.RAW_MESSAGES_TABLE ||
      process.env.NEXT_PUBLIC_RAW_MESSAGES_TABLE ||
      'raw_messages'

    // Ensure dates are properly formatted as ISO strings
    const fromDateISO = new Date(fromDate).toISOString()
    const toDateISO = new Date(toDate).toISOString()

    // Fetch all messages in the date range with channel info
    // Use pagination to handle large datasets (Supabase default limit is 1000 rows)
    let allData: any[] = []
    let page = 0
    const pageSize = 1000
    let hasMore = true

    while (hasMore) {
      const { data, error } = await supabaseAdmin
        .from(messagesTable)
        .select('channel_name')
        .not('channel_name', 'is', null)
        .gte('sent_at', fromDateISO)
        .lte('sent_at', toDateISO)
        .order('sent_at', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1)

      if (error) {
        console.error('[analytics/channel-activity] Query error:', error)
        throw error
      }

      if (data && data.length > 0) {
        allData = allData.concat(data)
        hasMore = data.length === pageSize
        page++
      } else {
        hasMore = false
      }
    }

    const data = allData

    // Count messages per channel
    const channelCounts: Record<string, number> = {}
    
    if (data) {
      data.forEach((msg: any) => {
        const channelName = msg?.channel_name
        if (channelName) {
          channelCounts[channelName] = (channelCounts[channelName] || 0) + 1
        }
      })
    }

    // Convert to array, sort by count (descending), and take top 6
    const channelActivity = Object.entries(channelCounts)
      .map(([channel, count]) => ({
        channel: channel.startsWith('#') ? channel : `#${channel}`,
        messages: count,
      }))
      .sort((a, b) => b.messages - a.messages)
      .slice(0, 6)

    // Calculate total for percentage calculation (using all channels, not just top 6)
    const allChannelsTotal = Object.values(channelCounts).reduce((sum, count) => sum + count, 0)
    const totalMessages = allChannelsTotal

    // Add percentage to each channel
    const channelActivityWithPercentage = channelActivity.map((ch) => ({
      ...ch,
      percentage: totalMessages > 0 ? Math.round((ch.messages / totalMessages) * 100) : 0,
    }))

    return NextResponse.json({ data: channelActivityWithPercentage })
  } catch (error: any) {
    console.error('[analytics/channel-activity] GET error', error)
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}

