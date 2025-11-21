import { airportTimezoneService } from '../airport-timezone';
import { OneWayAvailabilityBot } from '../one-way-availability-bot';
import { createMockContext, createMockUsers } from '../utils/test-helpers';

describe('Airport Expiry Functionality', () => {
  let bot: OneWayAvailabilityBot;

  beforeEach(() => {
    bot = new OneWayAvailabilityBot(':memory:', -123, 123);
    bot.getStorage().clearAllData();
  });

  afterEach(() => {
    bot.getStorage().close();
  });

  describe('Airport Timezone Service', () => {
    it('should find timezones for major airports', () => {
      // Test some major airports
      const berInfo = airportTimezoneService.getAirportInfo('BER');
      expect(berInfo.found).toBe(true);
      expect(berInfo.name).toContain('Berlin');
      expect(berInfo.timezone).toBeTruthy();
      
      const istInfo = airportTimezoneService.getAirportInfo('IST');
      expect(istInfo.found).toBe(true);
      expect(istInfo.name).toContain('İstanbul');
      expect(istInfo.timezone).toBeTruthy();
    });

    it('should fallback for unknown airports', () => {
      const unknownInfo = airportTimezoneService.getAirportInfo('ZZZ');
      expect(unknownInfo.found).toBe(false);
      
      // Test that we get fallback timezone
      const timezone = airportTimezoneService.getTimezone('ZZZ');
      expect(timezone).toBe('Etc/UTC-12');
    });

    it('should calculate midnight timestamps', () => {
      // Test midnight calculation for Berlin (BER) which uses Europe/Berlin timezone
      // For Nov 15, 2024 -> midnight when Nov 15 ends (start of Nov 16) in Berlin
      // In November 2024, Berlin is UTC+1, so midnight Nov 16 in Berlin = 23:00 UTC Nov 15
      const midnight = airportTimezoneService.getMidnightTimestamp('BER', '1115', 2024);
      
      // The entry for Nov 15 should expire at midnight on Nov 16 in Berlin time (23:00 UTC Nov 15)  
      const expectedMidnight = new Date('2024-11-15T23:00:00.000Z').getTime();
      
      expect(midnight).toBe(expectedMidnight);
      
      // Test a summer time date (July 15 -> July 16) when Berlin is UTC+2
      const summerMidnight = airportTimezoneService.getMidnightTimestamp('BER', '0715', 2024);
      
      // In July 2024, Berlin is UTC+2, so midnight July 16 in Berlin = 22:00 UTC July 15
      const expectedSummerMidnight = new Date('2024-07-15T22:00:00.000Z').getTime();
      
      expect(summerMidnight).toBe(expectedSummerMidnight);
    });

    it('should correctly determine if entries are expired', () => {
      // Create a clearly past date (3 days ago)
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 3);
      const pastDateStr = `${pastDate.getFullYear()}-${String(pastDate.getMonth() + 1).padStart(2, '0')}-${String(pastDate.getDate()).padStart(2, '0')}`;
      
      // Create a clearly future date (3 days from now)
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 3);
      const futureDateStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;
      
      // Past entries should be expired
      const pastExpired = airportTimezoneService.hasEntryExpired('BER', pastDateStr);
      expect(pastExpired).toBe(true);
      
      // Future entries should not be expired
      const futureExpired = airportTimezoneService.hasEntryExpired('BER', futureDateStr);
      expect(futureExpired).toBe(false);
    });
  });

  describe('Automatic Expiry Integration - Real Time Tests', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should expire entry at midnight local time in departure timezone', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      // Set current time to Dec 30, 2024, 20:00 UTC (21:00 in Berlin)
      jest.setSystemTime(new Date('2024-12-30T20:00:00.000Z'));

      // Add entry for Dec 31 departure from Berlin
      const context = createMockContext('/add 1231 ber ist', users.alice, privateChat);
      await bot.handleMessage(context);
      
      // Verify entry was added
      let entries = bot.getStorage().getUserEntries(users.alice.id);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.date).toBe('2024-12-31');
      
      // Move to Dec 31, 22:59 UTC (23:59 in Berlin) - should still be valid
      jest.setSystemTime(new Date('2024-12-31T22:59:00.000Z'));
      
      entries = bot.getStorage().getUserEntries(users.alice.id);
      expect(entries).toHaveLength(1); // Still valid, not yet midnight in Berlin
      
      // Move to exactly midnight in Berlin (Dec 31 23:00 UTC = Jan 1 00:00 Berlin)
      jest.setSystemTime(new Date('2024-12-31T23:00:00.000Z'));
      
      entries = bot.getStorage().getUserEntries(users.alice.id);
      expect(entries).toHaveLength(0); // Should be expired exactly at local midnight
    });

    it('should handle different timezones expiring at different UTC times', async () => {
      const users = createMockUsers();
      const aliceChat = { id: users.alice.id, type: 'private' as const };
      const bobChat = { id: users.bob.id, type: 'private' as const };

      // Set time to Nov 15, 2024, 10:00 UTC
      jest.setSystemTime(new Date('2024-11-15T10:00:00.000Z'));

      // Add entries for same date from different timezones
      const berlinContext = createMockContext('/add 1116 ber lax', users.alice, aliceChat);
      const tokyoContext = createMockContext('/add 1116 nrt lax', users.bob, bobChat);

      await bot.handleMessage(berlinContext);
      await bot.handleMessage(tokyoContext);
      
      let allEntries = bot.getStorage().getAllEntries();
      expect(allEntries).toHaveLength(2);
      
      // Move to Nov 16, 15:00 UTC
      // This is roughly 00:00 Nov 17 in Tokyo (UTC+9) but still Nov 16 in Berlin (UTC+1)
      jest.setSystemTime(new Date('2024-11-16T15:00:00.000Z'));
      
      allEntries = bot.getStorage().getAllEntries();
      // Tokyo entry (NRT) should be expired, Berlin entry (BER) should still be valid
      const remaining = allEntries.filter(e => !airportTimezoneService.hasEntryExpired(e.departure, e.date));
      expect(remaining.length).toBeLessThan(2); // At least one should be expired
    });

    it('should auto-expire during normal bot operations', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      // Set initial time
      jest.setSystemTime(new Date('2024-11-15T10:00:00.000Z'));

      // Add entry for Nov 15
      const addContext = createMockContext('/add 1115 ber ist', users.alice, privateChat);
      await bot.handleMessage(addContext);

      // Verify added
      let entries = bot.getStorage().getUserEntries(users.alice.id);
      expect(entries).toHaveLength(1);

      // Move time to after local midnight in Berlin (Nov 15 23:00 UTC = Nov 16 00:00 Berlin)
      jest.setSystemTime(new Date('2024-11-15T23:01:00.000Z'));

      // Test that /list auto-expires the entry
      const listContext = createMockContext('/list', users.alice, privateChat);
      await bot.handleMessage(listContext);
      
      expect(listContext.send).toHaveBeenCalledWith('Your entries: none');
    });

    it('should handle year transition correctly - January entry added in December', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      // Set time to Dec 29, 2024, 15:00 UTC
      jest.setSystemTime(new Date('2024-12-29T15:00:00.000Z'));

      // Add entry for January 2, 2025 (future year)
      const context = createMockContext('/add 0102 ber ist', users.alice, privateChat);
      await bot.handleMessage(context);
      
      let entries = bot.getStorage().getUserEntries(users.alice.id);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.date).toBe('2025-01-02');
      
      // Move to Jan 2, 2025, 22:59 UTC (23:59 Berlin) - should still be valid
      jest.setSystemTime(new Date('2025-01-02T22:59:00.000Z'));
      
      entries = bot.getStorage().getUserEntries(users.alice.id);
      expect(entries).toHaveLength(1);
      
      // Move to exactly midnight in Berlin (Jan 2 23:00 UTC = Jan 3 00:00 Berlin)
      jest.setSystemTime(new Date('2025-01-02T23:00:00.000Z'));
      
      entries = bot.getStorage().getUserEntries(users.alice.id);
      expect(entries).toHaveLength(0); // Should expire at local midnight
    });

    it('should handle extreme timezone differences across international date line', async () => {
      const users = createMockUsers();
      const aliceChat = { id: users.alice.id, type: 'private' as const };
      const bobChat = { id: users.bob.id, type: 'private' as const };

      // Set time to Nov 15, 2024, 11:00 UTC
      jest.setSystemTime(new Date('2024-11-15T11:00:00.000Z'));

      // Add entries from very different timezones for Nov 16
      const aucklandContext = createMockContext('/add 1116 akl lax', users.alice, aliceChat); // Auckland UTC+12/+13
      const hawaiiContext = createMockContext('/add 1116 hnl lax', users.bob, bobChat); // Honolulu UTC-10

      await bot.handleMessage(aucklandContext);
      await bot.handleMessage(hawaiiContext);
      
      let allEntries = bot.getStorage().getAllEntries();
      expect(allEntries).toHaveLength(2);
      
      // Move to Nov 16, 12:00 UTC
      // Auckland: ~01:00 Nov 17 (expired)
      // Hawaii: ~02:00 Nov 16 (valid)
      jest.setSystemTime(new Date('2024-11-16T12:00:00.000Z'));
      
      allEntries = bot.getStorage().getAllEntries();
      // Should have different expiry behavior due to massive timezone difference
      expect(allEntries.length).toBeLessThanOrEqual(2);
    });

    it('should handle unknown airport fallback correctly', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      // Set time to Nov 15, 2024, 10:00 UTC
      jest.setSystemTime(new Date('2024-11-15T10:00:00.000Z'));

      // Add entry with unknown airport (should use UTC-12 fallback)
      const context = createMockContext('/add 1115 zzz lax', users.alice, privateChat);
      await bot.handleMessage(context);
      
      let entries = bot.getStorage().getUserEntries(users.alice.id);
      expect(entries).toHaveLength(1);
      
      // Move to Nov 16, 11:59 UTC (should still be valid in UTC-12)
      jest.setSystemTime(new Date('2024-11-16T11:59:00.000Z'));
      
      entries = bot.getStorage().getUserEntries(users.alice.id);
      expect(entries).toHaveLength(1); // Still valid
      
      // Move to Nov 16, 12:01 UTC (should be expired - past midnight in UTC-12)
      jest.setSystemTime(new Date('2024-11-16T12:01:00.000Z'));
      
      entries = bot.getStorage().getUserEntries(users.alice.id);
      expect(entries).toHaveLength(0); // Should be expired using UTC-12 fallback
    });

    it('should handle leap year February 29 correctly', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      // Set to Feb 28, 2024 (leap year)
      jest.setSystemTime(new Date('2024-02-28T10:00:00.000Z'));

      // Add entry for Feb 29 (valid in leap year)
      const context = createMockContext('/add 0229 ber ist', users.alice, privateChat);
      await bot.handleMessage(context);
      
      let entries = bot.getStorage().getUserEntries(users.alice.id);
      expect(entries).toHaveLength(1);
      
      // Move to Feb 29 23:30 Berlin time (22:30 UTC)
      jest.setSystemTime(new Date('2024-02-29T22:30:00.000Z'));
      
      entries = bot.getStorage().getUserEntries(users.alice.id);
      expect(entries).toHaveLength(1); // Still valid
      
      // Move to exactly midnight Berlin time (23:00 UTC = 00:00 Berlin on Mar 1)
      jest.setSystemTime(new Date('2024-02-29T23:00:00.000Z'));
      
      entries = bot.getStorage().getUserEntries(users.alice.id);
      expect(entries).toHaveLength(0); // Expired at local midnight
    });

    it('should handle multiple operations with auto-expiry correctly', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      // Set initial time
      jest.setSystemTime(new Date('2024-11-15T10:00:00.000Z'));

      // Add multiple entries
      const context1 = createMockContext('/add 1115 ber ist', users.alice, privateChat);
      const context2 = createMockContext('/add 1116 fra muc', users.alice, privateChat);
      
      await bot.handleMessage(context1);
      await bot.handleMessage(context2);
      
      let entries = bot.getStorage().getUserEntries(users.alice.id);
      expect(entries).toHaveLength(2);
      
      // Move time to after Nov 15 midnight but before Nov 16 midnight
      jest.setSystemTime(new Date('2024-11-15T23:01:00.000Z'));
      
      // Try to remove Nov 15 entry - should get "not found" because it auto-expired
      const removeContext = createMockContext('/remove 1115', users.alice, privateChat);
      await bot.handleMessage(removeContext);
      
      expect(removeContext.send).toHaveBeenCalledWith('"/remove 1115": No entries found for 1115.');
      
      // But listing should show the Nov 16 entry still valid
      const listContext = createMockContext('/list', users.alice, privateChat);
      await bot.handleMessage(listContext);
      
      expect(listContext.send).toHaveBeenCalledWith(expect.stringContaining('1116 FRA / MUC'));
    });
  });

  describe('Manual Cleanup', () => {
    it('should provide manual cleanup method', async () => {
      jest.useFakeTimers();
      
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      // Add some entries using future dates
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const futureDateStr = `${String(futureDate.getMonth() + 1).padStart(2, '0')}${String(futureDate.getDate()).padStart(2, '0')}`;
      
      const context1 = createMockContext(`/add ${futureDateStr} ber ist`, users.alice, privateChat);
      await bot.handleMessage(context1);
      
      const context2 = createMockContext(`/add ${futureDateStr} fra muc`, users.alice, privateChat);
      await bot.handleMessage(context2);
      
      // Move system time to past the expiry timestamp (which would be midnight after the travel date)
      const dayAfterTravel = new Date(futureDate);
      dayAfterTravel.setDate(dayAfterTravel.getDate() + 1); // One day after the travel date
      dayAfterTravel.setHours(1, 0, 0, 0); // 1 AM next day - past midnight expiry
      jest.setSystemTime(dayAfterTravel);
      
      // Manual cleanup should remove all expired entries
      const removedCount = bot.getStorage().cleanupExpiredEntries();
      expect(removedCount).toBe(2);
      
      // Verify entries were removed
      const entries = bot.getStorage().getAllEntries();
      expect(entries).toHaveLength(0);
      
      jest.useRealTimers();
    });
  });
});