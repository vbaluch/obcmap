import { AvailabilityBot } from '../availability-bot';
import { createMockContext, createMockUsers } from '../utils/test-helpers';

describe('Bot Date Validation Integration', () => {
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

  function getDateString(daysFromNow: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}${day}`;
  }

  it('should accept valid dates within 7 days', async () => {
    const users = createMockUsers();
    const privateChat = { id: users.alice.id, type: 'private' as const };
    const validDate = getDateString(3); // 3 days from now
    
    const context = createMockContext(`/add ${validDate} ber ist`, users.alice, privateChat);
    await bot.handleMessage(context);
    
    // Should succeed
    expect(context.send).toHaveBeenCalledWith(expect.stringContaining('Your entries:'));
    expect(context.send).toHaveBeenCalledWith(expect.stringContaining(`${validDate} BER / IST`));
  });

  it('should reject dates beyond 8 days with helpful error', async () => {
    const users = createMockUsers();
    const privateChat = { id: users.alice.id, type: 'private' as const };
    const invalidDate = getDateString(10); // 10 days from now
    
    const context = createMockContext(`/add ${invalidDate} ber ist`, users.alice, privateChat);
    await bot.handleMessage(context);
    
    // Should show specific date limit error message (still says 7 days for users)
    expect(context.send).toHaveBeenCalledWith(expect.stringMatching(/Date too far in advance.*only allowed up to 7 days/));
  });

  it('should accept near-future dates within range', async () => {
    const users = createMockUsers();
    const privateChat = { id: users.alice.id, type: 'private' as const };
    const tomorrowDate = getDateString(1); // Tomorrow
    
    const context = createMockContext(`/add ${tomorrowDate} ber ist`, users.alice, privateChat);
    await bot.handleMessage(context);
    
    // Should succeed for valid future dates
    expect(context.send).toHaveBeenCalledWith(expect.stringContaining('Your entries:'));
    expect(context.send).toHaveBeenCalledWith(expect.stringContaining(`${tomorrowDate} BER / IST`));
  });

  it('should reject invalid format with format error', async () => {
    const users = createMockUsers();
    const privateChat = { id: users.alice.id, type: 'private' as const };
    
    const context = createMockContext('/add invalid format', users.alice, privateChat);
    await bot.handleMessage(context);
    
    // Should show format error message
    expect(context.send).toHaveBeenCalledWith(expect.stringMatching(/Invalid format.*Use format: MMDD DEP ARR/));
  });

});