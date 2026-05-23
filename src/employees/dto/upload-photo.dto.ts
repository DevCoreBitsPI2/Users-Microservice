import { Type } from 'class-transformer';
import {
  IsBase64,
  IsMimeType,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class UploadProfileImageDto {
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  idUser: number;

  @IsBase64()
  bufferBase64: string;

  @IsMimeType()
  mimetype: string;

  @IsString()
  originalname: string;

  @IsOptional()
  @IsString()
  fieldname?: string;

  @IsOptional()
  @IsString()
  encoding?: string;
}