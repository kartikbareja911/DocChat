import { NextResponse } from 'next/server'

export async function GET() {
  const checks: Record<string, { status: string; details?: string }> = {
    next: { status: 'ok' },
    environment: { status: 'checking' },
  }

  // Check environment variables
  const requiredVars = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'GEMINI_API_KEY', 'VOYAGE_API_KEY']
  const missing = requiredVars.filter((key) => !process.env[key])

  if (missing.length === 0) {
    checks.environment = { status: 'ok' }
  } else {
    checks.environment = { status: 'missing', details: `Missing: ${missing.join(', ')}` }
  }

  // Check if any critical services are misconfigured
  const hasPlaceholder = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project-id')
  if (hasPlaceholder) {
    checks.environment = { status: 'misconfigured', details: 'Supabase URL contains placeholder' }
  }

  const successfulChecks = Object.values(checks).filter((c) => c.status === 'ok').length
  const totalChecks = Object.keys(checks).length
  const healthy = successfulChecks === totalChecks

  return NextResponse.json({
    status: healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  })
}