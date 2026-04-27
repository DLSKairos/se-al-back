import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateSubmissionDto } from './create-submission.dto';

async function validateDto(plain: object) {
  return validate(plainToInstance(CreateSubmissionDto, plain));
}

describe('CreateSubmissionDto', () => {
  it('should pass with minimum required fields', async () => {
    const errors = await validateDto({
      template_id: 'tmpl-abc-123',
      data: {},
    });
    expect(errors).toHaveLength(0);
  });

  it('should pass with all fields provided', async () => {
    const errors = await validateDto({
      template_id: 'tmpl-abc-123',
      data: { campo_texto: 'valor' },
      work_location_id: 'loc-1',
      geo_lat: 4.710989,
      geo_lng: -74.072092,
    });
    expect(errors).toHaveLength(0);
  });

  describe('template_id', () => {
    it('should fail when template_id is missing', async () => {
      const errors = await validateDto({ data: {} });
      expect(errors.some((e) => e.property === 'template_id')).toBe(true);
    });

    it('should fail when template_id is empty string', async () => {
      const errors = await validateDto({ template_id: '', data: {} });
      expect(errors.some((e) => e.property === 'template_id')).toBe(true);
    });

    it('should fail when template_id is a number', async () => {
      const errors = await validateDto({ template_id: 123, data: {} });
      expect(errors.some((e) => e.property === 'template_id')).toBe(true);
    });
  });

  describe('data', () => {
    it('should fail when data is missing', async () => {
      const errors = await validateDto({ template_id: 'tmpl-1' });
      expect(errors.some((e) => e.property === 'data')).toBe(true);
    });

    it('should fail when data is an array', async () => {
      const errors = await validateDto({ template_id: 'tmpl-1', data: [] });
      expect(errors.some((e) => e.property === 'data')).toBe(true);
    });

    it('should fail when data is a string', async () => {
      const errors = await validateDto({ template_id: 'tmpl-1', data: 'text' });
      expect(errors.some((e) => e.property === 'data')).toBe(true);
    });

    it('should pass when data has nested values', async () => {
      const errors = await validateDto({
        template_id: 'tmpl-1',
        data: { campo1: 'valor', campo2: 42, campo3: true },
      });
      expect(errors.some((e) => e.property === 'data')).toBe(false);
    });
  });

  describe('geo_lat and geo_lng', () => {
    it('should fail when geo_lat is a string', async () => {
      const errors = await validateDto({
        template_id: 'tmpl-1',
        data: {},
        geo_lat: '4.7',
      });
      expect(errors.some((e) => e.property === 'geo_lat')).toBe(true);
    });

    it('should fail when geo_lng is a string', async () => {
      const errors = await validateDto({
        template_id: 'tmpl-1',
        data: {},
        geo_lng: '-74',
      });
      expect(errors.some((e) => e.property === 'geo_lng')).toBe(true);
    });

    it('should pass when geo_lat and geo_lng are valid numbers', async () => {
      const errors = await validateDto({
        template_id: 'tmpl-1',
        data: {},
        geo_lat: 4.710989,
        geo_lng: -74.072092,
      });
      expect(errors.some((e) => e.property === 'geo_lat')).toBe(false);
      expect(errors.some((e) => e.property === 'geo_lng')).toBe(false);
    });
  });

  describe('work_location_id', () => {
    it('should fail when work_location_id is a number', async () => {
      const errors = await validateDto({
        template_id: 'tmpl-1',
        data: {},
        work_location_id: 123,
      });
      expect(errors.some((e) => e.property === 'work_location_id')).toBe(true);
    });

    it('should pass when work_location_id is omitted', async () => {
      const errors = await validateDto({ template_id: 'tmpl-1', data: {} });
      expect(errors.some((e) => e.property === 'work_location_id')).toBe(false);
    });
  });
});
