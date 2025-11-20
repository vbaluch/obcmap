import { AvailabilityBot } from '../availability-bot';
import { createMockContext, createMockUsers } from '../utils/test-helpers';

describe('User Reply and Channel Posting', () => {
  let bot: AvailabilityBot;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-11-13T10:00:00.000Z'));

    // Set ACCEPT_GROUP_MESSAGES to false to match private-only functionality
    process.env.ACCEPT_GROUP_MESSAGES = 'false';
    bot = new AvailabilityBot(':memory:', -123, 123); // Test topic ID
    bot.getStorage().clearAllData();
  });

  afterEach(() => {
    bot.getStorage().close();
    jest.useRealTimers();
  });

  describe('User Reply', () => {
    it('should send message to user with their entries after adding', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      // Add entries for Alice
      const aliceContext1 = createMockContext('/add 1115 ber ist', users.alice, privateChat);
      await bot.handleMessage(aliceContext1);
      
      const aliceContext2 = createMockContext('/add 1116 fra muc', users.alice, privateChat);
      await bot.handleMessage(aliceContext2);

      // Should send message to user and post to target group (check the second context)
      expect(aliceContext2.send).toHaveBeenCalledTimes(1);
      expect(aliceContext2.send).toHaveBeenCalledWith(expect.stringContaining('Your entries:'));
      expect(aliceContext2.send).toHaveBeenCalledWith(expect.stringContaining('1115 BER / IST'));
      expect(aliceContext2.send).toHaveBeenCalledWith(expect.stringContaining('1116 FRA / MUC'));
      
      // Should post to target group via API
      expect(aliceContext2.bot.api.sendMessage).toHaveBeenCalledWith({
        chat_id: -123,
        text: expect.stringContaining('*OBC One\\-Way Availability*'),
        message_thread_id: 123,
        parse_mode: 'MarkdownV2'
      });
    });

    it('should send "none" when user has no entries after clear', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      // Add then clear entries
      const addContext = createMockContext('/add 1115 ber ist', users.alice, privateChat);
      await bot.handleMessage(addContext);

      const clearContext = createMockContext('/clear', users.alice, privateChat);
      await bot.handleMessage(clearContext);

      const sentMessage = clearContext.send.mock.calls[0]?.[0];
      expect(sentMessage).toContain('Cleared entries:');
      expect(sentMessage).toContain('1115 BER / IST');
      expect(sentMessage).toContain('Your entries: none');
    });

    it('should show only user entries, not all entries', async () => {
      const users = createMockUsers();
      const alicePrivateChat = { id: users.alice.id, type: 'private' as const };
      const bobPrivateChat = { id: users.bob.id, type: 'private' as const };

      // Add entries for both users
      const aliceContext = createMockContext('/add 1115 ber ist', users.alice, alicePrivateChat);
      await bot.handleMessage(aliceContext);

      const bobContext = createMockContext('/add 1116 fra muc', users.bob, bobPrivateChat);
      await bot.handleMessage(bobContext);

      // Alice's message should only show her entries
      expect(aliceContext.send).toHaveBeenNthCalledWith(1, 'Your entries:\n1115 BER / IST');
      
      // Bob's message should only show his entries
      expect(bobContext.send).toHaveBeenNthCalledWith(1, 'Your entries:\n1116 FRA / MUC');
    });
  });

  describe('Private Message Only Configuration', () => {
    it('should always accept private messages', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      const context = createMockContext('/add 1115 ber ist', users.alice, privateChat);
      await bot.handleMessage(context);

      expect(context.send).toHaveBeenCalledWith(expect.stringContaining('Your entries:'));
    });
  });

  describe('Remove Command Reply', () => {
    it('should send updated user entries after remove', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      // Add multiple entries
      const addContext1 = createMockContext('/add 1115 ber ist', users.alice, privateChat);
      await bot.handleMessage(addContext1);
      
      const addContext2 = createMockContext('/add 1116 fra muc', users.alice, privateChat);
      await bot.handleMessage(addContext2);
      
      const addContext3 = createMockContext('/add 1117 ham cdg', users.alice, privateChat);
      await bot.handleMessage(addContext3);

      // Remove one entry
      const removeContext = createMockContext('/remove 1116 fra muc', users.alice, privateChat);
      await bot.handleMessage(removeContext);

      // Should send message with remaining entries
      expect(removeContext.send).toHaveBeenCalledWith(expect.stringContaining('Your entries:'));
      expect(removeContext.send).toHaveBeenCalledWith(expect.stringContaining('1115 BER / IST'));
      expect(removeContext.send).toHaveBeenCalledWith(expect.stringContaining('1117 HAM / CDG'));
      expect(removeContext.send).not.toHaveBeenCalledWith(expect.stringContaining('1116 FRA / MUC'));
    });
  });
});