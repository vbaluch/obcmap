import { AvailabilityBot } from '../availability-bot';
import { ExpiryScheduler } from '../expiry-scheduler';
import { airportTimezoneService } from '../airport-timezone';
import { createMockContext, createMockUsers } from '../utils/test-helpers';

describe('Automatic Message Update on Expiry', () => {
  let bot: AvailabilityBot;

  beforeEach(() => {
    jest.useFakeTimers();
    bot = new AvailabilityBot(':memory:', -123, 123);
    bot.getStorage().clearAllData();
  });

  afterEach(() => {
    bot.getStorage().close();
    jest.useRealTimers();
  });

  it('should automatically update Telegram message when scheduler removes expired entries', async () => {
    const users = createMockUsers();
    const privateChat = { id: users.alice.id, type: 'private' as const };

    // Set current time to Nov 15, 2024, 10:00 UTC
    jest.setSystemTime(new Date('2024-11-15T10:00:00.000Z'));

    // Add entry for Nov 15 from Berlin
    const addContext = createMockContext('/add 1115 ber ist', users.alice, privateChat);
    await bot.handleMessage(addContext);

    // Verify entry was added
    let entries = bot.getStorage().getUserEntries(users.alice.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.date).toBe('2024-11-15');

    // Verify initial message was posted to group
    expect(addContext.bot.api.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: -123,
        message_thread_id: 123,
      })
    );

    // Reset the mock to track new calls
    addContext.bot.api.sendMessage.mockClear();

    // Set the bot API so it can post messages without context
    bot.setBotApi(addContext.bot.api);

    // Create a scheduler with a callback that posts updates when entries expire
    const scheduler = new ExpiryScheduler(
      bot.getStorage(),
      airportTimezoneService,
      0.01,
      async () => {
        await bot.postUpdatedListWithoutContext();
      }
    );
    scheduler.start();

    // Move time to after local midnight in Berlin (Nov 15 23:00 UTC = Nov 16 00:00 Berlin)
    jest.setSystemTime(new Date('2024-11-15T23:01:00.000Z'));

    // Advance timers to trigger the scheduler's next cleanup (600ms interval)
    // The scheduler runs cleanup immediately on start, then every 600ms
    // So we need to advance past the next interval
    await jest.advanceTimersByTimeAsync(700);

    // THE KEY ASSERTION:
    // The Telegram message should have been automatically updated when entries expired
    expect(addContext.bot.api.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: -123,
        message_thread_id: 123,
        text: expect.stringContaining('No availability entries yet'),
      })
    );

    // Verify entries were actually cleaned up
    entries = bot.getStorage().getUserEntries(users.alice.id);
    expect(entries).toHaveLength(0);

    scheduler.stop();
  });

});
