import { createClient } from '@supabase/supabase-js'
import { projectId, publicAnonKey } from './info'

// Create a single Supabase client instance to be shared across the app
export const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey
)
