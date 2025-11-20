import { AvailabilityStorage } from './storage';
import { AirportTimezoneService } from './airport-timezone';

export class ExpiryScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private storage: AvailabilityStorage;
  private intervalMs: number;
  private onEntriesExpired: (() => void | Promise<void>) | undefined;

  constructor(
    storage: AvailabilityStorage,
    _airportTimezoneService: AirportTimezoneService,
    intervalMinutes: number = 5,
    onEntriesExpired?: () => void | Promise<void>
  ) {
    this.storage = storage;
    this.intervalMs = intervalMinutes * 60 * 1000;
    this.onEntriesExpired = onEntriesExpired ?? undefined;
  }

  /**
   * Start the periodic cleanup job
   */
  start(): void {
    if (this.intervalId) {
      console.warn('ExpiryScheduler is already running');
      return;
    }

    console.log(`Starting expiry scheduler - cleanup every ${this.intervalMs / 60000} minutes`);
    
    // Run cleanup immediately, then on interval
    this.runCleanup();
    
    this.intervalId = setInterval(() => {
      this.runCleanup();
    }, this.intervalMs);
  }

  /**
   * Stop the periodic cleanup job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('ExpiryScheduler stopped');
    }
  }

  /**
   * Run the cleanup process manually
   */
  runCleanup(): void {
    try {
      const removedCount = this.storage.cleanupExpiredEntries();

      if (removedCount > 0) {
        console.log(`Expiry cleanup: removed ${removedCount} expired entry/entries`);

        // Call the callback to notify that entries were expired
        if (this.onEntriesExpired) {
          Promise.resolve(this.onEntriesExpired()).catch((error) => {
            console.error('Error in onEntriesExpired callback:', error);
          });
        }
      } else {
        console.log(`Expiry cleanup: no expired entries found`);
      }
    } catch (error) {
      console.error('Error during expiry cleanup:', error);
    }
  }

  /**
   * Check if the scheduler is currently running
   */
  isRunning(): boolean {
    return this.intervalId !== null;
  }

  /**
   * Get the current interval in milliseconds
   */
  getIntervalMs(): number {
    return this.intervalMs;
  }
}