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

    // Count distinct active members (users who sent messages) in the date range
    // Using author_id to identify unique users
    // Filter out null author_ids and get distinct values
    // Note: We fetch all rows and deduplicate in JS since Supabase doesn't support COUNT(DISTINCT) easily
    const { data, error } = await supabaseAdmin
      .from(messagesTable)
      .select('author_id')
      .not('author_id', 'is', null)
      .gte('sent_at', fromDateISO)
      .lte('sent_at', toDateISO)

    if (error) {
      console.error('[analytics/active-members] Query error:', error)
      throw error
    }

    // Get distinct author_ids
    // Filter out any null/undefined values and create a Set for unique count
    const uniqueAuthors = new Set(
      (data || [])
        .map((msg: any) => msg?.author_id)
        .filter((id: any) => id != null && id !== '')
    )
    const activeMembersCount = uniqueAuthors.size

    // Also get the count from the previous period for comparison
    const fromDateObj = new Date(fromDateISO)
    const toDateObj = new Date(toDateISO)
    const periodDays = Math.ceil((toDateObj.getTime() - fromDateObj.getTime()) / (1000 * 60 * 60 * 24))
    const previousFromDate = new Date(fromDateObj)
    previousFromDate.setUTCDate(previousFromDate.getUTCDate() - periodDays)
    const previousToDate = new Date(fromDateObj)
    previousToDate.setUTCHours(0, 0, 0, 0)

    const { data: previousData } = await supabaseAdmin
      .from(messagesTable)
      .select('author_id')
      .not('author_id', 'is', null)
      .gte('sent_at', previousFromDate.toISOString())
      .lte('sent_at', previousToDate.toISOString())

    const previousUniqueAuthors = new Set(previousData?.map((msg: any) => msg.author_id).filter(Boolean))
    const previousCount = previousUniqueAuthors.size

    // Calculate percentage change
    let change = '0%'
    if (previousCount > 0) {
      const percentChange = ((activeMembersCount - previousCount) / previousCount) * 100
      change = `${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(0)}%`
    } else if (activeMembersCount > 0) {
      change = '+100%'
    }

    const changeText = periodDays === 7 
      ? `${change} from last week`
      : periodDays === 30
      ? `${change} from last month`
      : `${change} from previous period`

    return NextResponse.json({
      count: activeMembersCount,
      change: changeText,
    })
  } catch (error: any) {
    console.error('[analytics/active-members] GET error', error)
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}

