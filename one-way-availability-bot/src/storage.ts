import { AvailabilityEntry } from './parser';
import { DatabaseWrapper } from './database';
import { entriesActive } from './metrics';

export class AvailabilityStorage {
  private db: DatabaseWrapper;

  constructor(dbPath?: string) {
    this.db = new DatabaseWrapper(dbPath);
  }

  getDatabase(): DatabaseWrapper {
    return this.db;
  }

  private updateEntriesActiveGauge(): void {
    const count = this.db.getAllEntries().length;
    entriesActive.set(count);
  }

  addEntry(entry: AvailabilityEntry): { success: boolean; error?: string } {
    const result = this.db.addEntry(
      entry.userId,
      entry.username,
      entry.date,
      entry.departure,
      entry.arrival,
      entry.originalText,
      entry.expiryTimestamp
    );
    if (result.success) {
      this.updateEntriesActiveGauge();
    }
    return result;
  }

  removeEntry(userId: number, date: string, departure: string, arrival: string): boolean {
    const removed = this.db.removeEntry(userId, date, departure, arrival);
    if (removed) {
      this.updateEntriesActiveGauge();
    }
    return removed;
  }

  clearUserEntries(userId: number): number {
    const count = this.db.clearUserEntries(userId);
    if (count > 0) {
      this.updateEntriesActiveGauge();
    }
    return count;
  }

  /**
   * Remove entries that have expired based on stored expiry timestamp
   * Returns the number of entries soft-deleted
   */
  cleanupExpiredEntries(): number {
    const allEntries = this.db.getAllEntries();
    const now = Date.now();
    let removedCount = 0;

    for (const entry of allEntries) {
      const isExpired = now >= entry.expiry_timestamp;

      if (isExpired && entry.user_id !== null) {
        const removed = this.db.removeEntry(entry.user_id, entry.date, entry.departure, entry.arrival, 'expired');
        if (removed) {
          removedCount++;
        }
      }
    }

    if (removedCount > 0) {
      this.updateEntriesActiveGauge();
    }

    return removedCount;
  }

  getUserEntries(userId: number): AvailabilityEntry[] {
    // Clean up expired entries before returning
    this.cleanupExpiredEntries();
    
    const rows = this.db.getUserEntries(userId);
    return rows.map(row => ({
      userId: row.user_id,
      username: row.username,
      date: row.date,
      departure: row.departure,
      arrival: row.arrival,
      originalText: row.original_text,
      expiryTimestamp: row.expiry_timestamp,
    }));
  }

  getAllEntries(): AvailabilityEntry[] {
    // Clean up expired entries before returning
    this.cleanupExpiredEntries();
    
    const rows = this.db.getAllEntries();
    const entries = rows.map(row => ({
      userId: row.user_id,
      username: row.username,
      date: row.date,
      departure: row.departure,
      arrival: row.arrival,
      originalText: row.original_text,
      expiryTimestamp: row.expiry_timestamp,
    }));

    // Sort by date, then by departure airport
    return entries.sort((a, b) => {
      if (a.date !== b.date) {
        return this.compareDates(a.date, b.date);
      }
      return a.departure.localeCompare(b.departure);
    });
  }

  compareDates(dateA: string, dateB: string): number {
    // Simple date comparison for YYYY-MM-DD format
    const dateObjA = new Date(dateA + 'T00:00:00Z');
    const dateObjB = new Date(dateB + 'T00:00:00Z');

    return dateObjA.getTime() - dateObjB.getTime();
  }

  private convertFullDateToMMDD(fullDate: string): string {
    // Convert YYYY-MM-DD to MMDD for display
    const [, month, day] = fullDate.split('-');
    return `${month}${day}`;
  }

  formatEntries(): string {
    const sortedEntries = this.getAllEntries();
    
    if (sortedEntries.length === 0) {
      return 'No availability entries yet.';
    }

    return sortedEntries
      .map(entry => `${this.convertFullDateToMMDD(entry.date)} ${entry.departure} / ${entry.arrival} @${entry.username}`)
      .join('\n');
  }

  setLastMessage(messageId: number, chatId: number): void {
    this.db.setLastMessage(chatId, messageId);
  }

  getLastMessage(chatId: number): { messageId: number; chatId: number } | null {
    return this.db.getLastMessage(chatId);
  }

  clearLastMessage(chatId: number): void {
    this.db.clearLastMessage(chatId);
  }

  // For testing
  clearAllData(): void {
    this.db.clearAllData();
  }

  close(): void {
    this.db.close();
  }
}