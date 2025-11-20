import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export class DatabaseWrapper {
  private db: Database.Database;

  constructor(dbPath: string = './data/availability.db') {
    // Handle in-memory databases
    if (dbPath === ':memory:') {
      this.db = new Database(':memory:');
    } else {
      // Ensure data directory exists
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.db = new Database(dbPath);
    }

    this.initializeSchema();
  }

  private initializeSchema(): void {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT NOT NULL,
        date TEXT NOT NULL,
        departure TEXT NOT NULL,
        arrival TEXT NOT NULL,
        original_text TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expiry_timestamp INTEGER NOT NULL,
        deleted_at DATETIME DEFAULT NULL,
        deletion_reason TEXT DEFAULT NULL
      )
    `;

    const createUniqueIndexSQL = `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_unique_active
      ON entries(user_id, date, departure, arrival)
      WHERE deleted_at IS NULL AND user_id IS NOT NULL
    `;

    const createLastMessageTableSQL = `
      CREATE TABLE IF NOT EXISTS last_messages (
        chat_id INTEGER PRIMARY KEY,
        message_id INTEGER NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    this.db.exec(createTableSQL);
    this.db.exec(createUniqueIndexSQL);
    this.db.exec(createLastMessageTableSQL);
  }


  addEntry(userId: number | null, username: string, date: string, departure: string, arrival: string, originalText: string, expiryTimestamp: number): { success: boolean; error?: string } {
    try {
      // Only check 3-entry limit if user_id is provided (not for imports)
      if (userId !== null) {
        const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM entries WHERE user_id = ? AND deleted_at IS NULL');
        const result = countStmt.get(userId) as { count: number };

        if (result.count >= 3) {
          return { success: false, error: `Maximum 3 entries per user allowed: "${originalText}"` };
        }
      }

      // Try to insert the entry
      const insertStmt = this.db.prepare('INSERT INTO entries (user_id, username, date, departure, arrival, original_text, expiry_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)');
      insertStmt.run(userId, username, date, departure, arrival, originalText, expiryTimestamp);

      return { success: true };
    } catch (err: any) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return { success: false, error: `Entry already exists: "${originalText}"` };
      } else {
        return { success: false, error: 'Database error' };
      }
    }
  }

  removeEntry(userId: number, date: string, departure: string, arrival: string, deletionReason: string = 'manual'): boolean {
    try {
      const stmt = this.db.prepare('UPDATE entries SET deleted_at = CURRENT_TIMESTAMP, deletion_reason = ? WHERE user_id = ? AND date = ? AND departure = ? AND arrival = ? AND deleted_at IS NULL');
      const result = stmt.run(deletionReason, userId, date, departure, arrival);
      return result.changes > 0;
    } catch (err) {
      return false;
    }
  }

  clearUserEntries(userId: number): number {
    try {
      const stmt = this.db.prepare('UPDATE entries SET deleted_at = CURRENT_TIMESTAMP, deletion_reason = ? WHERE user_id = ? AND deleted_at IS NULL');
      const result = stmt.run('manual', userId);
      return result.changes;
    } catch (err) {
      return 0;
    }
  }

  getAllEntries(): any[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM entries WHERE deleted_at IS NULL ORDER BY date, departure');
      return stmt.all();
    } catch (err) {
      return [];
    }
  }

  getUserEntries(userId: number): any[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM entries WHERE user_id = ? AND deleted_at IS NULL ORDER BY date, departure');
      return stmt.all(userId);
    } catch (err) {
      return [];
    }
  }

  setLastMessage(chatId: number, messageId: number): void {
    try {
      const stmt = this.db.prepare('INSERT OR REPLACE INTO last_messages (chat_id, message_id) VALUES (?, ?)');
      stmt.run(chatId, messageId);
    } catch (err) {
      // Ignore errors
    }
  }

  getLastMessage(chatId: number): { messageId: number; chatId: number } | null {
    try {
      const stmt = this.db.prepare('SELECT message_id FROM last_messages WHERE chat_id = ?');
      const row = stmt.get(chatId) as { message_id: number } | undefined;
      
      if (row) {
        return { messageId: row.message_id, chatId };
      } else {
        return null;
      }
    } catch (err) {
      return null;
    }
  }

  clearLastMessage(chatId: number): void {
    try {
      const stmt = this.db.prepare('DELETE FROM last_messages WHERE chat_id = ?');
      stmt.run(chatId);
    } catch (err) {
      // Ignore errors
    }
  }

  matchUserToImportedEntries(userId: number, username: string): number {
    try {
      // Find imported entries with matching username (case-insensitive) and NULL user_id
      const stmt = this.db.prepare('UPDATE entries SET user_id = ? WHERE user_id IS NULL AND LOWER(username) = LOWER(?) AND deleted_at IS NULL');
      const result = stmt.run(userId, username);
      return result.changes;
    } catch (err) {
      return 0;
    }
  }

  close(): void {
    this.db.close();
  }

  // For testing - clear all data
  clearAllData(): void {
    try {
      this.db.exec('DELETE FROM entries');
      this.db.exec('DELETE FROM last_messages');
    } catch (err) {
      // Ignore errors
    }
  }
}