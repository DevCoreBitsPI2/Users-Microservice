import { IsArray, IsInt } from 'class-validator';

export class FilterByPositionIdsDto {
  @IsArray()
  @IsInt({ each: true })
  positionIds: number[];
}
