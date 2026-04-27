import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EntryAttendanceDto } from './entry-attendance.dto';

async function validateDto(plain: object) {
  return validate(plainToInstance(EntryAttendanceDto, plain));
}

describe('EntryAttendanceDto', () => {
  it('should pass with empty payload (all fields are optional)', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('should pass with valid work_location_id string', async () => {
    const errors = await validateDto({ work_location_id: 'loc-abc-123' });
    expect(errors).toHaveLength(0);
  });

  it('should fail when work_location_id is a number', async () => {
    const errors = await validateDto({ work_location_id: 12345 });
    expect(errors.some((e) => e.property === 'work_location_id')).toBe(true);
  });

  it('should fail when work_location_id is a boolean', async () => {
    const errors = await validateDto({ work_location_id: true });
    expect(errors.some((e) => e.property === 'work_location_id')).toBe(true);
  });

  it('should pass when work_location_id is undefined (optional field)', async () => {
    const errors = await validateDto({ work_location_id: undefined });
    expect(errors).toHaveLength(0);
  });
});
