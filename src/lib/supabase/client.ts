import { createBrowserClient } from '@supabase/ssr'
import { validateEnv } from '@/lib/env'

export function createClient() {
  validateEnv()
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export { validateEnv }
