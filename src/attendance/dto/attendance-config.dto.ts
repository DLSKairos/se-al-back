import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class AttendanceConfigDto {
  @IsBoolean()
  @IsOptional()
  is_enabled?: boolean;

  @IsNumber()
  @Min(1)
  @Max(24)
  @IsOptional()
  standard_daily_hours?: number;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'night_shift_start debe tener formato HH:MM (24 h)',
  })
  @IsOptional()
  night_shift_start?: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'night_shift_end debe tener formato HH:MM (24 h)',
  })
  @IsOptional()
  night_shift_end?: string;

  @IsBoolean()
  @IsOptional()
  sunday_surcharge?: boolean;

  @IsBoolean()
  @IsOptional()
  holiday_surcharge?: boolean;
}

export class SetHolidaysDto {
  @IsArray()
  @IsDateString({}, { each: true })
  holidays: string[];
}
