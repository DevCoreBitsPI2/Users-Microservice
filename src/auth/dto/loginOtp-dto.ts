import { IsEmail, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class LoginOtpDto {
  @IsEmail()
  email: string;

}
