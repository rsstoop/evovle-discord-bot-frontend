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

    // First Principles Approach:
    // Problem: Fetching rows hits a 1000-row limit, causing incomplete data and inconsistent charts.
    // Solution: Don't fetch rows. Ask the DB to COUNT rows per day.
    // Method: We generate the specific time boundaries for each day in the requested range
    // and fire off parallel "HEAD" requests to Supabase to get the exact count for that day.
    // This is fast, efficient, and bypasses the row limit entirely.

    const fromDateObj = new Date(fromDate)
    const toDateObj = new Date(toDate)
    
    // Normalize start/end to UTC midnight
    const current = new Date(Date.UTC(
      fromDateObj.getUTCFullYear(),
      fromDateObj.getUTCMonth(),
      fromDateObj.getUTCDate()
    ))

    const end = new Date(Date.UTC(
      toDateObj.getUTCFullYear(),
      toDateObj.getUTCMonth(),
      toDateObj.getUTCDate()
    ))

    const datesToQuery: string[] = []
    
    // Generate all YYYY-MM-DD dates in the range
    while (current <= end) {
      datesToQuery.push(current.toISOString().split('T')[0])
      current.setUTCDate(current.getUTCDate() + 1)
    }

    // Execute requests in parallel
    // For 30 days, this is 30 lightweight HTTP requests which Supabase handles easily.
    const counts = await Promise.all(
      datesToQuery.map(async (dateKey) => {
        // Construct absolute start/end for this specific day in UTC
        const dayStart = `${dateKey}T00:00:00.000Z`
        const dayEnd = `${dateKey}T23:59:59.999Z`

        const { count, error } = await supabaseAdmin
          .from(messagesTable)
          .select('*', { count: 'exact', head: true }) // head: true = fetch NO data, just the count
          .gte('sent_at', dayStart)
          .lte('sent_at', dayEnd)

        if (error) {
          console.error(`Error counting for ${dateKey}:`, error)
          return { date: dateKey, count: 0 }
        }

        return { date: dateKey, count: count || 0 }
      })
    )

    return NextResponse.json({ data: counts })
  } catch (error: any) {
    console.error('[analytics/daily-messages] GET error', error)
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}
