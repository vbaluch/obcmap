import { AvailabilityBot } from '../availability-bot';
import { createMockContext, createMockPrivateChat } from '../utils/test-helpers';

describe('Username Validation', () => {
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

  describe('Users without usernames', () => {
    it('should reject entries from users without usernames', async () => {
      const privateChat = createMockPrivateChat();
      
      // User without username (only has firstName)
      const userWithoutUsername = { 
        id: 1, 
        firstName: 'John',
        username: undefined // No username
      };

      const context = createMockContext('/add 1115 ber ist', userWithoutUsername, privateChat);
      await bot.handleMessage(context);

      // Should reject with error message
      expect(context.send).toHaveBeenCalledWith('Sorry, you need a Telegram username (@username) to use this bot. Please set one in your Telegram settings and try again.');
      expect(context.send).toHaveBeenCalledTimes(1);
      
      // No entries should be added
      const entries = bot.getStorage().getAllEntries();
      expect(entries).toHaveLength(0);
    });

    it('should reject /start command from users without usernames', async () => {
      const privateChat = createMockPrivateChat();
      
      const userWithoutUsername = { 
        id: 1, 
        firstName: 'John',
        username: undefined
      };

      const context = createMockContext('/start', userWithoutUsername, privateChat);
      await bot.handleMessage(context);

      expect(context.send).toHaveBeenCalledWith('Sorry, you need a Telegram username (@username) to use this bot. Please set one in your Telegram settings and try again.');
    });

    it('should reject /remove command from users without usernames', async () => {
      const privateChat = createMockPrivateChat();
      
      const userWithoutUsername = { 
        id: 1, 
        firstName: 'John',
        username: undefined
      };

      const context = createMockContext('/remove 1115 BER IST', userWithoutUsername, privateChat);
      await bot.handleMessage(context);

      expect(context.send).toHaveBeenCalledWith('Sorry, you need a Telegram username (@username) to use this bot. Please set one in your Telegram settings and try again.');
    });

    it('should reject /clear command from users without usernames', async () => {
      const privateChat = createMockPrivateChat();
      
      const userWithoutUsername = { 
        id: 1, 
        firstName: 'John',
        username: undefined
      };

      const context = createMockContext('/clear', userWithoutUsername, privateChat);
      await bot.handleMessage(context);

      expect(context.send).toHaveBeenCalledWith('Sorry, you need a Telegram username (@username) to use this bot. Please set one in your Telegram settings and try again.');
    });
  });

  describe('Users with usernames', () => {
    it('should accept entries from users with usernames', async () => {
      const privateChat = createMockPrivateChat();
      
      const userWithUsername = { 
        id: 1, 
        firstName: 'John',
        username: 'john_doe'
      };

      const context = createMockContext('/add 1115 ber ist', userWithUsername, privateChat);
      await bot.handleMessage(context);

      // Should work normally - send user entries + post to group
      expect(context.send).toHaveBeenCalledWith(expect.stringContaining('Your entries:'));
      expect(context.bot.api.sendMessage).toHaveBeenCalledWith({
        chat_id: -123,
        text: expect.stringContaining('*OBC One\\-Way Availability*'),
        message_thread_id: 123,
        parse_mode: 'MarkdownV2'
      });
      
      // Entry should be added
      const entries = bot.getStorage().getAllEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.username).toBe('john_doe');
    });

    it('should handle empty string username as no username', async () => {
      const privateChat = createMockPrivateChat();
      
      const userWithEmptyUsername = { 
        id: 1, 
        firstName: 'John',
        username: '' // Empty string
      };

      const context = createMockContext('/add 1115 ber ist', userWithEmptyUsername, privateChat);
      await bot.handleMessage(context);

      expect(context.send).toHaveBeenCalledWith('Sorry, you need a Telegram username (@username) to use this bot. Please set one in your Telegram settings and try again.');
      
      const entries = bot.getStorage().getAllEntries();
      expect(entries).toHaveLength(0);
    });
  });
});