import { IsUUID } from 'class-validator';

export class SupabaseUserDto {
  @IsUUID()
  supabase_user_id: string;
}
