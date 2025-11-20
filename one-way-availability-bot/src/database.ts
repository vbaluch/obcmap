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
        user_id BIGINT NOT NULL,
        username TEXT NOT NULL,
        date TEXT NOT NULL,
        departure TEXT NOT NULL,
        arrival TEXT NOT NULL,
        original_text TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expiry_timestamp BIGINT NOT NULL,
        UNIQUE(user_id, date, departure, arrival)
      )
    `;

    const createLastMessageTableSQL = `
      CREATE TABLE IF NOT EXISTS last_messages (
        chat_id BIGINT PRIMARY KEY,
        message_id BIGINT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    this.db.exec(createTableSQL);
    this.db.exec(createLastMessageTableSQL);
  }


  addEntry(userId: number, username: string, date: string, departure: string, arrival: string, originalText: string, expiryTimestamp: number): { success: boolean; error?: string } {
    try {
      // First check if user already has 3 entries
      const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM entries WHERE user_id = ?');
      const result = countStmt.get(userId) as { count: number };

      if (result.count >= 3) {
        return { success: false, error: `Maximum 3 entries per user allowed: "${originalText}"` };
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

  removeEntry(userId: number, date: string, departure: string, arrival: string): boolean {
    try {
      const stmt = this.db.prepare('DELETE FROM entries WHERE user_id = ? AND date = ? AND departure = ? AND arrival = ?');
      const result = stmt.run(userId, date, departure, arrival);
      return result.changes > 0;
    } catch (err) {
      return false;
    }
  }

  clearUserEntries(userId: number): number {
    try {
      const stmt = this.db.prepare('DELETE FROM entries WHERE user_id = ?');
      const result = stmt.run(userId);
      return result.changes;
    } catch (err) {
      return 0;
    }
  }

  getAllEntries(): any[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM entries ORDER BY date, departure');
      return stmt.all();
    } catch (err) {
      return [];
    }
  }

  getUserEntries(userId: number): any[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM entries WHERE user_id = ? ORDER BY date, departure');
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