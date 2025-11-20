export interface MockUser {
  id: number;
  firstName: string;
  username?: string | undefined;
}

export interface MockChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
}

export interface MockMessage {
  message_id: number;
  from: MockUser;
  chat: MockChat;
  date: number;
  text?: string;
  forum_topic_id?: number;
}

export interface SendMessageParams {
  chat_id: number;
  text: string;
  message_thread_id?: number;
  parse_mode?: 'MarkdownV2' | 'HTML' | 'Markdown';
}

export interface DeleteMessageParams {
  chat_id: number;
  message_id: number;
}

export interface GetChatMemberParams {
  chat_id: number;
  user_id: number;
}

export interface ChatMemberResponse {
  status: 'member' | 'administrator' | 'creator' | 'left' | 'kicked' | 'restricted';
}

export interface SendOptions {
  parse_mode?: 'MarkdownV2' | 'HTML' | 'Markdown';
}

export interface MessageResponse {
  message_id?: number;
}

export interface MockContext {
  message: MockMessage;
  from: MockUser;
  chat: MockChat;
  text: string; // GramIO provides text directly on context
  payload?: {
    message_thread_id?: number;
  };
  send: jest.MockedFunction<(text: string, options?: SendOptions) => Promise<MessageResponse>>;
  reply: jest.MockedFunction<(text: string, options?: SendOptions) => Promise<MessageResponse>>;
  bot: {
    api: {
      sendMessage: jest.MockedFunction<(params: SendMessageParams) => Promise<MessageResponse>>;
      deleteMessage: jest.MockedFunction<(params: DeleteMessageParams) => Promise<Record<string, never>>>;
      getChatMember: jest.MockedFunction<(params: GetChatMemberParams) => Promise<ChatMemberResponse>>;
    };
  };
}

export function createMockContext(
  text: string,
  user: Partial<MockUser> = {},
  chat: Partial<MockChat> = {},
  topicId: number = 123
): MockContext {
  const mockUser: MockUser = {
    id: 1,
    firstName: 'Test User',
    ...user,
  };

  const mockChat: MockChat = {
    id: -1,
    type: 'group',
    title: 'Test Group',
    ...chat,
  };

  const mockMessage: MockMessage = {
    message_id: Date.now(),
    from: mockUser,
    chat: mockChat,
    date: Math.floor(Date.now() / 1000),
    text,
    ...(mockChat.type === 'group' && topicId !== undefined ? { forum_topic_id: topicId } : {}),
  };

  const mockSend = jest.fn().mockResolvedValue({ message_id: Date.now() });
  const mockReply = jest.fn().mockResolvedValue({ message_id: Date.now() });
  const mockBot = {
    api: {
      sendMessage: jest.fn().mockResolvedValue({ message_id: Date.now() }),
      deleteMessage: jest.fn().mockResolvedValue({}),
      getChatMember: jest.fn().mockResolvedValue({ status: 'member' }), // Default to allowing membership
    },
  };

  return {
    message: mockMessage,
    from: mockUser,
    chat: mockChat,
    text,
    payload: {
      ...(mockChat.type === 'group' && topicId !== undefined ? { message_thread_id: topicId } : {}),
    },
    send: mockSend,
    reply: mockReply,
    bot: mockBot,
  };
}

export function createMockUsers() {
  return {
    alice: { id: 1, firstName: 'Alice', username: 'alice' },
    bob: { id: 2, firstName: 'Bob', username: 'bob' },
    charlie: { id: 3, firstName: 'Charlie', username: 'charlie' },
  };
}

export function createMockGroupChat(title = 'Test Group') {
  return {
    id: -123,
    type: 'group' as const,
    title,
  };
}

export function createMockPrivateChat() {
  return {
    id: 456,
    type: 'private' as const,
  };
}

// Helper to check if user was sent a message (either via send or reply)
export function expectUserWasSent(context: MockContext, message: string | jest.Expect) {
  if (context.chat.type === 'private') {
    expect(context.send).toHaveBeenCalledWith(message);
  } else {
    expect(context.reply).toHaveBeenCalledWith(message);
  }
}

// Helper to check if user was sent a message containing text
export function expectUserWasSentContaining(context: MockContext, text: string) {
  // Commands are now only accepted via private messages, so always use send()
  expect(context.send).toHaveBeenCalledWith(expect.stringContaining(text));
}

// Helper to create context with specific group membership status
export function createMockContextWithMembership(
  text: string,
  user: Partial<MockUser> = {},
  chat: Partial<MockChat> = {},
  membershipStatus: 'member' | 'administrator' | 'creator' | 'left' | 'kicked' | 'restricted' = 'member',
  topicId: number = 123
): MockContext {
  const context = createMockContext(text, user, chat, topicId);
  context.bot.api.getChatMember.mockResolvedValue({ status: membershipStatus });
  return context;
}