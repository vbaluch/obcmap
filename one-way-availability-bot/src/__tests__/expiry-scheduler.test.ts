// Mock logger before imports
const mockLoggerFns = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../logger', () => ({
  createLogger: jest.fn(() => mockLoggerFns),
}));

import { ExpiryScheduler } from '../expiry-scheduler';
import { AvailabilityStorage } from '../storage';
import { airportTimezoneService } from '../airport-timezone';
import { createMockUsers } from '../utils/test-helpers';

describe('ExpiryScheduler', () => {
  let storage: AvailabilityStorage;
  let scheduler: ExpiryScheduler;

  beforeEach(() => {
    storage = new AvailabilityStorage(':memory:');
    scheduler = new ExpiryScheduler(storage, airportTimezoneService, 0.01); // 0.01 minutes = 600ms for testing
    jest.clearAllMocks();
  });

  afterEach(() => {
    scheduler.stop();
    storage.close();
  });

  it('should initialize with correct settings', () => {
    expect(scheduler.isRunning()).toBe(false);
    expect(scheduler.getIntervalMs()).toBe(600); // 0.01 minutes = 600ms
  });

  it('should start and stop the scheduler', () => {
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);

    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  it('should not start twice', () => {
    scheduler.start();
    jest.clearAllMocks(); // Clear the info log from first start

    scheduler.start(); // Try to start again
    expect(mockLoggerFns.warn).toHaveBeenCalledWith('ExpiryScheduler is already running');

    scheduler.stop();
  });

  it('should run cleanup manually', () => {
    const users = createMockUsers();

    // Add some test entries
    storage.addEntry({
      userId: users.alice.id,
      username: users.alice.username,
      date: '2025-11-15',
      departure: 'BER',
      arrival: 'IST',
      originalText: '/add 1115 ber ist',
      expiryTimestamp: Date.now() + 86400000
    });

    expect(storage.getAllEntries()).toHaveLength(1);

    scheduler.runCleanup();

    // Should have logged cleanup activity (no expired entries in this case)
    expect(mockLoggerFns.debug).toHaveBeenCalledWith('Expiry cleanup: no expired entries found');
  });

  it('should handle errors during cleanup gracefully', () => {
    // Mock storage to throw an error
    jest.spyOn(storage, 'cleanupExpiredEntries').mockImplementation(() => {
      throw new Error('Database error');
    });

    scheduler.runCleanup();

    expect(mockLoggerFns.error).toHaveBeenCalledWith(
      { error: expect.any(Error) },
      'Error during expiry cleanup'
    );
  });

  it('should run cleanup periodically when started', (done) => {
    const users = createMockUsers();
    
    // Add an entry
    storage.addEntry({
      userId: users.alice.id,
      username: users.alice.username,
      date: '2025-11-15',
      departure: 'BER',
      arrival: 'IST',
      originalText: '/add 1115 ber ist',
      expiryTimestamp: Date.now() + 86400000
    });

    let cleanupCount = 0;
    const originalRunCleanup = scheduler.runCleanup.bind(scheduler);
    
    // Spy on runCleanup to count calls
    jest.spyOn(scheduler, 'runCleanup').mockImplementation(() => {
      cleanupCount++;
      originalRunCleanup();
      
      if (cleanupCount >= 2) {
        scheduler.stop();
        done();
      }
    });

    scheduler.start();
  }, 2000); // 2 second timeout
});