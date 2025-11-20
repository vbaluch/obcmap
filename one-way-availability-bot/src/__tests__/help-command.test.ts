import { createBotHandlers } from '../bot';
import { createMockContext, createMockUsers } from '../utils/test-helpers';

describe('Help Command', () => {
  let handlers: ReturnType<typeof createBotHandlers>;

  beforeEach(() => {
    handlers = createBotHandlers(-123, 123);
  });

  describe('/help and /start Commands', () => {
    it('should respond to /start command with help text', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContext('/start', users.alice, privateChat);

      await handlers.onStart(context);

      expect(context.send).toHaveBeenCalledWith(
        expect.stringContaining("Hello\\! I'm your OBC One\\-Way Availability Bot"),
        { parse_mode: 'MarkdownV2' }
      );
      expect(context.send).toHaveBeenCalledWith(
        expect.stringContaining('📋 *Commands Reference:*'),
        { parse_mode: 'MarkdownV2' }
      );
      expect(context.send).toHaveBeenCalledTimes(1);
    });

    it('should respond to /help command with the same help text', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const helpContext = createMockContext('/help', users.alice, privateChat);

      await handlers.onHelp(helpContext);

      expect(helpContext.send).toHaveBeenCalledWith(
        expect.stringContaining("Hello\\! I'm your OBC One\\-Way Availability Bot"),
        { parse_mode: 'MarkdownV2' }
      );
      expect(helpContext.send).toHaveBeenCalledWith(
        expect.stringContaining('📋 *Commands Reference:*'),
        { parse_mode: 'MarkdownV2' }
      );
      expect(helpContext.send).toHaveBeenCalledTimes(1);
    });

    it('should send identical messages for /start and /help', async () => {
      const users = createMockUsers();
      
      const aliceChat = { id: users.alice.id, type: 'private' as const };
      const bobChat = { id: users.bob.id, type: 'private' as const };
      const startContext = createMockContext('/start', users.alice, aliceChat);
      const helpContext = createMockContext('/help', users.bob, bobChat);

      await handlers.onStart(startContext);
      await handlers.onHelp(helpContext);

      // Both should have been called with the exact same parameters
      expect(startContext.send).toHaveBeenCalledWith(
        helpContext.send.mock.calls[0]?.[0],
        helpContext.send.mock.calls[0]?.[1]
      );
    });

    it('should include all command information in help text', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContext('/help', users.alice, privateChat);

      await handlers.onHelp(context);

      const helpText = context.send.mock.calls[0]?.[0];
      
      // Should mention all commands
      expect(helpText).toContain('/remove');
      expect(helpText).toContain('/clear');
      expect(helpText).toContain('/list');
      expect(helpText).toContain('/help');
      expect(helpText).toContain('/start');
      
      // Should have examples with dynamic dates
      expect(helpText).toContain('*Message Examples:*');
      expect(helpText).toMatch(/\/add \d{4} FRA BER/); // Dynamic date pattern
      expect(helpText).toMatch(/\/remove \d{4} FRA BER/); // Dynamic date pattern
      
      // Should have airport data credit in the expiry text
      expect(helpText).toContain('airports provided by');
      expect(helpText).toContain('OurAirports');
      expect(helpText).toContain('expire automatically at midnight local time');
      
      // Should explain functionality
      expect(helpText).toContain('*How it works:*');
      expect(helpText).toContain('username');
    });

    it('should work in private chat contexts', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };

      const context = createMockContext('/help', users.alice, privateChat);
      await handlers.onHelp(context);

      // Should send help message in private chats
      expect(context.send).toHaveBeenCalledTimes(1);
      expect(context.send).toHaveBeenCalledWith(
        expect.stringContaining("Hello\\! I'm your OBC One\\-Way Availability Bot"),
        { parse_mode: 'MarkdownV2' }
      );
    });
  });

  describe('DRY Implementation', () => {
    it('should use the same function for both /start and /help', () => {
      // This tests that we're actually using DRY principles
      expect(handlers.onStart).toBe(handlers.onHelp);
    });
  });

  describe('Admin Help Message', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-11-13T10:00:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should send admin help message to administrators', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContext('/help', users.alice, privateChat);

      // Mock alice as administrator
      context.bot.api.getChatMember.mockResolvedValue({ status: 'administrator' });

      await handlers.onHelp(context);

      // Should send both regular help and admin help
      expect(context.send).toHaveBeenCalledTimes(2);

      // First call: regular help
      expect(context.send).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("Hello\\! I'm your OBC One\\-Way Availability Bot"),
        { parse_mode: 'MarkdownV2' }
      );

      // Second call: admin help
      expect(context.send).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('🔧 *Admin Commands:*'),
        { parse_mode: 'MarkdownV2' }
      );

      // Admin help should contain import command documentation
      const adminHelpText = context.send.mock.calls[1]?.[0];
      expect(adminHelpText).toContain('/import');
      expect(adminHelpText).toContain('MMDD DEP / ARR @username');
      expect(adminHelpText).toContain('1122 HOT / DOG @Alice');
      expect(adminHelpText).toContain('1123 HEL / YES @Bob');
    });

    it('should send admin help to creators', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContext('/help', users.alice, privateChat);

      // Mock alice as creator
      context.bot.api.getChatMember.mockResolvedValue({ status: 'creator' });

      await handlers.onHelp(context);

      // Should send both regular help and admin help
      expect(context.send).toHaveBeenCalledTimes(2);
      expect(context.send).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('🔧 *Admin Commands:*'),
        { parse_mode: 'MarkdownV2' }
      );
    });

    it('should not send admin help to regular members', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContext('/help', users.alice, privateChat);

      // Mock alice as regular member
      context.bot.api.getChatMember.mockResolvedValue({ status: 'member' });

      await handlers.onHelp(context);

      // Should only send regular help (1 message)
      expect(context.send).toHaveBeenCalledTimes(1);
      expect(context.send).toHaveBeenCalledWith(
        expect.stringContaining("Hello\\! I'm your OBC One\\-Way Availability Bot"),
        { parse_mode: 'MarkdownV2' }
      );
    });

    it('should handle getChatMember errors gracefully', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContext('/help', users.alice, privateChat);

      // Mock getChatMember to throw error (e.g., network issue)
      context.bot.api.getChatMember.mockRejectedValue(new Error('Network error'));

      await handlers.onHelp(context);

      // Should still send regular help (and not crash)
      expect(context.send).toHaveBeenCalledTimes(1);
      expect(context.send).toHaveBeenCalledWith(
        expect.stringContaining("Hello\\! I'm your OBC One\\-Way Availability Bot"),
        { parse_mode: 'MarkdownV2' }
      );
    });
  });
});