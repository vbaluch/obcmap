import { AvailabilityBot } from '../availability-bot';
import { createMockContext, createMockUsers, createMockGroupChat, createMockPrivateChat, expectUserWasSentContaining } from '../utils/test-helpers';

describe('Reply Functionality', () => {
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

  it('should ignore group messages', async () => {
    const users = createMockUsers();
    const groupChat = createMockGroupChat('OBC Group');
    const context = createMockContext('/add 1115 ber ist', users.alice, groupChat);

    await bot.handleMessage(context);

    // Should silently ignore group commands
    expect(context.send).not.toHaveBeenCalled();
    expect(context.reply).not.toHaveBeenCalled();

    // Should not post to group since command was ignored
    expect(context.bot.api.sendMessage).not.toHaveBeenCalled();
  });

  it('should use send for private messages', async () => {
    const users = createMockUsers();
    const privateChat = createMockPrivateChat();
    const context = createMockContext('/add 1115 ber ist', users.alice, privateChat);

    await bot.handleMessage(context);

    // Should send (not reply) to user in private chat
    expect(context.send).toHaveBeenCalledWith(expect.stringContaining('Your entries:'));
    expect(context.reply).not.toHaveBeenCalled();

    // Should also post to group via API
    expect(context.bot.api.sendMessage).toHaveBeenCalledWith({
      chat_id: -123,
      text: expect.stringContaining('1115 BER / IST @alice'),
      message_thread_id: 123,
      parse_mode: 'MarkdownV2'
    });
  });

  it('should use helper function for private messages', async () => {
    const users = createMockUsers();
    const privateChat = createMockPrivateChat();
    const context = createMockContext('/add 1115 ber ist', users.alice, privateChat);

    await bot.handleMessage(context);

    // Using helper function works for private messages
    expectUserWasSentContaining(context, 'Your entries:');
  });
});