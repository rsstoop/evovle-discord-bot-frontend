import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

export async function GET() {
  const cookieStore = await cookies()
  const authed = cookieStore.get('dashboard-auth')?.value === 'authenticated'
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseAdmin()
    const bucket = 'public'
    const folder = 'content_explorer'

    const { data, error } = await supabase.storage
      .from(bucket)
      .list(folder, {
        limit: 1000,
        offset: 0,
        sortBy: { column: 'updated_at', order: 'desc' }
      })

    if (error) {
      console.error('Storage list error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Helper function to extract date from filename for sorting
    const getDateFromFilename = (filename: string): number => {
      // Monthly format: monthly_YYYY_MM.html
      const monthlyMatch = filename.match(/monthly_(\d{4})_(\d{2})\.html/)
      if (monthlyMatch) {
        const year = parseInt(monthlyMatch[1], 10)
        const month = parseInt(monthlyMatch[2], 10)
        // Create date for first day of the month
        return new Date(year, month - 1, 1).getTime()
      }

      // Weekly format: weekly_YYYY_wWW.html
      const weeklyMatch = filename.match(/weekly_(\d{4})_w(\d{2})\.html/)
      if (weeklyMatch) {
        const year = parseInt(weeklyMatch[1], 10)
        const week = parseInt(weeklyMatch[2], 10)
        // Calculate date for the first day of the week (Monday of that week)
        // Week 1 starts on January 1st
        const jan1 = new Date(year, 0, 1)
        const daysOffset = (week - 1) * 7
        // Adjust for day of week (0 = Sunday, 1 = Monday)
        const dayOfWeek = jan1.getDay()
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
        const weekStart = new Date(year, 0, 1 + daysOffset + mondayOffset)
        return weekStart.getTime()
      }

      // Fallback: use updated_at if available, otherwise 0
      return 0
    }

    // Filter out folders and the emptyFolderPlaceholder file
    const files = (data || [])
      .filter(item => {
        if (!item.name) return false
        // Exclude items that end with '/' (these are folders)
        if (item.name.endsWith('/')) return false
        // Exclude the emptyFolderPlaceholder file
        if (item.name === '.emptyFolderPlaceholder') return false
        // Include everything else - if it has a name and doesn't end with '/', it's a file
        return true
      })
      // Sort by filename date (most recent first)
      .sort((a, b) => {
        const dateA = getDateFromFilename(a.name || '')
        const dateB = getDateFromFilename(b.name || '')
        // If dates are equal or both 0, fallback to updated_at
        if (dateA === dateB || (dateA === 0 && dateB === 0)) {
          const updatedA = a.updated_at ? new Date(a.updated_at).getTime() : 0
          const updatedB = b.updated_at ? new Date(b.updated_at).getTime() : 0
          return updatedB - updatedA
        }
        return dateB - dateA
      })

    return NextResponse.json({ files })
  } catch (e: any) {
    console.error('Failed to list files:', e)
    return NextResponse.json({ error: e?.message || 'Failed to list files' }, { status: 500 })
  }
}

