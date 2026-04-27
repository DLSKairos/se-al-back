import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateUserDto } from './create-user.dto';
import { UserRole } from '@prisma/client';

async function validateDto(plain: object) {
  return validate(plainToInstance(CreateUserDto, plain));
}

describe('CreateUserDto', () => {
  it('should pass with minimum valid payload', async () => {
    const errors = await validateDto({
      name: 'Juan Pérez',
      identification_number: '123456789',
    });
    expect(errors).toHaveLength(0);
  });

  it('should pass with all optional fields provided', async () => {
    const errors = await validateDto({
      name: 'Juan Pérez',
      identification_number: '123456789',
      job_title: 'Operador',
      role: UserRole.OPERATOR,
      work_location_id: 'loc-1',
      pin_enabled: true,
    });
    expect(errors).toHaveLength(0);
  });

  it('should fail when name is missing', async () => {
    const errors = await validateDto({
      identification_number: '123456789',
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('should fail when name is empty string', async () => {
    const errors = await validateDto({
      name: '',
      identification_number: '123456789',
    });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('should fail when name exceeds MaxLength of 100', async () => {
    const errors = await validateDto({
      name: 'A'.repeat(101),
      identification_number: '123456789',
    });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('should pass when name is exactly 100 characters', async () => {
    const errors = await validateDto({
      name: 'A'.repeat(100),
      identification_number: '123456789',
    });
    expect(errors.some((e) => e.property === 'name')).toBe(false);
  });

  it('should fail when identification_number exceeds MaxLength of 50', async () => {
    const errors = await validateDto({
      name: 'Juan',
      identification_number: '1'.repeat(51),
    });
    expect(errors.some((e) => e.property === 'identification_number')).toBe(true);
  });

  it('should pass when identification_number is exactly 50 characters', async () => {
    const errors = await validateDto({
      name: 'Juan',
      identification_number: '1'.repeat(50),
    });
    expect(errors.some((e) => e.property === 'identification_number')).toBe(false);
  });

  it('should fail when role is an invalid enum value', async () => {
    const errors = await validateDto({
      name: 'Juan',
      identification_number: '123',
      role: 'SUPERUSER',
    });
    expect(errors.some((e) => e.property === 'role')).toBe(true);
  });

  it('should pass for each valid UserRole', async () => {
    for (const role of Object.values(UserRole)) {
      const errors = await validateDto({
        name: 'Juan',
        identification_number: '123',
        role,
      });
      expect(errors.some((e) => e.property === 'role')).toBe(false);
    }
  });

  it('should fail when pin_enabled is a string instead of boolean', async () => {
    const errors = await validateDto({
      name: 'Juan',
      identification_number: '123',
      pin_enabled: 'true',
    });
    expect(errors.some((e) => e.property === 'pin_enabled')).toBe(true);
  });

  it('should pass when pin_enabled is a boolean', async () => {
    const errors = await validateDto({
      name: 'Juan',
      identification_number: '123',
      pin_enabled: false,
    });
    expect(errors.some((e) => e.property === 'pin_enabled')).toBe(false);
  });
});
