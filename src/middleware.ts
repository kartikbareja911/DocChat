import { NextResponse } from 'next/server'

export function middleware(request: Request) {
  const url = new URL(request.url).pathname

  // Log incoming requests (excluding health checks and static assets)
  if (!url.startsWith('/api/health') && !url.startsWith('/_next') && !url.includes('.')) {
    console.info(`[REQUEST] ${request.method} ${url} - ${request.headers.get('user-agent') || 'unknown'}`)
  }

  // Correctly continue the request execution chain in Next.js
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/api/:route*',
    '/((?!_next|api|static|favicon|health).*)',
  ],
}