import { IsEmail, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class VerifyOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  token: string;
}
