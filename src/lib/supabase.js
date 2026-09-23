import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
const isPlaceholder = value => !value || value.startsWith('[EDIT THIS:')

export const isSupabaseConfigured = !isPlaceholder(url) && !isPlaceholder(key)
export const supabase = isSupabaseConfigured ? createClient(url, key) : null
