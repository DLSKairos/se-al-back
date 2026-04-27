import { computePeriodKey } from './period-key.util';

describe('computePeriodKey', () => {
  describe('DAILY', () => {
    it('should return date string in YYYY-MM-DD format', () => {
      const date = new Date('2025-05-20T12:00:00Z');
      const result = computePeriodKey('DAILY', date);
      expect(result).toBe('2025-05-20');
    });

    it('should return Bogota date when UTC date differs', () => {
      // 2025-12-31T04:00:00Z = 2025-12-30T23:00:00-05:00 (Bogota UTC-5)
      const date = new Date('2025-12-31T04:00:00Z');
      const result = computePeriodKey('DAILY', date);
      expect(result).toBe('2025-12-30');
    });

    it('should return correct date at midnight Bogota', () => {
      // 2025-01-15T05:00:00Z = 2025-01-15T00:00:00-05:00 (Bogota)
      const date = new Date('2025-01-15T05:00:00Z');
      const result = computePeriodKey('DAILY', date);
      expect(result).toBe('2025-01-15');
    });
  });

  describe('WEEKLY', () => {
    it('should return week string in YYYY-Www format', () => {
      // 2025-01-06 is week 2 of 2025
      const date = new Date('2025-01-06T12:00:00Z');
      const result = computePeriodKey('WEEKLY', date);
      expect(result).toMatch(/^\d{4}-W\d{2}$/);
    });

    it('should pad single-digit week numbers with leading zero', () => {
      // 2025-01-06 is week 2
      const date = new Date('2025-01-06T12:00:00Z');
      const result = computePeriodKey('WEEKLY', date);
      expect(result).toBe('2025-W02');
    });

    it('should return W01 for the first week of the year', () => {
      // 2025-01-01 is week 1 of 2025
      const date = new Date('2025-01-01T12:00:00Z');
      const result = computePeriodKey('WEEKLY', date);
      expect(result).toBe('2025-W01');
    });
  });

  describe('MONTHLY', () => {
    it('should return month string in YYYY-MM format', () => {
      const date = new Date('2025-05-20T12:00:00Z');
      const result = computePeriodKey('MONTHLY', date);
      expect(result).toBe('2025-05');
    });

    it('should pad single-digit months with leading zero', () => {
      const date = new Date('2025-03-15T12:00:00Z');
      const result = computePeriodKey('MONTHLY', date);
      expect(result).toBe('2025-03');
    });
  });

  describe('null-returning frequencies', () => {
    it('should return null for ONCE', () => {
      expect(computePeriodKey('ONCE', new Date())).toBeNull();
    });

    it('should return null for PER_EVENT', () => {
      expect(computePeriodKey('PER_EVENT', new Date())).toBeNull();
    });

    it('should return null for NONE', () => {
      expect(computePeriodKey('NONE', new Date())).toBeNull();
    });

    it('should return null for INHERIT', () => {
      expect(computePeriodKey('INHERIT', new Date())).toBeNull();
    });
  });

  describe('timezone boundary', () => {
    it('should use Bogota timezone: UTC 31-dic is still 30-dic in Bogota', () => {
      // 2025-12-31T03:00:00Z = 2025-12-30T22:00:00-05:00 (Bogota)
      const date = new Date('2025-12-31T03:00:00Z');
      const result = computePeriodKey('DAILY', date);
      expect(result).toBe('2025-12-30');
    });

    it('should use Bogota timezone: UTC 31-dic after midnight Bogota is 31-dic', () => {
      // 2025-12-31T06:00:00Z = 2025-12-31T01:00:00-05:00 (Bogota)
      const date = new Date('2025-12-31T06:00:00Z');
      const result = computePeriodKey('DAILY', date);
      expect(result).toBe('2025-12-31');
    });
  });

  describe('without date argument', () => {
    it('should not throw when called without date', () => {
      expect(() => computePeriodKey('DAILY')).not.toThrow();
    });

    it('should return a valid string for DAILY without date', () => {
      const result = computePeriodKey('DAILY');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return null for ONCE without date', () => {
      expect(computePeriodKey('ONCE')).toBeNull();
    });
  });
});
