import { AvailabilityStorage } from './storage';
import { AirportTimezoneService } from './airport-timezone';
import { createLogger } from './logger';
import { entriesExpiredTotal, errorsTotal } from './metrics';

const logger = createLogger('expiry-scheduler');

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
      logger.warn('ExpiryScheduler is already running');
      return;
    }

    logger.info({ intervalMinutes: this.intervalMs / 60000 }, 'Starting expiry scheduler');

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
      logger.info('ExpiryScheduler stopped');
    }
  }

  /**
   * Run the cleanup process manually
   */
  runCleanup(): void {
    try {
      const removedCount = this.storage.cleanupExpiredEntries();

      if (removedCount > 0) {
        entriesExpiredTotal.inc(removedCount);
        logger.info({ removedCount }, 'Expiry cleanup: removed expired entries');

        // Call the callback to notify that entries were expired
        if (this.onEntriesExpired) {
          Promise.resolve(this.onEntriesExpired()).catch((error) => {
            errorsTotal.inc({ type: 'expiry_callback_error' });
            logger.error({ error }, 'Error in onEntriesExpired callback');
          });
        }
      } else {
        logger.debug('Expiry cleanup: no expired entries found');
      }
    } catch (error) {
      errorsTotal.inc({ type: 'expiry_cleanup_error' });
      logger.error({ error }, 'Error during expiry cleanup');
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