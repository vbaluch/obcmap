import { AvailabilityBot } from '../availability-bot';
import { createMockContext, createMockUsers } from '../utils/test-helpers';

describe('Entry Already Exists Error', () => {
  let bot: AvailabilityBot;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-11-13T10:00:00.000Z'));

    bot = new AvailabilityBot(':memory:', -123, 123);
    bot.getStorage().clearAllData();
  });

  afterEach(() => {
    bot.getStorage().close();
    jest.useRealTimers();
  });

  describe('Duplicate Entry Handling', () => {
    it('should show user list when trying to add duplicate entry', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      // Add initial entry
      const addContext = createMockContext('/add 1115 ber ist', users.alice, privateChat);
      await bot.handleMessage(addContext);

      // Try to add the same entry again
      const duplicateContext = createMockContext('/add 1115 ber ist', users.alice, privateChat);
      await bot.handleMessage(duplicateContext);

      // Should show combined error message with user entries
      const sentMessage = duplicateContext.send.mock.calls[0]?.[0];
      expect(sentMessage).toContain('Entry already exists: "/add 1115 ber ist"');
      expect(sentMessage).toContain('Your entries:');
      expect(sentMessage).toContain('1115 BER / IST');
    });

    it('should show user list for Maximum 3 entries error', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      // Fill up the 3-entry limit
      const addContext1 = createMockContext('/add 1115 ber ist', users.alice, privateChat);
      await bot.handleMessage(addContext1);
      
      const addContext2 = createMockContext('/add 1116 fra muc', users.alice, privateChat);
      await bot.handleMessage(addContext2);
      
      const addContext3 = createMockContext('/add 1117 ham cdg', users.alice, privateChat);
      await bot.handleMessage(addContext3);

      // Try to add a 4th entry (should get "Maximum 3 entries" error)
      const limitContext = createMockContext('/add 1118 vie zrh', users.alice, privateChat);
      await bot.handleMessage(limitContext);

      // Should show user's current entries with the error
      const sentMessage = limitContext.send.mock.calls[0]?.[0];
      expect(sentMessage).toContain('Maximum 3 entries per user allowed: "/add 1118 vie zrh"');
      expect(sentMessage).toContain('Your entries:');
      expect(sentMessage).toContain('1115 BER / IST');
      expect(sentMessage).toContain('1116 FRA / MUC');
      expect(sentMessage).toContain('1117 HAM / CDG');
    });

    it('should work correctly when user has no existing entries', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      // Add a new entry (should succeed normally)
      const addContext = createMockContext('/add 1115 ber ist', users.alice, privateChat);
      await bot.handleMessage(addContext);

      // Should succeed normally
      expect(addContext.send).toHaveBeenCalledWith(expect.stringContaining('Your entries:'));
      expect(addContext.send).toHaveBeenCalledWith(expect.stringContaining('1115 BER / IST'));
      expect(addContext.send).not.toHaveBeenCalledWith(expect.stringContaining('Entry already exists:'));
    });
  });
});