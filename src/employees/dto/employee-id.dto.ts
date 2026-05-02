import { IsInt } from 'class-validator';

export class EmployeeIdDto {
  @IsInt()
  id_employee: number;
}
