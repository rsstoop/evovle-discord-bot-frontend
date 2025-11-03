import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const DASHBOARD_DOMAIN = process.env.DASHBOARD_DOMAIN || 'evolve-dashboard.stoopdynamics.com'
const DOCS_DOMAIN = process.env.DOCS_DOMAIN || 'docs-evolve.stoopdynamics.com'

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || request.nextUrl.hostname
  const pathname = request.nextUrl.pathname
  
  // Allow access to static files regardless of domain
  const isStaticFile = pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|css|js)$/i)
  if (isStaticFile) {
    return NextResponse.next()
  }

  // Check if this is the docs domain (public)
  const isDocsDomain = hostname === DOCS_DOMAIN || hostname.includes(DOCS_DOMAIN)
  
  // On docs domain: allow root path (/) - this will render knowledge-base
  // Block all API routes and other pages
  if (isDocsDomain) {
    if (pathname === '/' || pathname.startsWith('/?')) {
      return NextResponse.next()
    }
    // Block all other routes (dashboard, login, knowledge-base, API routes, etc.) - return 404
    return new NextResponse('Not Found', { status: 404 })
  }

  // Knowledge-base route on dashboard domain requires authentication
  if (pathname === '/knowledge-base' || pathname.startsWith('/knowledge-base/')) {
    const isAuthenticated = request.cookies.get('dashboard-auth')?.value === 'authenticated'
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return NextResponse.next()
  }

  // This is the dashboard domain - require authentication for all other routes
  const isAuthenticated = request.cookies.get('dashboard-auth')?.value === 'authenticated'
  
  // Allow access to login page and auth API routes
  if (
    pathname === '/login' || 
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/logout'
  ) {
    if (isAuthenticated && pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  // Protect all other routes on dashboard domain
  if (!isAuthenticated) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}

