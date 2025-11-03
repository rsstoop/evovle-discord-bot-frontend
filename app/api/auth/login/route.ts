import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD!

if (!DASHBOARD_PASSWORD) {
  console.warn('DASHBOARD_PASSWORD environment variable is not set. Please set it in your .env file.')
}

export async function POST(request: Request) {
  try {
    const { password } = await request.json()

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      )
    }

    if (!DASHBOARD_PASSWORD) {
      return NextResponse.json(
        { error: 'Dashboard password not configured' },
        { status: 500 }
      )
    }

    if (password === DASHBOARD_PASSWORD) {
      const cookieStore = await cookies()
      cookieStore.set('dashboard-auth', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      })

      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      )
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    )
  }
}




