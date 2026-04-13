import { IsOptional, IsString } from 'class-validator';

export class EntryAttendanceDto {
  @IsString()
  @IsOptional()
  work_location_id?: string;
}
