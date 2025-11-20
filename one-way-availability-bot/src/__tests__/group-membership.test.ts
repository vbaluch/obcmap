import { AvailabilityBot } from '../availability-bot';
import { createMockContextWithMembership, createMockUsers } from '../utils/test-helpers';

describe('Group Membership Verification', () => {
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

  describe('Allowed Member Statuses', () => {
    it('should allow regular members', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContextWithMembership('/add 1115 ber ist', users.alice, privateChat, 'member');

      await bot.handleMessage(context);

      // Should process the command normally
      expect(context.send).toHaveBeenCalledWith(expect.stringContaining('Your entries:'));
      expect(bot.getStorage().getAllEntries()).toHaveLength(1);
    });

    it('should allow administrators', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContextWithMembership('/add 1115 ber ist', users.alice, privateChat, 'administrator');

      await bot.handleMessage(context);

      // Should process the command normally
      expect(context.send).toHaveBeenCalledWith(expect.stringContaining('Your entries:'));
      expect(bot.getStorage().getAllEntries()).toHaveLength(1);
    });

    it('should allow group creators/owners', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContextWithMembership('/add 1115 ber ist', users.alice, privateChat, 'creator');

      await bot.handleMessage(context);

      // Should process the command normally
      expect(context.send).toHaveBeenCalledWith(expect.stringContaining('Your entries:'));
      expect(bot.getStorage().getAllEntries()).toHaveLength(1);
    });
  });

  describe('Blocked Member Statuses', () => {
    it('should block users who left the group', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContextWithMembership('/add 1115 ber ist', users.alice, privateChat, 'left');

      await bot.handleMessage(context);

      // Should reject with membership error
      expect(context.send).toHaveBeenCalledWith('Sorry, you must be a member of the OBC group to use this bot.');
      expect(bot.getStorage().getAllEntries()).toHaveLength(0);
    });

    it('should block kicked users', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContextWithMembership('/add 1115 ber ist', users.alice, privateChat, 'kicked');

      await bot.handleMessage(context);

      // Should reject with membership error
      expect(context.send).toHaveBeenCalledWith('Sorry, you must be a member of the OBC group to use this bot.');
      expect(bot.getStorage().getAllEntries()).toHaveLength(0);
    });

    it('should block restricted users', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContextWithMembership('/add 1115 ber ist', users.alice, privateChat, 'restricted');

      await bot.handleMessage(context);

      // Should reject with membership error
      expect(context.send).toHaveBeenCalledWith('Sorry, you must be a member of the OBC group to use this bot.');
      expect(bot.getStorage().getAllEntries()).toHaveLength(0);
    });
  });

  describe('API Failure Handling', () => {
    it('should fail closed when API call fails', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContextWithMembership('/add 1115 ber ist', users.alice, privateChat, 'member');
      
      // Mock API failure
      context.bot.api.getChatMember.mockRejectedValue(new Error('API Error'));

      await bot.handleMessage(context);

      // Should reject due to API failure (fail closed)
      expect(context.send).toHaveBeenCalledWith('Sorry, you must be a member of the OBC group to use this bot.');
      expect(bot.getStorage().getAllEntries()).toHaveLength(0);
    });
  });

  describe('Membership Caching', () => {
    it('should cache positive membership results', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      
      // First call
      const context1 = createMockContextWithMembership('/add 1115 ber ist', users.alice, privateChat, 'member');
      await bot.handleMessage(context1);
      
      // Second call with same user
      const context2 = createMockContextWithMembership('/add 1116 fra muc', users.alice, privateChat, 'member');
      await bot.handleMessage(context2);

      // API should only be called once (first call cached)
      expect(context1.bot.api.getChatMember).toHaveBeenCalledTimes(1);
      expect(context2.bot.api.getChatMember).not.toHaveBeenCalled();
      
      // Both commands should succeed
      expect(bot.getStorage().getAllEntries()).toHaveLength(2);
    });

    it('should cache negative membership results', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      
      // First call with blocked user
      const context1 = createMockContextWithMembership('/add 1115 ber ist', users.alice, privateChat, 'left');
      await bot.handleMessage(context1);
      
      // Second call with same user
      const context2 = createMockContextWithMembership('/add 1116 fra muc', users.alice, privateChat, 'left');
      await bot.handleMessage(context2);

      // API should only be called once (first call cached)
      expect(context1.bot.api.getChatMember).toHaveBeenCalledTimes(1);
      expect(context2.bot.api.getChatMember).not.toHaveBeenCalled();
      
      // Both commands should be rejected
      expect(context1.send).toHaveBeenCalledWith('Sorry, you must be a member of the OBC group to use this bot.');
      expect(context2.send).toHaveBeenCalledWith('Sorry, you must be a member of the OBC group to use this bot.');
      expect(bot.getStorage().getAllEntries()).toHaveLength(0);
    });
  });

  describe('Command Types Coverage', () => {
    it('should verify membership for /list command', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContextWithMembership('/list', users.alice, privateChat, 'left');

      await bot.handleMessage(context);

      expect(context.send).toHaveBeenCalledWith('Sorry, you must be a member of the OBC group to use this bot.');
    });

    it('should verify membership for /clear command', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContextWithMembership('/clear', users.alice, privateChat, 'kicked');

      await bot.handleMessage(context);

      expect(context.send).toHaveBeenCalledWith('Sorry, you must be a member of the OBC group to use this bot.');
    });

    it('should verify membership for /remove command', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContextWithMembership('/remove 1115', users.alice, privateChat, 'restricted');

      await bot.handleMessage(context);

      expect(context.send).toHaveBeenCalledWith('Sorry, you must be a member of the OBC group to use this bot.');
    });
  });
});