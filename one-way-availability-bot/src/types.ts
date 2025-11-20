import { Bot, MessageContext as GramIOMessageContext } from 'gramio';

// GramIO context type (MessageContext requires Bot type argument)
export type MessageContext = GramIOMessageContext<Bot>;

// Minimal context interface for what our bot actually uses
// This allows both real MessageContext and test MockContext to be used
// Note: With exactOptionalPropertyTypes, we need `| undefined` to match MockContext
export interface BotContext {
  text?: string | undefined;
  from: {
    id: number;
    username?: string | undefined;
  };
  chat: {
    id: number;
    type: string;
  };
  send: (text: string, options?: { parse_mode?: 'MarkdownV2' | 'HTML' | 'Markdown' } | undefined) => Promise<unknown>;
  bot: {
    api: {
      sendMessage: (params: {
        chat_id: number;
        text: string;
        message_thread_id?: number;
        parse_mode?: 'MarkdownV2' | 'HTML' | 'Markdown';
      }) => Promise<{ message_id?: number }>;
      deleteMessage: (params: { chat_id: number; message_id: number }) => Promise<unknown>;
      getChatMember: (params: { chat_id: number; user_id: number }) => Promise<{ status: string }>;
    };
  };
}

// Database row types
export interface EntryRow {
  id: number;
  user_id: number | null;
  username: string;
  date: string;
  departure: string;
  arrival: string;
  original_text: string;
  created_at: string;
  expiry_timestamp: number;
  deleted_at: string | null;
  deletion_reason: string | null;
}

// SQLite error type
export interface SQLiteError extends Error {
  code?: string;
}
