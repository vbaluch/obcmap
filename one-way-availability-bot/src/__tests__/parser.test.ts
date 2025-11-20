import { parseAvailabilityEntry } from '../parser';

describe('Availability Entry Parser', () => {
  const userId = 123;
  const username = 'testuser';

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-11-13T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should parse basic MMDD format', () => {
    const result = parseAvailabilityEntry('1115 ber ist', userId, username);
    
    expect(result.success).toBe(true);
    expect(result.entry).toEqual({
      userId,
      username,
      date: '2025-11-15', // Parser now returns full YYYY-MM-DD format
      departure: 'BER',
      arrival: 'IST',
      originalText: '1115 ber ist',
      expiryTimestamp: expect.any(Number),
    });
  });

  it('should parse with slash separator', () => {
    const result = parseAvailabilityEntry('1115 ber / ist', userId, username);
    
    expect(result.success).toBe(true);
    expect(result.entry).toEqual({
      userId,
      username,
      date: '2025-11-15',
      departure: 'BER',
      arrival: 'IST',
      originalText: '1115 ber / ist',
      expiryTimestamp: expect.any(Number),
    });
  });

  it('should parse with dash separator', () => {
    const result = parseAvailabilityEntry('1115 ber-ist', userId, username);
    
    expect(result.success).toBe(true);
    expect(result.entry).toEqual({
      userId,
      username,
      date: '2025-11-15',
      departure: 'BER',
      arrival: 'IST',
      originalText: '1115 ber-ist',
      expiryTimestamp: expect.any(Number),
    });
  });

  it('should handle case insensitive input', () => {
    const result = parseAvailabilityEntry('1115 BER IST', userId, username);
    
    expect(result.success).toBe(true);
    expect(result.entry).toEqual({
      userId,
      username,
      date: '2025-11-15',
      departure: 'BER',
      arrival: 'IST',
      originalText: '1115 BER IST',
      expiryTimestamp: expect.any(Number),
    });
  });

  it('should return format error for invalid format', () => {
    expect(parseAvailabilityEntry('invalid text', userId, username)).toEqual({
      success: false,
      error: 'format'
    });
    expect(parseAvailabilityEntry('1115', userId, username)).toEqual({
      success: false,
      error: 'format'
    });
    expect(parseAvailabilityEntry('1115 ber', userId, username)).toEqual({
      success: false,
      error: 'format'
    });
    expect(parseAvailabilityEntry('ber ist', userId, username)).toEqual({
      success: false,
      error: 'format'
    });
    expect(parseAvailabilityEntry('1115berist', userId, username)).toEqual({
      success: false,
      error: 'format'
    }); // no spaces
    expect(parseAvailabilityEntry('nov15 ber ist', userId, username)).toEqual({
      success: false,
      error: 'format'
    }); // month format
  });

  it('should return format error for invalid airport codes', () => {
    expect(parseAvailabilityEntry('1115 be ist', userId, username)).toEqual({
      success: false,
      error: 'format'
    });
    expect(parseAvailabilityEntry('1115 ber is', userId, username)).toEqual({
      success: false,
      error: 'format'
    });
    expect(parseAvailabilityEntry('1115 berlin ist', userId, username)).toEqual({
      success: false,
      error: 'format'
    });
  });
});