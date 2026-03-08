import { createClient } from '@supabase/supabase-js';

// NOSGA1 Supabase Project Bağlantısı (Otomatik Kuruldu)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://iaslsdkrnxehzxtnbgfw.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlhc2xzZGtybnhlaHp4dG5iZ2Z3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDM2NzAsImV4cCI6MjA4NzYxOTY3MH0.k4cge2c8W5NLe5KQad2MrLxOGvAGmoN0EytJM8rA290';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
