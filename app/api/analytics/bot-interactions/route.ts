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

    // Count rows in the answers table for the selected range
    // Using exact count
    const { count, error } = await supabaseAdmin
      .from('answers')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', fromDate)
      .lte('created_at', toDate)

    if (error) {
      throw error
    }

    const botInteractionsCount = count || 0

    // Also get the count from the previous period for comparison
    const fromDateObj = new Date(fromDate)
    const toDateObj = new Date(toDate)
    const periodDays = Math.ceil((toDateObj.getTime() - fromDateObj.getTime()) / (1000 * 60 * 60 * 24))
    const previousFromDate = new Date(fromDateObj)
    previousFromDate.setDate(previousFromDate.getDate() - periodDays)
    const previousToDate = fromDateObj

    const { count: previousCount, error: previousError } = await supabaseAdmin
      .from('answers')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', previousFromDate.toISOString())
      .lte('created_at', previousToDate.toISOString())

    if (previousError) {
      throw previousError
    }

    const prevCount = previousCount || 0

    // Calculate percentage change
    let change = '0%'
    if (prevCount > 0) {
      const percentChange = ((botInteractionsCount - prevCount) / prevCount) * 100
      change = `${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(0)}%`
    } else if (botInteractionsCount > 0) {
      change = '+100%'
    }

    const changeText = periodDays === 7 
      ? `${change} from last week`
      : periodDays === 30
      ? `${change} from last month`
      : `${change} from previous period`

    return NextResponse.json({
      count: botInteractionsCount,
      change: changeText,
    })
  } catch (error: any) {
    console.error('[analytics/bot-interactions] GET error', error)
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}


