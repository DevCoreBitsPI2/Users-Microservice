import { IsEmail, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { StatusEmployeeListDto } from '../enums/status.enum';
import { employee_status } from '@prisma/client';

export class InviteUserDto {
  @IsEmail()
  email: string;

  @IsString()
  first_name: string;

  @IsString()
  last_name: string;

  @IsInt()
  age: number;

  @IsInt()
  code: number;

  @IsEnum(StatusEmployeeListDto, {
    message:`El estado debe ser uno de los siguientes` + StatusEmployeeListDto.join(", ") 
  })
  status: employee_status;

  @IsInt()
  id_position: number;

  @IsOptional()
  @IsInt()
  id_manager?: number | null;

  @IsInt()
  id_administrator: number;
}
