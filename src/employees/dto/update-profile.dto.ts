import { IsInt, IsOptional, IsString, IsUrl, Min, Max } from 'class-validator';

export class UpdateProfileDto {
  @IsInt()
  id_employee: number;

  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'photo_url debe ser una URL válida' })
  photo_url?: string;

  @IsOptional()
  @IsInt()
  @Min(18, { message: 'La edad mínima es 18 años' })
  @Max(100, { message: 'La edad máxima es 100 años' })
  age?: number;
}
