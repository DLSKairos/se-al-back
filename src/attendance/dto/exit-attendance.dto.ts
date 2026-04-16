import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ExitAttendanceDto {
  @IsInt()
  @Min(0)
  @Max(60)
  @IsOptional()
  lunch_minutes?: number;
}
