import { IsEmail, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { StatusEmployeeListDto } from '../enums/status.enum';

export class CreateAdminDto {
  @IsEmail()
  email: string;

  @IsString()
  name: string;

  @IsString()
  last_name: string;

  @IsInt()
  age: number;

}
