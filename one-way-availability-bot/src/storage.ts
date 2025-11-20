import { AvailabilityEntry } from './parser';
import { DatabaseWrapper } from './database';

export class AvailabilityStorage {
  private db: DatabaseWrapper;

  constructor(dbPath?: string) {
    this.db = new DatabaseWrapper(dbPath);
  }

  addEntry(entry: AvailabilityEntry): { success: boolean; error?: string } {
    return this.db.addEntry(
      entry.userId,
      entry.username,
      entry.date,
      entry.departure,
      entry.arrival,
      entry.originalText,
      entry.expiryTimestamp
    );
  }

  removeEntry(userId: number, date: string, departure: string, arrival: string): boolean {
    return this.db.removeEntry(userId, date, departure, arrival);
  }

  clearUserEntries(userId: number): number {
    return this.db.clearUserEntries(userId);
  }

  /**
   * Remove entries that have expired based on stored expiry timestamp
   * Returns the number of entries removed
   */
  cleanupExpiredEntries(): number {
    const allEntries = this.db.getAllEntries();
    const now = Date.now();
    let removedCount = 0;

    for (const entry of allEntries) {
      const isExpired = now >= entry.expiry_timestamp;
      
      if (isExpired) {
        const removed = this.db.removeEntry(entry.user_id, entry.date, entry.departure, entry.arrival);
        if (removed) {
          removedCount++;
        }
      }
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