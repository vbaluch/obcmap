import { AvailabilityBot } from '../availability-bot';
import { createMockContext, createMockUsers } from '../utils/test-helpers';

describe('AvailabilityBot', () => {
  let bot: AvailabilityBot;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-11-13T10:00:00.000Z'));

    bot = new AvailabilityBot(':memory:', -123, 123); // Use in-memory SQLite for tests
    bot.getStorage().clearAllData();
  });

  afterEach(() => {
    bot.getStorage().close();
    jest.useRealTimers();
  });

  describe('Message Handling', () => {
    it('should add valid availability entry', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContext('/add 1115 ber ist', users.alice, privateChat);

      await bot.handleMessage(context);

      const entries = bot.getStorage().getAllEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(expect.objectContaining({
        userId: users.alice.id,
        username: users.alice.username,
        date: '2025-11-15',
        departure: 'BER',
        arrival: 'IST',
      }));

      // Should reply to user with their personal entries
      expect(context.send).toHaveBeenCalledWith(expect.stringContaining('Your entries:'));
      expect(context.send).toHaveBeenCalledWith(expect.stringContaining('1115 BER / IST'));
      
      // Should post full list to target group
      expect(context.bot.api.sendMessage).toHaveBeenCalledWith({
        chat_id: -123,
        text: expect.stringContaining('1115 BER / IST @alice'),
        message_thread_id: 123,
        parse_mode: 'MarkdownV2'
      });
    });

    it('should handle multiple users adding entries', async () => {
      const users = createMockUsers();
      const aliceChat = { id: users.alice.id, type: 'private' as const };
      const bobChat = { id: users.bob.id, type: 'private' as const };

      const aliceContext = createMockContext('/add 1115 ber ist', users.alice, aliceChat);
      const bobContext = createMockContext('/add 1116 fra muc', users.bob, bobChat);

      await bot.handleMessage(aliceContext);
      await bot.handleMessage(bobContext);

      const entries = bot.getStorage().getAllEntries();
      expect(entries).toHaveLength(2);
      
      // Should be sorted by date
      expect(entries[0]?.date).toBe('2025-11-15');
      expect(entries[1]?.date).toBe('2025-11-16');
    });

    it('should enforce 3 entry limit per user', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      // Use dates that will definitely be valid (within 7 days from today)
      function getValidDateString(daysFromNow: number): string {
        const date = new Date();
        date.setDate(date.getDate() + daysFromNow);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${month}${day}`;
      }

      // Add 3 entries for Alice using valid future dates
      const date1 = getValidDateString(1);
      const date2 = getValidDateString(2); 
      const date3 = getValidDateString(3);
      const date4 = getValidDateString(4);

      const context1 = createMockContext(`/add ${date1} ber ist`, users.alice, privateChat);
      await bot.handleMessage(context1);
      
      const context2 = createMockContext(`/add ${date2} fra muc`, users.alice, privateChat);
      await bot.handleMessage(context2);
      
      const context3 = createMockContext(`/add ${date3} ham cdg`, users.alice, privateChat);
      await bot.handleMessage(context3);

      // Try to add 4th entry
      const context4 = createMockContext(`/add ${date4} vie zrh`, users.alice, privateChat);
      await bot.handleMessage(context4);

      // Should show error with user's current entries
      const sentMessage = context4.send.mock.calls[0]?.[0];
      expect(sentMessage).toContain('Maximum 3 entries per user allowed:');
      expect(sentMessage).toContain('Your entries:');
      expect(bot.getStorage().getAllEntries()).toHaveLength(3);
    });

    it('should reject duplicate entries', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      const context1 = createMockContext('/add 1115 ber ist', users.alice, privateChat);
      const context2 = createMockContext('/add 1115 ber ist', users.alice, privateChat);

      await bot.handleMessage(context1);
      await bot.handleMessage(context2);

      expect(context2.send).toHaveBeenCalledWith(expect.stringContaining('Entry already exists'));
      expect(bot.getStorage().getAllEntries()).toHaveLength(1);
    });

    it('should handle different input formats', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      const formats = [
        '/add 1115 ber ist',
        '/add 1116 BER / IST',
        '/add 1117 BER-IST'
      ];

      for (let i = 0; i < formats.length; i++) {
        const format = formats[i];
        if (format) {
          const context = createMockContext(format, users.alice, privateChat);
          await bot.handleMessage(context);
        }
      }

      const entries = bot.getStorage().getAllEntries();
      expect(entries).toHaveLength(3);
      expect(entries.map(e => e.date)).toEqual(['2025-11-15', '2025-11-16', '2025-11-17']);
    });

    it('should ignore non-availability messages', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      const context = createMockContext('Hello everyone!', users.alice, privateChat);
      await bot.handleMessage(context);

      expect(context.send).not.toHaveBeenCalled();
      expect(bot.getStorage().getAllEntries()).toHaveLength(0);
    });
  });

  describe('Remove Command', () => {
    beforeEach(async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      // Add some test entries
      const entries = [
        '/add 1115 ber ist',
        '/add 1116 fra muc',
        '/add 1117 ham cdg'
      ];

      for (const entry of entries) {
        const context = createMockContext(entry, users.alice, privateChat);
        await bot.handleMessage(context);
      }
    });

    it('should remove specific entry', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      const context = createMockContext('/remove 1116 fra muc', users.alice, privateChat);
      await bot.handleMessage(context);

      const entries = bot.getStorage().getAllEntries();
      expect(entries).toHaveLength(2);
      expect(entries.find(e => e.date === '1116')).toBeUndefined();
    });

    it('should handle case insensitive airport codes', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      const context = createMockContext('/remove 1115 BER IST', users.alice, privateChat);
      await bot.handleMessage(context);

      const entries = bot.getStorage().getAllEntries();
      expect(entries).toHaveLength(2);
      expect(entries.find(e => e.date === '1115')).toBeUndefined();
    });

    it('should show error for invalid remove format', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      const context = createMockContext('/remove 1115 BER', users.alice, privateChat); // 2 parts - invalid
      await bot.handleMessage(context);

      expect(context.send).toHaveBeenCalledWith(expect.stringContaining('Usage: /remove (or /rm) MMDD DEP ARR or /remove MMDD'));
    });

    it('should show error when entry not found', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      const context = createMockContext('/remove 1119 ber ist', users.alice, privateChat);
      await bot.handleMessage(context);

      expect(context.send).toHaveBeenCalledWith('"/remove 1119 ber ist": Entry not found. Make sure the date and airports match exactly.');
    });

    it('should work with /rm alias', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      const context = createMockContext('/rm 1115 ber ist', users.alice, privateChat);
      await bot.handleMessage(context);

      const entries = bot.getStorage().getAllEntries();
      expect(entries).toHaveLength(2);
      expect(entries.find(e => e.date === '1115')).toBeUndefined();
      
      // Should reply to user and post updated list to group
      expect(context.send).toHaveBeenCalledWith(expect.stringContaining('Your entries:'));
      expect(context.bot.api.sendMessage).toHaveBeenCalledWith({
        chat_id: -123,
        text: expect.stringContaining('*OBC One\\-Way Availability*'),
        message_thread_id: 123,
        parse_mode: 'MarkdownV2'
      });
    });
  });

  describe('Date-Only Remove Command', () => {
    const setupTestEntries = async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      // Add some test entries (within 3-entry limit)
      const entries = [
        '/add 1115 ber ist',      // Single entry for 1115
        '/add 1116 fra muc',      // Multiple entries for 1116
        '/add 1116 ham cdg'       // Multiple entries for 1116
      ];

      for (const entry of entries) {
        const context = createMockContext(entry, users.alice, privateChat);
        await bot.handleMessage(context);
      }
    };

    it('should remove entry when only one exists for date', async () => {
      await setupTestEntries();
      
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      const context = createMockContext('/remove 1115', users.alice, privateChat);
      await bot.handleMessage(context);

      const entries = bot.getStorage().getAllEntries();
      expect(entries).toHaveLength(2); // 3 original - 1 removed = 2
      expect(entries.find(e => e.date === '1115')).toBeUndefined();
      
      // Should reply to user and post updated list to group
      expect(context.send).toHaveBeenCalledWith(expect.stringContaining('Your entries:'));
    });

    it('should show error when multiple entries exist for date', async () => {
      await setupTestEntries();
      
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      const context = createMockContext('/remove 1116', users.alice, privateChat);
      await bot.handleMessage(context);

      const entries = bot.getStorage().getAllEntries();
      expect(entries).toHaveLength(3); // No removal should happen
      
      // Should show error with quoted command, error message, and ALL user entries
      const sentMessage = context.send.mock.calls[0]?.[0];
      expect(sentMessage).toContain('"/remove 1116": Multiple entries found for 1116. Please specify departure and arrival.');
      expect(sentMessage).toContain('Your entries:');
      expect(sentMessage).toContain('1115 BER / IST');
      expect(sentMessage).toContain('1116 FRA / MUC');
      expect(sentMessage).toContain('1116 HAM / CDG');
    });

    it('should show error when no entries exist for date', async () => {
      await setupTestEntries();
      
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      const context = createMockContext('/remove 1120', users.alice, privateChat);
      await bot.handleMessage(context);

      const entries = bot.getStorage().getAllEntries();
      expect(entries).toHaveLength(3); // No removal should happen
      
      // Should show error for no entries
      expect(context.send).toHaveBeenCalledWith('"/remove 1120": No entries found for 1120.');
    });

    it('should work with /rm alias for date-only removal', async () => {
      await setupTestEntries();
      
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      const context = createMockContext('/rm 1115', users.alice, privateChat);
      await bot.handleMessage(context);

      const entries = bot.getStorage().getAllEntries();
      expect(entries).toHaveLength(2);
      expect(entries.find(e => e.date === '1115')).toBeUndefined();
    });

    it('should reject partial entries (just departure or arrival)', async () => {
      await setupTestEntries();
      
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      const context1 = createMockContext('/remove 1115 BER', users.alice, privateChat);
      await bot.handleMessage(context1);

      const context2 = createMockContext('/remove BER IST', users.alice, privateChat);
      await bot.handleMessage(context2);

      const entries = bot.getStorage().getAllEntries();
      expect(entries).toHaveLength(3); // No removal should happen
      
      // Should show usage error
      expect(context1.send).toHaveBeenCalledWith(expect.stringContaining('Usage: /remove (or /rm) MMDD DEP ARR or /remove MMDD'));
      expect(context2.send).toHaveBeenCalledWith(expect.stringContaining('Usage: /remove (or /rm) MMDD DEP ARR or /remove MMDD'));
    });
  });

  describe('List Formatting', () => {
    it('should format entries correctly', async () => {
      const users = createMockUsers();

      // Add entries in random order
      const contexts = [];
      const entries = [
        { text: '/add 1117 ham cdg', user: users.alice },
        { text: '/add 1115 ber ist', user: users.bob },
        { text: '/add 1116 fra muc', user: users.charlie },
      ];

      for (const entry of entries) {
        const userChat = { id: entry.user.id, type: 'private' as const };
        const context = createMockContext(entry.text, entry.user, userChat);
        contexts.push(context);
        await bot.handleMessage(context);
      }

      // Check the last posted message to the target group (should be sorted)
      const lastContext = contexts[contexts.length - 1];
      if (!lastContext) {
        throw new Error('Expected at least one context');
      }
      
      const expectedList = expect.stringContaining('1115 BER / IST @bob');
      expect(lastContext.bot.api.sendMessage).toHaveBeenCalledWith({
        chat_id: -123,
        text: expectedList,
        message_thread_id: 123,
        parse_mode: 'MarkdownV2'
      });
    });
  });

  describe('Clear Command', () => {
    it('should clear all entries for a user', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      // Add some entries first
      const addContext1 = createMockContext('/add 1115 ber ist', users.alice, privateChat);
      await bot.handleMessage(addContext1);
      
      const addContext2 = createMockContext('/add 1116 fra muc', users.alice, privateChat);
      await bot.handleMessage(addContext2);

      let entries = bot.getStorage().getAllEntries();
      expect(entries).toHaveLength(2);

      // Clear all entries
      const clearContext = createMockContext('/clear', users.alice, privateChat);
      await bot.handleMessage(clearContext);

      entries = bot.getStorage().getAllEntries();
      expect(entries).toHaveLength(0);

      // Should send cleared entries info and post empty list to group
      expect(clearContext.send).toHaveBeenCalledTimes(1);
      const sentMessage = clearContext.send.mock.calls[0]?.[0];
      expect(sentMessage).toContain('Cleared entries:');
      expect(sentMessage).toContain('1115 BER / IST');
      expect(sentMessage).toContain('1116 FRA / MUC');
      expect(sentMessage).toContain('Your entries: none');
      expect(clearContext.bot.api.sendMessage).toHaveBeenCalledWith({
        chat_id: -123,
        text: expect.stringContaining('No availability entries yet'),
        message_thread_id: 123,
        parse_mode: 'MarkdownV2'
      });
    });

    it('should only clear entries for the requesting user', async () => {
      const users = createMockUsers();
      const aliceChat = { id: users.alice.id, type: 'private' as const };
      const bobChat = { id: users.bob.id, type: 'private' as const };

      // Add entries for Alice
      const aliceContext = createMockContext('/add 1115 ber ist', users.alice, aliceChat);
      await bot.handleMessage(aliceContext);

      // Add entries for Bob
      const bobContext = createMockContext('/add 1116 fra muc', users.bob, bobChat);
      await bot.handleMessage(bobContext);

      let entries = bot.getStorage().getAllEntries();
      expect(entries).toHaveLength(2);

      // Alice clears her entries
      const clearContext = createMockContext('/clear', users.alice, aliceChat);
      await bot.handleMessage(clearContext);

      entries = bot.getStorage().getAllEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.username).toBe('bob');
    });

    it('should handle /clear when user has no entries', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      const clearContext = createMockContext('/clear', users.alice, privateChat);
      await bot.handleMessage(clearContext);

      expect(clearContext.send).toHaveBeenCalledWith('No entries to clear.');
    });
  });
});