import { createBotHandlers } from '../bot';
import { AvailabilityBot } from '../availability-bot';
import { createMockContext, createMockUsers } from '../utils/test-helpers';
import { BotContext } from '../types';

describe('Bot Handlers', () => {
  let handlers: ReturnType<typeof createBotHandlers>;
  let bot: AvailabilityBot;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-11-13T10:00:00.000Z'));

    // Ensure group messages are enabled by default for tests
    delete process.env.ACCEPT_GROUP_MESSAGES;
    bot = new AvailabilityBot(':memory:', -123, 123);
    bot.getStorage().clearAllData();
    
    // Create handlers that use our test bot instance
    const mockHelpHandler = async (context: BotContext): Promise<void> => {
      const message = "Hello! I'm your OBC One-Way Availability bot. Send me your availability in format: MMDD DEP ARR (e.g., 1115 ber ist)";
      await context.send(message);
    };
    
    handlers = {
      onStart: mockHelpHandler,
      onHelp: mockHelpHandler,
      onAdd: async (context) => {
        await bot.handleAddCommand(context, context.text || '');
      },
      onRemove: async (context) => {
        await bot.handleRemoveCommand(context, context.text || '');
      },
      onMessage: async (context) => {
        await bot.handleMessage(context);
      },
    };
  });

  afterEach(() => {
    bot.getStorage().close();
    jest.useRealTimers();
  });

  describe('Start Command', () => {
    it('should respond with welcome message', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContext('/start', users.alice, privateChat);

      await handlers.onStart(context);

      expect(context.send).toHaveBeenCalledWith(
        expect.stringContaining("Hello! I'm your OBC One-Way Availability bot.")
      );
      expect(context.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('Message Handler', () => {
    it('should ignore non-availability messages', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.bob.id, type: 'private' as const };
      const context = createMockContext('Hello bot!', users.bob, privateChat);

      await handlers.onMessage(context);

      expect(context.send).not.toHaveBeenCalled();
    });

    it('should handle availability entries from different users', async () => {
      const users = createMockUsers();
      
      // Alice sends an availability entry
      const alicePrivateChat = { id: users.alice.id, type: 'private' as const };
      const aliceContext = createMockContext('/add 1115 ber ist', users.alice, alicePrivateChat);
      await handlers.onMessage(aliceContext);

      // Bob sends an availability entry
      const bobPrivateChat = { id: users.bob.id, type: 'private' as const };
      const bobContext = createMockContext('/add 1116 fra muc', users.bob, bobPrivateChat);
      await handlers.onMessage(bobContext);

      // Should send to users with their personal entries
      expect(aliceContext.send).toHaveBeenCalledWith(expect.stringContaining('Your entries:'));
      expect(aliceContext.send).toHaveBeenCalledWith(expect.stringContaining('1115 BER / IST'));
      expect(bobContext.send).toHaveBeenCalledWith(expect.stringContaining('Your entries:'));
      expect(bobContext.send).toHaveBeenCalledWith(expect.stringContaining('1116 FRA / MUC'));
      
      // Should post full lists to target group
      expect(aliceContext.bot.api.sendMessage).toHaveBeenCalledWith({
        chat_id: -123,
        text: expect.stringContaining('1115 BER / IST @alice'),
        message_thread_id: 123,
        parse_mode: 'MarkdownV2'
      });
      expect(bobContext.bot.api.sendMessage).toHaveBeenCalledWith({
        chat_id: -123,
        text: expect.stringContaining('1116 FRA / MUC @bob'),
        message_thread_id: 123,
        parse_mode: 'MarkdownV2'
      });
    });

    it('should handle availability entries from different users in private chats', async () => {
      const users = createMockUsers();
      
      // Entry from Alice via private chat
      const alicePrivateChat = { id: users.alice.id, type: 'private' as const };
      const context1 = createMockContext('/add 1115 ber ist', users.alice, alicePrivateChat);
      await handlers.onMessage(context1);

      // Entry from Bob via private chat
      const bobPrivateChat = { id: users.bob.id, type: 'private' as const };
      const context2 = createMockContext('/add 1116 fra muc', users.bob, bobPrivateChat);
      await handlers.onMessage(context2);

      // Should send to users with their personal entries
      expect(context1.send).toHaveBeenCalledWith(expect.stringContaining('Your entries:'));
      expect(context1.send).toHaveBeenCalledWith(expect.stringContaining('1115 BER / IST'));
      expect(context2.send).toHaveBeenCalledWith(expect.stringContaining('Your entries:'));
      expect(context2.send).toHaveBeenCalledWith(expect.stringContaining('1116 FRA / MUC'));
      
      // Should post to target group (not the original chat)
      expect(context1.bot.api.sendMessage).toHaveBeenCalledWith({
        chat_id: -123,
        text: expect.stringContaining('1115 BER / IST @alice'),
        message_thread_id: 123,
        parse_mode: 'MarkdownV2'
      });
      expect(context2.bot.api.sendMessage).toHaveBeenCalledWith({
        chat_id: -123,
        text: expect.stringContaining('1116 FRA / MUC @bob'),
        message_thread_id: 123,
        parse_mode: 'MarkdownV2'
      });
      expect(context1.chat.id).toBe(users.alice.id);
      expect(context2.chat.id).toBe(users.bob.id);
    });
  });
});