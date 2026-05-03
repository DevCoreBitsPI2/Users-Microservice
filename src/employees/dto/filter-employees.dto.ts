import { IsEnum, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '@/src/common';
import { StatusEmployeeListDto } from '../enums/status.enum';
import { employee_status } from '@prisma/client';

export class FilterEmployeesDto extends PaginationDto {
  @IsOptional()
  @IsEnum(StatusEmployeeListDto, {
    message: `El estado debe ser uno de los siguientes: ` + StatusEmployeeListDto.join(', '),
  })
  status?: employee_status;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  id_position?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  id_manager?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  id_administrator?: number;
}
