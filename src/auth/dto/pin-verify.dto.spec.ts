import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PinVerifyDto } from './pin-verify.dto';

async function validateDto(plain: object) {
  return validate(plainToInstance(PinVerifyDto, plain));
}

describe('PinVerifyDto', () => {
  it('should pass with valid identification_number and pin', async () => {
    const errors = await validateDto({
      identification_number: '1234567890',
      pin: '1234',
    });
    expect(errors).toHaveLength(0);
  });

  describe('identification_number', () => {
    it('should fail when identification_number is missing', async () => {
      const errors = await validateDto({ pin: '1234' });
      expect(errors.some((e) => e.property === 'identification_number')).toBe(true);
    });

    it('should fail when identification_number is empty string', async () => {
      const errors = await validateDto({ identification_number: '', pin: '1234' });
      expect(errors.some((e) => e.property === 'identification_number')).toBe(true);
    });

    it('should fail when identification_number is a number type', async () => {
      const errors = await validateDto({ identification_number: 123456, pin: '1234' });
      expect(errors.some((e) => e.property === 'identification_number')).toBe(true);
    });
  });

  describe('pin', () => {
    it('should fail when pin is missing', async () => {
      const errors = await validateDto({ identification_number: '123456' });
      expect(errors.some((e) => e.property === 'pin')).toBe(true);
    });

    it('should fail when pin is empty string', async () => {
      const errors = await validateDto({
        identification_number: '123456',
        pin: '',
      });
      expect(errors.some((e) => e.property === 'pin')).toBe(true);
    });

    it('should fail when pin is a number type', async () => {
      const errors = await validateDto({
        identification_number: '123456',
        pin: 1234,
      });
      expect(errors.some((e) => e.property === 'pin')).toBe(true);
    });

    it('should pass when pin is a numeric string', async () => {
      const errors = await validateDto({
        identification_number: '123456',
        pin: '123456',
      });
      expect(errors).toHaveLength(0);
    });
  });
});
