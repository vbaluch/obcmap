import { AvailabilityBot } from '../availability-bot';
import { createMockContext, createMockUsers } from '../utils/test-helpers';

describe('Import Command', () => {
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

  describe('Admin Check', () => {
    it('should reject import command from non-admin users', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContext('/import\n1115 BER / IST @alice', users.alice, privateChat);

      // Mock getChatMember to return regular member status
      context.bot.api.getChatMember.mockResolvedValue({ status: 'member' });

      await bot.handleMessage(context);

      expect(context.send).toHaveBeenCalledWith('This command is only available to group administrators.');
      expect(bot.getStorage().getAllEntries()).toHaveLength(0);
    });

    it('should allow import command from administrators', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContext('/import\n1115 BER / IST @alice', users.alice, privateChat);

      // Mock getChatMember to return administrator status
      context.bot.api.getChatMember.mockResolvedValue({ status: 'administrator' });

      await bot.handleMessage(context);

      expect(context.send).toHaveBeenCalledWith(expect.stringContaining('Imported 1 entries'));
    });

    it('should allow import command from creators', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContext('/import\n1115 BER / IST @alice', users.alice, privateChat);

      // Mock getChatMember to return creator status
      context.bot.api.getChatMember.mockResolvedValue({ status: 'creator' });

      await bot.handleMessage(context);

      expect(context.send).toHaveBeenCalledWith(expect.stringContaining('Imported 1 entries'));
    });
  });

  describe('Import Parser', () => {
    it('should parse valid import format', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContext('/import\n1115 BER / IST @alice', users.alice, privateChat);
      context.bot.api.getChatMember.mockResolvedValue({ status: 'administrator' });

      await bot.handleMessage(context);

      expect(context.send).toHaveBeenCalledWith('Imported 1 entries.');
      const entries = bot.getStorage().getAllEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]!).toMatchObject({
        userId: null,
        username: 'alice',
        date: '2025-11-15',
        departure: 'BER',
        arrival: 'IST'
      });
    });

    it('should parse multiple entries', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const importText = '/import\n1115 BER / IST @alice\n1116 FRA / MUC @bob\n1117 HAM / CDG @charlie';
      const context = createMockContext(importText, users.alice, privateChat);
      context.bot.api.getChatMember.mockResolvedValue({ status: 'administrator' });

      await bot.handleMessage(context);

      expect(context.send).toHaveBeenCalledWith('Imported 3 entries.');
      expect(bot.getStorage().getAllEntries()).toHaveLength(3);
    });

    it('should preserve original case for usernames', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContext('/import\n1115 BER / IST @AliceCapitalized', users.alice, privateChat);
      context.bot.api.getChatMember.mockResolvedValue({ status: 'administrator' });

      await bot.handleMessage(context);

      const entries = bot.getStorage().getAllEntries();
      expect(entries[0]!.username).toBe('AliceCapitalized');
    });

    it('should report failed entries with invalid format', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const importText = '/import\n1115 BER / IST @alice\ninvalid line\n1116 FRA / MUC @bob';
      const context = createMockContext(importText, users.alice, privateChat);
      context.bot.api.getChatMember.mockResolvedValue({ status: 'administrator' });

      await bot.handleMessage(context);

      expect(context.send).toHaveBeenCalledWith(expect.stringContaining('Imported 2 entries'));
      expect(context.send).toHaveBeenCalledWith(expect.stringContaining('Failed to import 1 entries'));
      expect(context.send).toHaveBeenCalledWith(expect.stringContaining('invalid line'));
    });

    it('should reject invalid date formats', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContext('/import\n1332 BER / IST @alice', users.alice, privateChat);
      context.bot.api.getChatMember.mockResolvedValue({ status: 'administrator' });

      await bot.handleMessage(context);

      expect(context.send).toHaveBeenCalledWith(expect.stringContaining('Failed to import 1 entries'));
      expect(context.send).toHaveBeenCalledWith(expect.stringContaining('1332 BER / IST @alice'));
    });

    it('should show usage when no import text provided', async () => {
      const users = createMockUsers();
      const privateChat = { id: users.alice.id, type: 'private' as const };
      const context = createMockContext('/import', users.alice, privateChat);
      context.bot.api.getChatMember.mockResolvedValue({ status: 'administrator' });

      await bot.handleMessage(context);

      expect(context.send).toHaveBeenCalledWith(expect.stringContaining('Usage: /import'));
    });
  });

  describe('Username Matching', () => {
    it('should match imported entries to user on first interaction', async () => {
      const users = createMockUsers();
      const adminChat = { id: 999, type: 'private' as const };
      const aliceChat = { id: users.alice.id, type: 'private' as const };

      // Admin imports entry for alice
      const importContext = createMockContext('/import\n1115 BER / IST @alice', { id: 999, username: 'admin' }, adminChat);
      importContext.bot.api.getChatMember.mockResolvedValue({ status: 'administrator' });
      await bot.handleMessage(importContext);

      // Verify entry has null user_id
      let entries = bot.getStorage().getAllEntries();
      expect(entries[0]!.userId).toBeNull();

      // Alice sends a command
      const aliceContext = createMockContext('/list', users.alice, aliceChat);
      await bot.handleMessage(aliceContext);

      // Verify entry is now matched to alice
      entries = bot.getStorage().getAllEntries();
      expect(entries[0]!.userId).toBe(users.alice.id);
    });

    it('should match multiple entries for same username', async () => {
      const users = createMockUsers();
      const adminChat = { id: 999, type: 'private' as const };
      const aliceChat = { id: users.alice.id, type: 'private' as const };

      // Admin imports multiple entries for alice
      const importText = '/import\n1115 BER / IST @alice\n1116 FRA / MUC @alice\n1117 HAM / CDG @bob';
      const importContext = createMockContext(importText, { id: 999, username: 'admin' }, adminChat);
      importContext.bot.api.getChatMember.mockResolvedValue({ status: 'administrator' });
      await bot.handleMessage(importContext);

      // Alice sends a command
      const aliceContext = createMockContext('/list', users.alice, aliceChat);
      await bot.handleMessage(aliceContext);

      // Verify alice's entries are matched
      const entries = bot.getStorage().getAllEntries();
      const aliceEntries = entries.filter(e => e.username.toLowerCase() === 'alice');
      expect(aliceEntries).toHaveLength(2);
      expect(aliceEntries.every(e => e.userId === users.alice.id)).toBe(true);

      // Verify bob's entry is still unmatched
      const bobEntry = entries.find(e => e.username === 'bob');
      expect(bobEntry?.userId).toBeNull();
    });

    it('should match case-insensitively', async () => {
      const users = createMockUsers();
      const adminChat = { id: 999, type: 'private' as const };
      const aliceChat = { id: users.alice.id, type: 'private' as const };

      // Admin imports with different case
      const importContext = createMockContext('/import\n1115 BER / IST @ALICE', { id: 999, username: 'admin' }, adminChat);
      importContext.bot.api.getChatMember.mockResolvedValue({ status: 'administrator' });
      await bot.handleMessage(importContext);

      // Alice (lowercase) sends a command
      const aliceContext = createMockContext('/list', users.alice, aliceChat);
      await bot.handleMessage(aliceContext);

      // Verify entry is matched despite case difference
      const entries = bot.getStorage().getAllEntries();
      expect(entries[0]!.userId).toBe(users.alice.id);
      expect(entries[0]!.username).toBe('ALICE'); // Original case preserved
    });
  });

  describe('User Operations with Imported Entries', () => {
    it('should allow users to remove their matched imported entries', async () => {
      const users = createMockUsers();
      const adminChat = { id: 999, type: 'private' as const };
      const aliceChat = { id: users.alice.id, type: 'private' as const };

      // Admin imports entry for alice
      const importContext = createMockContext('/import\n1115 BER / IST @alice', { id: 999, username: 'admin' }, adminChat);
      importContext.bot.api.getChatMember.mockResolvedValue({ status: 'administrator' });
      await bot.handleMessage(importContext);

      // Alice claims entry by sending a command
      const aliceListContext = createMockContext('/list', users.alice, aliceChat);
      await bot.handleMessage(aliceListContext);

      // Alice removes the entry
      const aliceRemoveContext = createMockContext('/remove 1115 BER IST', users.alice, aliceChat);
      await bot.handleMessage(aliceRemoveContext);

      expect(bot.getStorage().getAllEntries()).toHaveLength(0);
    });

    it('should not count imported entries toward 3-entry limit until matched', async () => {
      const users = createMockUsers();
      const adminChat = { id: 999, type: 'private' as const };
      const aliceChat = { id: users.alice.id, type: 'private' as const };

      // Admin imports 5 entries for alice
      const importText = '/import\n1115 BER / IST @alice\n1116 FRA / MUC @alice\n1117 HAM / CDG @alice\n1118 LHR / AMS @alice\n1119 MAD / BCN @alice';
      const importContext = createMockContext(importText, { id: 999, username: 'admin' }, adminChat);
      importContext.bot.api.getChatMember.mockResolvedValue({ status: 'administrator' });
      await bot.handleMessage(importContext);

      // All 5 entries should be imported (no limit for imports)
      expect(bot.getStorage().getAllEntries()).toHaveLength(5);

      // Alice claims them by sending a command
      const aliceContext = createMockContext('/list', users.alice, aliceChat);
      await bot.handleMessage(aliceContext);

      // Alice now has 5 entries (over the limit, but they were imported)
      const entries = bot.getStorage().getAllEntries();
      expect(entries).toHaveLength(5);
      expect(entries.every(e => e.userId === users.alice.id)).toBe(true);

      // Alice tries to add a 6th entry - should be blocked
      const addContext = createMockContext('/add 1120 BER IST', users.alice, aliceChat);
      await bot.handleMessage(addContext);

      expect(addContext.send).toHaveBeenCalledWith(expect.stringContaining('Maximum 3 entries'));
    });
  });

  describe('Integration with Group Posting', () => {
    it('should post imported entries to group', async () => {
      const adminChat = { id: 999, type: 'private' as const };
      const importContext = createMockContext('/import\n1115 BER / IST @alice', { id: 999, username: 'admin' }, adminChat);
      importContext.bot.api.getChatMember.mockResolvedValue({ status: 'administrator' });

      await bot.handleMessage(importContext);

      // Should post to group
      expect(importContext.bot.api.sendMessage).toHaveBeenCalledWith({
        chat_id: -123,
        text: expect.stringContaining('1115 BER / IST @alice'),
        message_thread_id: 123,
        parse_mode: 'MarkdownV2'
      });
    });
  });
});
