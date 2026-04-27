import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AttendanceConfigDto, SetHolidaysDto } from './attendance-config.dto';

async function validateConfigDto(plain: object) {
  return validate(plainToInstance(AttendanceConfigDto, plain));
}

async function validateHolidaysDto(plain: object) {
  return validate(plainToInstance(SetHolidaysDto, plain));
}

describe('AttendanceConfigDto', () => {
  it('should pass with empty payload (all fields optional)', async () => {
    const errors = await validateConfigDto({});
    expect(errors).toHaveLength(0);
  });

  it('should pass with all valid fields', async () => {
    const errors = await validateConfigDto({
      is_enabled: true,
      standard_daily_hours: 8,
      night_shift_start: '21:00',
      night_shift_end: '06:00',
      sunday_surcharge: true,
      holiday_surcharge: false,
    });
    expect(errors).toHaveLength(0);
  });

  describe('standard_daily_hours', () => {
    it('should fail when standard_daily_hours is 0 (below Min=1)', async () => {
      const errors = await validateConfigDto({ standard_daily_hours: 0 });
      expect(errors.some((e) => e.property === 'standard_daily_hours')).toBe(true);
    });

    it('should fail when standard_daily_hours is 25 (above Max=24)', async () => {
      const errors = await validateConfigDto({ standard_daily_hours: 25 });
      expect(errors.some((e) => e.property === 'standard_daily_hours')).toBe(true);
    });

    it('should pass when standard_daily_hours is 1 (Min boundary)', async () => {
      const errors = await validateConfigDto({ standard_daily_hours: 1 });
      expect(errors.some((e) => e.property === 'standard_daily_hours')).toBe(false);
    });

    it('should pass when standard_daily_hours is 24 (Max boundary)', async () => {
      const errors = await validateConfigDto({ standard_daily_hours: 24 });
      expect(errors.some((e) => e.property === 'standard_daily_hours')).toBe(false);
    });

    it('should fail when standard_daily_hours is a string', async () => {
      const errors = await validateConfigDto({ standard_daily_hours: '8' });
      expect(errors.some((e) => e.property === 'standard_daily_hours')).toBe(true);
    });
  });

  describe('night_shift_start HH:MM validation', () => {
    it('should pass for valid 24h time "21:00"', async () => {
      const errors = await validateConfigDto({ night_shift_start: '21:00' });
      expect(errors.some((e) => e.property === 'night_shift_start')).toBe(false);
    });

    it('should pass for "00:00"', async () => {
      const errors = await validateConfigDto({ night_shift_start: '00:00' });
      expect(errors.some((e) => e.property === 'night_shift_start')).toBe(false);
    });

    it('should pass for "23:59"', async () => {
      const errors = await validateConfigDto({ night_shift_start: '23:59' });
      expect(errors.some((e) => e.property === 'night_shift_start')).toBe(false);
    });

    it('should fail for "25:00" (hour out of range)', async () => {
      const errors = await validateConfigDto({ night_shift_start: '25:00' });
      expect(errors.some((e) => e.property === 'night_shift_start')).toBe(true);
    });

    it('should fail for "21:60" (minutes out of range)', async () => {
      const errors = await validateConfigDto({ night_shift_start: '21:60' });
      expect(errors.some((e) => e.property === 'night_shift_start')).toBe(true);
    });

    it('should fail for "9:00" (missing leading zero)', async () => {
      const errors = await validateConfigDto({ night_shift_start: '9:00' });
      expect(errors.some((e) => e.property === 'night_shift_start')).toBe(true);
    });

    it('should fail for non-string value', async () => {
      const errors = await validateConfigDto({ night_shift_start: 2100 });
      expect(errors.some((e) => e.property === 'night_shift_start')).toBe(true);
    });
  });

  describe('night_shift_end HH:MM validation', () => {
    it('should pass for valid "06:00"', async () => {
      const errors = await validateConfigDto({ night_shift_end: '06:00' });
      expect(errors.some((e) => e.property === 'night_shift_end')).toBe(false);
    });

    it('should fail for "6:00" (missing leading zero)', async () => {
      const errors = await validateConfigDto({ night_shift_end: '6:00' });
      expect(errors.some((e) => e.property === 'night_shift_end')).toBe(true);
    });
  });

  describe('boolean fields', () => {
    it('should fail when is_enabled is a string', async () => {
      const errors = await validateConfigDto({ is_enabled: 'true' });
      expect(errors.some((e) => e.property === 'is_enabled')).toBe(true);
    });

    it('should fail when sunday_surcharge is a number', async () => {
      const errors = await validateConfigDto({ sunday_surcharge: 1 });
      expect(errors.some((e) => e.property === 'sunday_surcharge')).toBe(true);
    });
  });
});

describe('SetHolidaysDto', () => {
  it('should pass with an empty array', async () => {
    const errors = await validateHolidaysDto({ holidays: [] });
    expect(errors).toHaveLength(0);
  });

  it('should pass with valid ISO date strings', async () => {
    const errors = await validateHolidaysDto({
      holidays: ['2026-05-01', '2026-12-25'],
    });
    expect(errors).toHaveLength(0);
  });

  it('should fail when holidays is not an array', async () => {
    const errors = await validateHolidaysDto({ holidays: '2026-05-01' });
    expect(errors.some((e) => e.property === 'holidays')).toBe(true);
  });

  it('should fail when holidays contains non-date strings', async () => {
    const errors = await validateHolidaysDto({ holidays: ['not-a-date'] });
    expect(errors.some((e) => e.property === 'holidays')).toBe(true);
  });

  it('should fail when holidays is missing', async () => {
    const errors = await validateHolidaysDto({});
    expect(errors.some((e) => e.property === 'holidays')).toBe(true);
  });
});
