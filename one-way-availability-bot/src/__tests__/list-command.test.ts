import { OneWayAvailabilityBot } from '../one-way-availability-bot';
import { createMockContext, createMockUsers, createMockGroupChat } from '../utils/test-helpers';

describe('List Command', () => {
  let bot: OneWayAvailabilityBot;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-11-13T10:00:00.000Z'));

    // Ensure group messages are enabled by default for tests
    delete process.env.ACCEPT_GROUP_MESSAGES;
    bot = new OneWayAvailabilityBot(':memory:', -123, 123);
    bot.getStorage().clearAllData();
  });

  afterEach(() => {
    bot.getStorage().close();
    jest.useRealTimers();
  });

  describe('/list Command', () => {
    it('should list user entries', async () => {
      const users = createMockUsers();
      const privateChat = { id: 1, type: 'private' as const };

      // Add some entries first
      const addContext1 = createMockContext('/add 1115 ber ist', users.alice, privateChat);
      await bot.handleMessage(addContext1);
      
      const addContext2 = createMockContext('/add 1116 fra muc', users.alice, privateChat);
      await bot.handleMessage(addContext2);

      // Now use /list command
      const listContext = createMockContext('/list', users.alice, privateChat);
      await bot.handleMessage(listContext);

      expect(listContext.send).toHaveBeenCalledWith(expect.stringContaining('Your entries:'));
      expect(listContext.send).toHaveBeenCalledWith(expect.stringContaining('1115 BER / IST'));
      expect(listContext.send).toHaveBeenCalledWith(expect.stringContaining('1116 FRA / MUC'));
    });

    it('should show "none" when user has no entries', async () => {
      const users = createMockUsers();
      const privateChat = { id: 1, type: 'private' as const };

      const listContext = createMockContext('/list', users.alice, privateChat);
      await bot.handleMessage(listContext);

      expect(listContext.send).toHaveBeenCalledWith('Your entries: none');
    });

    it('should show sorted entries', async () => {
      const users = createMockUsers();
      const privateChat = { id: 1, type: 'private' as const };

      // Add entries in random order
      const addContext1 = createMockContext('/add 1117 ham cdg', users.alice, privateChat);
      await bot.handleMessage(addContext1);

      const addContext2 = createMockContext('/add 1115 ber ist', users.alice, privateChat);
      await bot.handleMessage(addContext2);

      const addContext3 = createMockContext('/add 1116 fra muc', users.alice, privateChat);
      await bot.handleMessage(addContext3);

      // List should be sorted
      const listContext = createMockContext('/list', users.alice, privateChat);
      await bot.handleMessage(listContext);

      expect(listContext.send).toHaveBeenCalledWith(
        'Your entries:\n1115 BER / IST\n1116 FRA / MUC\n1117 HAM / CDG'
      );
    });
  });

    it('should ignore group chat commands', async () => {
      const users = createMockUsers();
      const groupChat = createMockGroupChat('OBC Group');

      // Try to use /list in group chat - should be ignored
      const listContext = createMockContext('/list', users.alice, groupChat);
      await bot.handleMessage(listContext);

      // Should silently ignore group commands
      expect(listContext.send).not.toHaveBeenCalled();
    });

    it('should only show requesting user entries (private chat)', async () => {
      const users = createMockUsers();
      const aliceChat = { id: users.alice.id, type: 'private' as const };
      const bobChat = { id: users.bob.id, type: 'private' as const };

      // Alice adds an entry
      const aliceAddContext = createMockContext('/add 1115 ber ist', users.alice, aliceChat);
      await bot.handleMessage(aliceAddContext);

      // Bob adds an entry
      const bobAddContext = createMockContext('/add 1116 fra muc', users.bob, bobChat);
      await bot.handleMessage(bobAddContext);

      // Alice uses /list
      const aliceListContext = createMockContext('/list', users.alice, aliceChat);
      await bot.handleMessage(aliceListContext);

      // Should only show Alice's entries
      expect(aliceListContext.send).toHaveBeenCalledWith('Your entries:\n1115 BER / IST');
    });

  describe('DRY Functionality', () => {
    it('should use same output format as add/remove operations', async () => {
      const users = createMockUsers();
      const privateChat = { id: 1, type: 'private' as const };

      // Add an entry and capture the format
      const addContext = createMockContext('/add 1115 ber ist', users.alice, privateChat);
      await bot.handleMessage(addContext);

      // Get the user reply from the add operation
      const addCall = addContext.send.mock.calls.find(call => 
        call[0].includes('Your entries:')
      );
      expect(addCall).toBeDefined();
      const addReply = addCall![0];

      // Now use /list and compare
      const listContext = createMockContext('/list', users.alice, privateChat);
      await bot.handleMessage(listContext);

      expect(listContext.send).toHaveBeenCalledWith(addReply);
    });
  });
});