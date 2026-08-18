export function validateEnv() {
  const isServer = typeof window === 'undefined'

  const requiredVars = isServer
    ? [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'GEMINI_API_KEY',
        'VOYAGE_API_KEY',
      ]
    : [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      ]

  const missing = requiredVars.filter((key) => !process.env[key])

  if (missing.length > 0) {
    console.warn(`⚠️ Missing required environment variables: ${missing.join(', ')}`)
    console.warn('Some features may not work correctly. Please check your .env.local file.')
    return false
  }

  // Validate Supabase URL format
  if (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project-id')) {
    console.warn('⚠️ Supabase URL appears to be a placeholder. Please update with your actual Supabase project URL.')
    return false
  }

  // Server-only checks
  if (isServer) {
    // Validate API keys are not empty
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.length < 20) {
      console.warn('⚠️ GEMINI_API_KEY appears to be invalid or empty.')
      return false
    }

    if (!process.env.VOYAGE_API_KEY || !process.env.VOYAGE_API_KEY.startsWith('pa-')) {
      console.warn('⚠️ VOYAGE_API_KEY appears to be invalid or empty. Should start with "pa-".')
      return false
    }
  }

  console.log(`✅ Environment variables validated successfully (${isServer ? 'server' : 'client'})`)
  return true
}

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Supabase configuration is missing. Check your environment variables.')
  }

  return { url, anonKey }
}