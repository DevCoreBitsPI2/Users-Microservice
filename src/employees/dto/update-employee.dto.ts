import { IsEnum, IsInt, IsOptional } from 'class-validator';
import { StatusEmployeeListDto } from '../enums/status.enum';
import { employee_status } from '@prisma/client';

export class UpdateEmployeeDto {
  @IsInt()
  id_employee: number;

  @IsOptional()
  @IsInt()
  id_position?: number;

  @IsOptional()
  @IsInt()
  id_manager?: number | null;

  @IsOptional()
  @IsEnum(StatusEmployeeListDto, {
    message: `El estado debe ser uno de los siguientes: ` + StatusEmployeeListDto.join(', '),
  })
  status?: employee_status;
}
