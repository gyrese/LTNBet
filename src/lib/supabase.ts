import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isMock = !supabaseUrl || !supabaseAnonKey;

export const supabase = createClient(supabaseUrl || 'http://127.0.0.1:54321', supabaseAnonKey || 'missing');
export default supabase;
