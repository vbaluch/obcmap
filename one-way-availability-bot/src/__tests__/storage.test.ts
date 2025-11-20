import { AvailabilityStorage } from '../storage';
import { AvailabilityEntry } from '../parser';
import { airportTimezoneService } from '../airport-timezone';

describe('AvailabilityStorage', () => {
  let storage: AvailabilityStorage;

  beforeEach(() => {
    storage = new AvailabilityStorage(':memory:'); // Use in-memory SQLite for tests
    storage.clearAllData();
  });

  afterEach(() => {
    storage.close();
  });

  describe('Date Sorting', () => {
    it('should sort dates chronologically within same year', () => {
      // Mock the timezone service to not expire entries during this test
      jest.spyOn(airportTimezoneService, 'hasEntryExpired').mockReturnValue(false);
      // Use future dates that won't be auto-expired
      const now = new Date();
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 15);
      const nextMonth2 = new Date(now.getFullYear(), now.getMonth() + 2, 15);  
      const nextMonth3 = new Date(now.getFullYear(), now.getMonth() + 3, 15);
      
      const date1 = `${nextMonth3.getFullYear()}-${String(nextMonth3.getMonth() + 1).padStart(2, '0')}-15`;
      const date2 = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-15`;
      const date3 = `${nextMonth2.getFullYear()}-${String(nextMonth2.getMonth() + 1).padStart(2, '0')}-15`;

      const entries: AvailabilityEntry[] = [
        { userId: 1, username: 'user1', date: date1, departure: 'BER', arrival: 'IST', originalText: `${String(nextMonth3.getMonth() + 1).padStart(2, '0')}15 ber ist`, expiryTimestamp: Date.now() + 86400000 },
        { userId: 2, username: 'user2', date: date2, departure: 'FRA', arrival: 'MUC', originalText: `${String(nextMonth.getMonth() + 1).padStart(2, '0')}15 fra muc`, expiryTimestamp: Date.now() + 86400000 },
        { userId: 3, username: 'user3', date: date3, departure: 'HAM', arrival: 'CDG', originalText: `${String(nextMonth2.getMonth() + 1).padStart(2, '0')}15 ham cdg`, expiryTimestamp: Date.now() + 86400000 },
      ];

      for (const entry of entries) {
        storage.addEntry(entry);
      }

      const sorted = storage.getAllEntries();
      expect(sorted.map(e => e.date)).toEqual([date2, date3, date1]);
      
      // Restore original method
      (airportTimezoneService.hasEntryExpired as jest.Mock).mockRestore();
    });

    it('should handle year transition correctly - December before January', () => {
      // Mock the timezone service to not expire entries during this test
      jest.spyOn(airportTimezoneService, 'hasEntryExpired').mockReturnValue(false);
      
      // Test year transition with clearly future dates to avoid auto-expiry
      // Mock a December date and January date from a future year to ensure they don't expire
      const currentYear = new Date().getFullYear();
      const testEntries: AvailabilityEntry[] = [
        { userId: 1, username: 'user1', date: `${currentYear + 1}-01-05`, departure: 'BER', arrival: 'IST', originalText: '0105 ber ist', expiryTimestamp: Date.now() + 86400000 }, // Jan next year
        { userId: 2, username: 'user2', date: `${currentYear}-12-25`, departure: 'FRA', arrival: 'MUC', originalText: '1225 fra muc', expiryTimestamp: Date.now() + 86400000 }, // Dec this year
      ];
      
      for (const entry of testEntries) {
        storage.addEntry(entry);
      }

      // December should come before January of next year
      const sorted = storage.getAllEntries();
      expect(sorted.map(e => e.date)).toEqual([`${currentYear}-12-25`, `${currentYear + 1}-01-05`]);
      
      // Restore original method
      (airportTimezoneService.hasEntryExpired as jest.Mock).mockRestore();
    });

    it('should sort by departure airport when dates are same', () => {
      const entries: AvailabilityEntry[] = [
        { userId: 1, username: 'user1', date: '2025-11-15', departure: 'FRA', arrival: 'IST', originalText: '1115 fra ist', expiryTimestamp: Date.now() + 86400000 },
        { userId: 2, username: 'user2', date: '2025-11-15', departure: 'BER', arrival: 'MUC', originalText: '1115 ber muc', expiryTimestamp: Date.now() + 86400000 },
        { userId: 3, username: 'user3', date: '2025-11-15', departure: 'HAM', arrival: 'CDG', originalText: '1115 ham cdg', expiryTimestamp: Date.now() + 86400000 },
      ];

      for (const entry of entries) {
        storage.addEntry(entry);
      }

      const sorted = storage.getAllEntries();
      expect(sorted.map(e => e.departure)).toEqual(['BER', 'FRA', 'HAM']);
    });

    it('should handle dates within 2-week window correctly', () => {
      // Test that dates within realistic 2-week advance booking work
      const now = new Date();
      const tomorrow = new Date(now.getTime() + (24 * 60 * 60 * 1000));
      const inOneWeek = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
      
      const formatDate = (date: Date): string => {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      
      const tomorrowStr = formatDate(tomorrow);
      const oneWeekStr = formatDate(inOneWeek);

      const entries: AvailabilityEntry[] = [
        { userId: 1, username: 'user1', date: oneWeekStr, departure: 'BER', arrival: 'IST', originalText: `${oneWeekStr} ber ist`, expiryTimestamp: Date.now() + 86400000 },
        { userId: 2, username: 'user2', date: tomorrowStr, departure: 'FRA', arrival: 'MUC', originalText: `${tomorrowStr} fra muc`, expiryTimestamp: Date.now() + 86400000 },
      ];

      for (const entry of entries) {
        storage.addEntry(entry);
      }

      const sorted = storage.getAllEntries();
      // Should be chronologically ordered
      expect(sorted.map(e => e.date)).toEqual([tomorrowStr, oneWeekStr]);
    });
  });

  describe('Entry Management', () => {
    it('should enforce 3 entry limit per user', () => {
      for (let i = 1; i <= 3; i++) {
        const result = storage.addEntry({
          userId: 1,
          username: 'user1',
          date: `111${i}`,
          departure: 'BER',
          arrival: 'IST',
          originalText: `111${i} ber ist`,
          expiryTimestamp: Date.now() + 86400000,
        });
        expect(result.success).toBe(true);
      }

      const result = storage.addEntry({
        userId: 1,
        username: 'user1',
        date: '1114',
        departure: 'BER',
        arrival: 'IST',
        originalText: '1114 ber ist',
        expiryTimestamp: Date.now() + 86400000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Maximum 3 entries per user allowed: "1114 ber ist"');
    });

    it('should prevent duplicate entries', () => {
      const entry = {
        userId: 1,
        username: 'user1',
        date: '1115',
        departure: 'BER',
        arrival: 'IST',
        originalText: '/add 1115 ber ist',
        expiryTimestamp: Date.now() + 86400000,
      };

      const result1 = storage.addEntry(entry);
      const result2 = storage.addEntry(entry);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('Entry already exists: \"/add 1115 ber ist\"');
    });
  });
});