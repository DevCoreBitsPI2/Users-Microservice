import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class GenerateEmployeeQrDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  id_employee: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  scannerEmployeeId?: number;

  @IsBoolean()
  scannerIsAdmin: boolean;
}

export class ScanEmployeeQrDto {
  @IsString()
  qrToken: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  scannerEmployeeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  scannerPosition?: number;

  @IsBoolean()
  scannerIsAdmin: boolean;
}
