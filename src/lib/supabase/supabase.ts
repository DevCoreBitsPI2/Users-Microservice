import { createClient } from '@supabase/supabase-js';
import { envs } from '@/src/config';

export const supabase = createClient(
  envs.supabaseUrl,
  envs.databaseAdminKey
);
