import { ContextType, Bot } from 'gramio';
import { parseAvailabilityEntry, AvailabilityEntry } from './parser';
import { AvailabilityStorage } from './storage';
import { ExpiryScheduler } from './expiry-scheduler';
import { airportTimezoneService } from './airport-timezone';
import { getExampleDate } from './utils/date-helpers';

interface MembershipCacheEntry {
  isAllowed: boolean;
  timestamp: number;
}

export interface BotAPI {
  sendMessage: (params: {
    chat_id: number;
    text: string;
    message_thread_id?: number | undefined;
    parse_mode?: "MarkdownV2" | "HTML" | "Markdown" | undefined;
  }) => Promise<{ message_id?: number }>;
  deleteMessage: (params: {
    chat_id: number;
    message_id: number;
  }) => Promise<unknown>;
  getChatMember: (params: {
    chat_id: number;
    user_id: number;
  }) => Promise<{ status: string }>;
}

export class AvailabilityBot {
  private storage: AvailabilityStorage;
  private requiredTopicId: number;
  private targetGroupId: number;
  private membershipCache: Map<number, MembershipCacheEntry> = new Map();
  private expiryScheduler: ExpiryScheduler;
  private botApi?: BotAPI;

  constructor(dbPath?: string, groupId?: number, topicId?: number) {
    this.storage = new AvailabilityStorage(dbPath);
    this.targetGroupId = groupId || parseInt(process.env.GROUP_ID!);
    this.requiredTopicId = topicId || parseInt(process.env.TOPIC_ID!);
    
    if (!this.targetGroupId) {
      throw new Error('GROUP_ID environment variable is required');
    }
    if (!this.requiredTopicId) {
      throw new Error('TOPIC_ID environment variable is required');
    }

    // Initialize the expiry scheduler (5-minute interval by default)
    // with a callback to post updates when entries expire
    this.expiryScheduler = new ExpiryScheduler(
      this.storage,
      airportTimezoneService,
      5,
      async () => {
        await this.postUpdatedListWithoutContext();
      }
    );
  }

  private async isGroupMember(context: any, userId: number): Promise<boolean> {
    // Check cache first
    const cached = this.membershipCache.get(userId);
    const now = Date.now();

    if (cached) {
      const cacheValidDuration = cached.isAllowed ? 60 * 60 * 1000 : 5 * 60 * 1000; // 60min positive, 5min negative
      if (now - cached.timestamp < cacheValidDuration) {
        return cached.isAllowed;
      }
      // Cache expired, remove entry
      this.membershipCache.delete(userId);
    }

    // Check membership via API
    try {
      const api = context.bot.api;
      const chatMember = await api.getChatMember({
        chat_id: this.targetGroupId,
        user_id: userId
      });

      // Allow: member, administrator, owner
      // Block: kicked, left, restricted
      const allowedStatuses = ['member', 'administrator', 'creator'];
      const isAllowed = allowedStatuses.includes(chatMember.status);

      // Cache the result
      this.membershipCache.set(userId, {
        isAllowed,
        timestamp: now
      });

      return isAllowed;
    } catch (error) {
      // Fail closed - if we can't verify membership, deny access
      this.membershipCache.set(userId, {
        isAllowed: false,
        timestamp: now
      });
      return false;
    }
  }

  private async isGroupAdmin(context: any, userId: number): Promise<boolean> {
    try {
      const api = context.bot.api;
      const chatMember = await api.getChatMember({
        chat_id: this.targetGroupId,
        user_id: userId
      });

      // Only administrators and creators are admins
      const adminStatuses = ['administrator', 'creator'];
      return adminStatuses.includes(chatMember.status);
    } catch (error) {
      // Fail closed - if we can't verify admin status, deny access
      return false;
    }
  }

  async handleMessage(context: ContextType<Bot, "message"> | any): Promise<void> {
    
    const text = context.text;
    if (!text || typeof text !== 'string') {
      return;
    }
    const trimmedText = text.trim();
    if (!trimmedText) {
      return;
    }

    const userId = context.from.id;
    const username = context.from.username;
    const isPrivateMessage = context.chat.type === 'private';

    // Check if user has a username (required for entries)
    if (!username || username.trim() === '') {
      await this.sendToUser(context, 'Sorry, you need a Telegram username (@username) to use this bot. Please set one in your Telegram settings and try again.');
      return;
    }

    // Only accept private messages for commands
    if (!isPrivateMessage) {
      return;
    }

    // Verify user is a member of the target group
    const isMember = await this.isGroupMember(context, userId);
    if (!isMember) {
      await this.sendToUser(context, 'Sorry, you must be a member of the OBC group to use this bot.');
      return;
    }

    // Match user to any imported entries with their username
    this.storage.getDatabase().matchUserToImportedEntries(userId, username);

    // Handle single-line commands only
    if (trimmedText === '/add') {
      const exampleDate = getExampleDate();
      await this.sendToUser(context, `Usage: /add MMDD DEP ARR\nExample: /add ${exampleDate} BER IST`);
      return;
    }

    if (trimmedText.startsWith('/add ')) {
      await this.handleAddCommand(context, trimmedText);
      return;
    }

    if (trimmedText === '/remove') {
      const exampleDate = getExampleDate();
      await this.sendToUser(context, `Usage: /remove (or /rm) MMDD DEP ARR or /remove MMDD\nExample: /remove ${exampleDate} BER IST or /remove ${exampleDate} (if only one entry for that date)`);
      return;
    }

    if (trimmedText.startsWith('/remove ')) {
      await this.handleRemoveCommand(context, trimmedText);
      return;
    }

    if (trimmedText === '/rm') {
      const exampleDate = getExampleDate();
      await this.sendToUser(context, `Usage: /remove (or /rm) MMDD DEP ARR or /remove MMDD\nExample: /remove ${exampleDate} BER IST or /remove ${exampleDate} (if only one entry for that date)`);
      return;
    }

    if (trimmedText.startsWith('/rm ')) {
      // Convert /rm to /remove for internal processing
      const removeCommand = trimmedText.replace('/rm', '/remove');
      await this.handleRemoveCommand(context, removeCommand);
      return;
    }

    if (trimmedText === '/list') {
      await this.replyWithUserEntries(context);
      return;
    }

    if (trimmedText === '/clear') {
      await this.handleClearCommand(context);
      return;
    }

    if (trimmedText.startsWith('/import')) {
      await this.handleImportCommand(context, trimmedText);
      return;
    }

    // If we reach here, it's not a recognized command - silently ignore
  }

  private escapeMarkdownV2(text: string): string {
    // Escape special characters for MarkdownV2
    // Characters that need escaping: _*[]()~`>#+-=|{}.!
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }

  private async sendToUser(context: any, message: string): Promise<void> {
    // Commands are now only accepted via private messages, so always use send()
    await context.send(message);
  }

  async sendAdminHelpIfAdmin(context: any): Promise<void> {
    const userId = context.from?.id;
    if (!userId) return;

    const isAdmin = await this.isGroupAdmin(context, userId);
    if (!isAdmin) return;

    const adminHelp = `🔧 *Admin Commands:*

• Import entries: \`/import\`
  Format: \`MMDD DEP / ARR @username\`
  Example:
  \`\`\`
/import
1122 HOT / DOG @Alice
1123 HEL / YES @Bob
\`\`\`

More admin commands will be added\\.`;

    await context.send(adminHelp, { parse_mode: 'MarkdownV2' });
  }

  private formatParseError(entryText: string, parseResult: any, commandPrefix = ''): string {
    const quotedInput = commandPrefix ? `"${commandPrefix}"` : `"${entryText}"`;
    const exampleDate = getExampleDate();
    if (parseResult.error === 'format') {
      return `Invalid format: ${quotedInput}. Use format: MMDD DEP ARR (e.g., ${exampleDate} BER IST)`;
    } else if (parseResult.error === 'date_limit') {
      return `Date too far in advance: ${quotedInput}. Entries are only allowed up to 7 days from today.`;
    }
    return `Unknown error parsing ${quotedInput}`;
  }

  async handleAddCommand(context: any, commandText: string): Promise<void> {
    const userId = context.from.id;
    const username = context.from.username;

    // Extract entry text after "/add "
    const entryText = commandText.substring(5).trim();
    if (!entryText) {
      const exampleDate = getExampleDate();
      await this.sendToUser(context, `Usage: /add ${exampleDate} BER IST`);
      return;
    }

    const parseResult = parseAvailabilityEntry(entryText, userId, username, commandText);
    if (!parseResult.success) {
      await this.sendToUser(context, this.formatParseError(entryText, parseResult, commandText));
      return;
    }
    
    const entry = parseResult.entry!;

    const result = this.storage.addEntry(entry);
    if (result.success) {
      await this.replyWithUserEntries(context);
      await this.postUpdatedListToGroup(context);
    } else {
      // Show user's current entries for certain error types
      if (result.error && (result.error.includes('Entry already exists:') || result.error.includes('Maximum 3 entries'))) {
        await this.sendErrorWithUserEntries(context, result.error);
      } else {
        await this.sendToUser(context, result.error || 'Unknown error');
      }
    }
  }

  async handleClearCommand(context: any): Promise<void> {
    const userId = context.from.id;

    // Get the user's entries before clearing them
    const entriesToClear = this.storage.getUserEntries(userId);

    if (entriesToClear.length > 0) {
      // Clear the entries
      this.storage.clearUserEntries(userId);

      // Show what was cleared
      const clearedEntries = entriesToClear
        .sort((a, b) => {
          if (a.date !== b.date) {
            return this.storage.compareDates(a.date, b.date);
          }
          return a.departure.localeCompare(b.departure);
        })
        .map(entry => `${this.convertFullDateToMMDD(entry.date)} ${entry.departure} / ${entry.arrival}`)
        .join('\n');

      await this.sendToUser(context, `Cleared entries:\n${clearedEntries}\n\nYour entries: none`);
      await this.postUpdatedListToGroup(context);
    } else {
      await this.sendToUser(context, 'No entries to clear.');
    }
  }

  async handleImportCommand(context: any, commandText: string): Promise<void> {
    const userId = context.from.id;

    // Check if user is admin
    const isAdmin = await this.isGroupAdmin(context, userId);
    if (!isAdmin) {
      await this.sendToUser(context, 'This command is only available to group administrators.');
      return;
    }

    // Extract lines after "/import"
    const importText = commandText.substring(7).trim();
    if (!importText) {
      await this.sendToUser(context, 'Usage: /import\n1122 HOT / DOG @Alice\n1123 HEL / YES @Bob');
      return;
    }

    const lines = importText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const results: { success: boolean; line: string; error?: string }[] = [];

    for (const line of lines) {
      const parsed = this.parseImportLine(line);
      if (parsed.success && parsed.entry) {
        const addResult = this.storage.addEntry(parsed.entry);
        if (addResult.success) {
          results.push({ success: true, line });
        } else {
          results.push({ success: false, line, error: addResult.error || 'Unknown error' });
        }
      } else {
        results.push({ success: false, line, error: parsed.error || 'Invalid format' });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failedResults = results.filter(r => !r.success);

    let response = `Imported ${successCount} entries.`;
    if (failedResults.length > 0) {
      response += `\n\nFailed to import ${failedResults.length} entries:`;
      for (const failed of failedResults) {
        response += `\n- ${failed.line} (${failed.error})`;
      }
    }

    await this.sendToUser(context, response);
    if (successCount > 0) {
      await this.postUpdatedListToGroup(context);
    }
  }

  private parseImportLine(line: string): { success: boolean; entry?: AvailabilityEntry; error?: string } {
    // Parse format: MMDD DEP / ARR @username
    // Example: 1122 HOT / DOG @Alice
    const pattern = /^(\d{4})\s+([A-Z]{3})\s*\/\s*([A-Z]{3})\s+@(\w+)$/;
    const match = line.match(pattern);

    if (!match) {
      return { success: false, error: 'Invalid format' };
    }

    const [, mmdd, departure, arrival, username] = match;

    if (!mmdd || !departure || !arrival || !username) {
      return { success: false, error: 'Invalid format' };
    }

    // Parse date
    const month = mmdd.substring(0, 2);
    const day = mmdd.substring(2, 4);

    // Validate month and day
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);

    if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
      return { success: false, error: 'Invalid date' };
    }

    // Determine year (same logic as parser.ts)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    let year = currentYear;
    if (monthNum < currentMonth || (monthNum === currentMonth && dayNum < now.getDate())) {
      year = currentYear + 1;
    }

    const fullDate = `${year}-${month}-${day}`;

    // Calculate expiry timestamp (use departure airport timezone)
    const expiryTimestamp = airportTimezoneService.getMidnightTimestamp(departure, mmdd, year);

    return {
      success: true,
      entry: {
        userId: null,
        username,
        date: fullDate,
        departure,
        arrival,
        originalText: line,
        expiryTimestamp
      }
    };
  }

  private convertFullDateToMMDD(fullDate: string): string {
    // Convert YYYY-MM-DD to MMDD for display
    const [, month, day] = fullDate.split('-');
    return `${month}${day}`;
  }

  private convertMMDDToFullDate(mmdd: string): string {
    const month = parseInt(mmdd.substring(0, 2), 10);
    const day = parseInt(mmdd.substring(2, 4), 10);
    
    const now = new Date();
    const currentYear = now.getFullYear();
    
    // Create date for this year
    const thisYearDate = new Date(currentYear, month - 1, day);
    
    // Create today's date at midnight for comparison
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // If the date hasn't passed yet this year (or is today), use current year
    // If it has passed, use next year (typical for booking future flights)
    const year = thisYearDate.getTime() >= today.getTime() ? currentYear : currentYear + 1;
    
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }

  private parseRemoveCommand(args: string): { date?: string; departure?: string; arrival?: string; error?: string } {
    const normalizedText = args.trim().toLowerCase();
    
    // Try the same patterns as the parser for consistency
    const patterns = [
      // Basic pattern: 1115 ber ist
      /^(\d{4})\s+([a-z]{3})\s+([a-z]{3})$/,
      
      // With slash separator: 1115 BER / IST
      /^(\d{4})\s+([a-z]{3})\s*\/\s*([a-z]{3})$/,
      
      // With dash separator: 1115 BER-IST
      /^(\d{4})\s+([a-z]{3})-([a-z]{3})$/,
      
      // Date-only pattern: 1115
      /^(\d{4})$/,
    ];

    for (const pattern of patterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1]) {
        const date = match[1].padStart(4, '0');
        const departure = match[2]?.toUpperCase();
        const arrival = match[3]?.toUpperCase();
        
        return { 
          date, 
          ...(departure ? { departure } : {}),
          ...(arrival ? { arrival } : {})
        };
      }
    }

    return { error: 'Invalid format' };
  }

  async processRemoveCommand(removeCommand: string, userId: number): Promise<{ success: boolean; error?: string }> {
    const args = removeCommand.slice(7).trim(); // Remove '/remove'
    const exampleDate = getExampleDate();

    if (!args) {
      // No arguments provided
      return {
        success: false,
        error: `Usage: /remove (or /rm) MMDD DEP ARR or /remove MMDD\nExample: /remove ${exampleDate} BER IST or /remove ${exampleDate} (if only one entry for that date)`
      };
    }

    const parsed = this.parseRemoveCommand(args);

    if (parsed.error) {
      return {
        success: false,
        error: `Usage: /remove (or /rm) MMDD DEP ARR or /remove MMDD\nExample: /remove ${exampleDate} BER IST or /remove ${exampleDate} (if only one entry for that date)`
      };
    }

    const { date, departure, arrival } = parsed;

    if (!date) {
      return { success: false, error: 'Date is required for removal.' };
    }

    if (!departure || !arrival) {
      // Date-only removal: /remove 1115
      const fullDate = this.convertMMDDToFullDate(date);
      const userEntries = this.storage.getUserEntries(userId);
      const dateEntries = userEntries.filter(entry => entry.date === fullDate);
      
      if (dateEntries.length === 0) {
        return { 
          success: false, 
          error: `No entries found for ${date}.`
        };
      } else if (dateEntries.length > 1) {
        return { 
          success: false, 
          error: `Multiple entries found for ${date}. Please specify departure and arrival.`
        };
      } else {
        // Exactly one entry - remove it
        const entry = dateEntries[0];
        if (!entry) {
          return { success: false, error: 'Entry not found.' };
        }
        const removed = this.storage.removeEntry(userId, entry.date, entry.departure, entry.arrival);
        return removed ? { success: true } : { success: false, error: 'Failed to remove entry.' };
      }
    } else {
      // Full entry removal with all the same format support as /add
      const fullDate = this.convertMMDDToFullDate(date);
      const removed = this.storage.removeEntry(userId, fullDate, departure, arrival);
      
      if (removed) {
        return { success: true };
      } else {
        return { 
          success: false, 
          error: 'Entry not found. Make sure the date and airports match exactly.'
        };
      }
    }
  }

  async handleRemoveCommand(context: ContextType<Bot, "message"> | any, text: string): Promise<void> {
    const userId = context.from.id;
    const result = await this.processRemoveCommand(text, userId);
    
    if (result.success) {
      // First reply to user with their current entries
      await this.replyWithUserEntries(context);
      
      // Then post updated full list to group (last message)
      await this.postUpdatedListToGroup(context);
    } else {
      // Add quotes around the original command for clarity
      const originalText = context.text.trim();
      const errorMessage = `"${originalText}": ${result.error || 'Unknown error'}`;
      
      // For "Multiple entries found" errors, show user entries like other errors
      if (result.error && result.error.includes('Multiple entries found')) {
        await this.sendErrorWithUserEntries(context, errorMessage);
      } else {
        await this.sendToUser(context, errorMessage);
      }
    }
  }

  async replyWithUserEntries(context: ContextType<Bot, "message"> | any): Promise<void> {
    const userId = context.from.id;
    const userEntries = this.storage.getUserEntries(userId);
    
    if (userEntries.length === 0) {
      await this.sendToUser(context, 'Your entries: none');
    } else {
      const formattedUserEntries = userEntries
        .sort((a, b) => {
          if (a.date !== b.date) {
            return this.storage.compareDates(a.date, b.date);
          }
          return a.departure.localeCompare(b.departure);
        })
        .map(entry => `${this.convertFullDateToMMDD(entry.date)} ${entry.departure} / ${entry.arrival}`)
        .join('\n');
      
      await this.sendToUser(context, `Your entries:\n${formattedUserEntries}`);
    }
  }

  async sendErrorWithUserEntries(context: ContextType<Bot, "message"> | any, errorMessage: string): Promise<void> {
    const userId = context.from.id;
    const userEntries = this.storage.getUserEntries(userId);
    
    if (userEntries.length === 0) {
      await this.sendToUser(context, `${errorMessage}\n\nYour entries: none`);
    } else {
      const formattedUserEntries = userEntries
        .sort((a, b) => {
          if (a.date !== b.date) {
            return this.storage.compareDates(a.date, b.date);
          }
          return a.departure.localeCompare(b.departure);
        })
        .map(entry => `${this.convertFullDateToMMDD(entry.date)} ${entry.departure} / ${entry.arrival}`)
        .join('\n');
      
      await this.sendToUser(context, `${errorMessage}\n\nYour entries:\n${formattedUserEntries}`);
    }
  }


  async postUpdatedListToGroup(context: ContextType<Bot, "message"> | any): Promise<void> {
    const api = context.bot.api;

    // Delete previous bot message if it exists
    const lastMessage = this.storage.getLastMessage(this.targetGroupId);
    if (lastMessage) {
      try {
        await api.deleteMessage({
          chat_id: this.targetGroupId,
          message_id: lastMessage.messageId
        });
      } catch (error) {
        // Ignore errors (message might be too old to delete)
      }
    }

    // Post new list to the configured group topic
    const formattedList = this.storage.formatEntries();
    const listMessage = formattedList || 'No OBC One\\-Way Availability entries yet.';
    const escapedListMessage = this.escapeMarkdownV2(listMessage);
    const finalMessage = `*OBC One\\-Way Availability*\n\n${escapedListMessage}`;
    
    // Always post to the target group and topic
    const sentMessage = await api.sendMessage({
      chat_id: this.targetGroupId,
      text: finalMessage,
      message_thread_id: this.requiredTopicId,
      parse_mode: 'MarkdownV2'
    });
    
    // Store the new message ID for future deletion
    if (sentMessage?.message_id) {
      this.storage.setLastMessage(sentMessage.message_id, this.targetGroupId);
    }
  }

  async postUpdatedList(context: ContextType<Bot, "message"> | any): Promise<void> {
    // Legacy method for backward compatibility
    await this.postUpdatedListToGroup(context);
  }

  // For testing - get storage instance
  getStorage(): AvailabilityStorage {
    return this.storage;
  }

  /**
   * Start the automatic expiry cleanup scheduler
   */
  startExpiryScheduler(): void {
    this.expiryScheduler.start();
  }

  /**
   * Stop the automatic expiry cleanup scheduler
   */
  stopExpiryScheduler(): void {
    this.expiryScheduler.stop();
  }

  /**
   * Check if the expiry scheduler is running
   */
  isExpirySchedulerRunning(): boolean {
    return this.expiryScheduler.isRunning();
  }

  /**
   * Run cleanup manually (useful for testing)
   */
  runExpiryCleanup(): void {
    this.expiryScheduler.runCleanup();
  }

  /**
   * Set the bot API instance for posting messages without context
   */
  setBotApi(botApi: BotAPI): void {
    this.botApi = botApi;
  }

  /**
   * Post updated list to group without needing a context object
   * Used by the expiry scheduler to update the message when entries expire
   */
  async postUpdatedListWithoutContext(): Promise<void> {
    if (!this.botApi) {
      console.warn('Bot API not set, cannot post updated list');
      return;
    }

    const api = this.botApi;

    // Delete previous bot message if it exists
    const lastMessage = this.storage.getLastMessage(this.targetGroupId);
    if (lastMessage) {
      try {
        await api.deleteMessage({
          chat_id: this.targetGroupId,
          message_id: lastMessage.messageId
        });
      } catch (error) {
        // Ignore errors (message might be too old to delete)
      }
    }

    // Post new list to the configured group topic
    const formattedList = this.storage.formatEntries();
    const listMessage = formattedList || 'No OBC One\\-Way Availability entries yet.';
    const escapedListMessage = this.escapeMarkdownV2(listMessage);
    const finalMessage = `*OBC One\\-Way Availability*\n\n${escapedListMessage}`;

    const sentMessage = await api.sendMessage({
      chat_id: this.targetGroupId,
      text: finalMessage,
      message_thread_id: this.requiredTopicId,
      parse_mode: 'MarkdownV2'
    });

    // Store the new message ID for future deletion
    if (sentMessage?.message_id) {
      this.storage.setLastMessage(sentMessage.message_id, this.targetGroupId);
    }
  }
}