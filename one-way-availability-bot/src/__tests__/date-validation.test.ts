import { parseAvailabilityEntry } from '../parser';
import { createMockUsers } from '../utils/test-helpers';

describe('Date Validation - 7 Day Advance Limit', () => {
  const users = createMockUsers();
  
  function getDateString(daysFromNow: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}${day}`;
  }
  
  function getExpectedFullDate(daysFromNow: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  describe('Valid dates (within 7 days)', () => {
    it('should accept today', () => {
      const today = getDateString(0);
      const expectedDate = getExpectedFullDate(0);
      const result = parseAvailabilityEntry(`${today} ber ist`, users.alice.id, users.alice.username);
      expect(result.success).toBe(true);
      expect(result.entry?.date).toBe(expectedDate);
    });

    it('should accept tomorrow', () => {
      const tomorrow = getDateString(1);
      const expectedDate = getExpectedFullDate(1);
      const result = parseAvailabilityEntry(`${tomorrow} ber ist`, users.alice.id, users.alice.username);
      expect(result.success).toBe(true);
      expect(result.entry?.date).toBe(expectedDate);
    });

    it('should accept 3 days from now', () => {
      const threeDays = getDateString(3);
      const expectedDate = getExpectedFullDate(3);
      const result = parseAvailabilityEntry(`${threeDays} ber ist`, users.alice.id, users.alice.username);
      expect(result.success).toBe(true);
      expect(result.entry?.date).toBe(expectedDate);
    });

    it('should accept exactly 7 days from now', () => {
      const sevenDays = getDateString(7);
      const expectedDate = getExpectedFullDate(7);
      const result = parseAvailabilityEntry(`${sevenDays} ber ist`, users.alice.id, users.alice.username);
      expect(result.success).toBe(true);
      expect(result.entry?.date).toBe(expectedDate);
    });

    it('should accept exactly 8 days from now (timezone tolerance)', () => {
      const eightDays = getDateString(8);
      const expectedDate = getExpectedFullDate(8);
      const result = parseAvailabilityEntry(`${eightDays} ber ist`, users.alice.id, users.alice.username);
      expect(result.success).toBe(true);
      expect(result.entry?.date).toBe(expectedDate);
    });

    it('should accept yesterday (to account for timezones)', () => {
      const yesterday = getDateString(-1);
      const expectedDate = getExpectedFullDate(-1);
      const result = parseAvailabilityEntry(`${yesterday} ber ist`, users.alice.id, users.alice.username);
      expect(result.success).toBe(true);
      expect(result.entry?.date).toBe(expectedDate);
    });
  });

  describe('Invalid dates (beyond 8 days)', () => {
    it('should reject 9 days from now with date_limit error', () => {
      const nineDays = getDateString(9);
      const result = parseAvailabilityEntry(`${nineDays} ber ist`, users.alice.id, users.alice.username);
      expect(result.success).toBe(false);
      expect(result.error).toBe('date_limit');
    });

    it('should reject 30 days from now with date_limit error', () => {
      const thirtyDays = getDateString(30);
      const result = parseAvailabilityEntry(`${thirtyDays} ber ist`, users.alice.id, users.alice.username);
      expect(result.success).toBe(false);
      expect(result.error).toBe('date_limit');
    });
  });

  describe('Format errors', () => {
    it('should reject invalid format with format error', () => {
      const result = parseAvailabilityEntry('invalid format', users.alice.id, users.alice.username);
      expect(result.success).toBe(false);
      expect(result.error).toBe('format');
    });

    it('should reject invalid month/day combinations with format error', () => {
      // Invalid dates should be rejected with format error (they fail format validation)
      const result1 = parseAvailabilityEntry('1332 ber ist', users.alice.id, users.alice.username); // Month 13
      const result2 = parseAvailabilityEntry('0015 ber ist', users.alice.id, users.alice.username); // Month 0
      const result3 = parseAvailabilityEntry('0132 ber ist', users.alice.id, users.alice.username); // Day 32
      
      expect(result1.success).toBe(false);
      expect(result1.error).toBe('format');
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('format');
      expect(result3.success).toBe(false);
      expect(result3.error).toBe('format');
    });

    it('REGRESSION: should return format error for "3112" (invalid month)', () => {
      // This was incorrectly returning date_limit error before the fix
      const result = parseAvailabilityEntry('3112 ist ber', users.alice.id, users.alice.username);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('format');
    });
  });

  describe('Edge cases', () => {
    it('should handle month/year boundaries correctly', () => {
      // Test dates around month/year boundaries
      // This is more complex to test reliably, so we'll do basic validation
      const validDate = getDateString(5); // 5 days from now should always be valid
      const expectedDate = getExpectedFullDate(5);
      const result = parseAvailabilityEntry(`${validDate} ber ist`, users.alice.id, users.alice.username);
      expect(result.success).toBe(true);
      expect(result.entry?.date).toBe(expectedDate);
    });

    it('should handle Jan 1st with Dec 31st entry (year boundary)', () => {
      // Mock current date to be January 1st
      const mockDate = new Date('2025-01-01T12:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(mockDate);

      try {
        // Dec 31st should be accepted as "yesterday" from Jan 1st perspective
        const result = parseAvailabilityEntry('1231 ber ist', users.alice.id, users.alice.username);
        expect(result.success).toBe(true);
        expect(result.entry?.date).toBe('2024-12-31');
      } finally {
        jest.useRealTimers();
      }
    });

    it('should handle Dec 31st with Jan 1st entry (year boundary)', () => {
      // Mock current date to be December 31st
      const mockDate = new Date('2024-12-31T12:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(mockDate);

      try {
        // Jan 1st should be accepted as "tomorrow" from Dec 31st perspective
        const result = parseAvailabilityEntry('0101 ber ist', users.alice.id, users.alice.username);
        expect(result.success).toBe(true);
        expect(result.entry?.date).toBe('2025-01-01');
      } finally {
        jest.useRealTimers();
      }
    });
  });
});