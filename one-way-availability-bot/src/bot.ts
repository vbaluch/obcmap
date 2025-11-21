import { Bot } from "gramio";
import { OneWayAvailabilityBot, BotAPI } from "./one-way-availability-bot";
import { airportTimezoneService } from "./airport-timezone";
import { getExampleDate } from "./utils/date-helpers";
import { BotContext } from "./types";
import { createLogger } from "./logger";
import { errorsTotal } from "./metrics";

const logger = createLogger('bot');

export interface BotHandlers {
  onStart: (context: BotContext) => Promise<void>;
  onHelp: (context: BotContext) => Promise<void>;
  onAdd: (context: BotContext) => Promise<void>;
  onRemove: (context: BotContext) => Promise<void>;
  onMessage: (context: BotContext) => Promise<void>;
  // For testing
  getBot?: () => OneWayAvailabilityBot;
}

function getHelpText(): string {
  const exampleDate = getExampleDate();

  // Get airport count for OurAirports credit
  const airportCount = airportTimezoneService.getAirportCount();
  
  return `Hello\\! I'm your OBC One\\-Way Availability Bot\\. I will help post your availability \\/ empty legs for flights back home after your mission\\.


💬 *How it works:*

• Send me commands as private messages only
• You must have a Telegram username \\(@username\\) to use this bot
• I'll reply to you with your personal entries
• Entries up to seven days in advance only
• Up to three entries per OBC
• Use three letter IATA code for start and final airport only\\! If you have stops in between please add a separate entry\\!
• You don\'t have to manually remove outdated entries, they expire automatically at midnight local time using location data for ${airportCount.toLocaleString()} airports provided by OurAirports

📋 *Commands Reference:*

• Add entry: \`/add MMDD DEP ARR\` or \`/add MMDD DEP / ARR\` or \`/add MMDD DEP\\-ARR\` \\(lowercase also works\\)
• Remove entry: \`/remove MMDD DEP ARR\` \\(plus same formatting variants as for \`/add\` plus \`/rm\` shorthand\\) and \`/remove MMDD\` \\(airports are optional if you only have one entry for that date\\)
• Remove all your entries: \`/clear\`
• List your entries: \`/list\`
• Get help: \`/help\` or \`/start\`

✨ *Message Examples:*

📝 Adding an entry:
    \`/add ${exampleDate} FRA BER\`

❌ Removing an entry:
    \`/remove ${exampleDate} FRA BER\`
    \`/remove ${exampleDate}\` \\(if only one entry for that date\\)`;
}

export function createBotHandlers(groupId?: number, topicId?: number): BotHandlers {
  const oneWayAvailabilityBot = new OneWayAvailabilityBot(undefined, groupId, topicId);

  const sendHelpMessage = async (context: BotContext) => {
    // Send regular help message
    await context.send(getHelpText(), { parse_mode: 'MarkdownV2' });

    // Check if user is admin and send admin help
    await oneWayAvailabilityBot.sendAdminHelpIfAdmin(context);
  };

  return {
    onStart: sendHelpMessage,
    onHelp: sendHelpMessage,
    onAdd: async (context) => {
      // Route to main handleMessage to ensure proper multi-line detection
      await oneWayAvailabilityBot.handleMessage(context);
    },
    onRemove: async (context) => {
      // Route to main handleMessage to ensure proper multi-line detection
      await oneWayAvailabilityBot.handleMessage(context);
    },
    onMessage: async (context) => {
      await oneWayAvailabilityBot.handleMessage(context);
    },
    getBot: () => oneWayAvailabilityBot,
  };
}

export interface BotSetup {
  bot: Bot;
  oneWayAvailabilityBot: OneWayAvailabilityBot;
}

export function setupBot(token: string, groupId?: number, topicId?: number): BotSetup {
  const bot = new Bot(token);
  const handlers = createBotHandlers(groupId, topicId);

  bot.command("start", handlers.onStart);
  bot.command("help", handlers.onHelp);
  bot.command("add", handlers.onAdd);
  bot.command("remove", handlers.onRemove);
  bot.command("rm", handlers.onRemove);
  bot.on("message", handlers.onMessage);

  // GramIO error handlers
  bot.onError(({ context, kind, error }) => {
    errorsTotal.inc({ type: 'bot_handler_error' });

    const logContext: Record<string, unknown> = {
      error,
      errorKind: kind
    };

    // Safely add optional context properties
    if (context.update) {
      logContext.update = context.update;
    }
    if ('from' in context && context.from && typeof context.from === 'object' && 'id' in context.from) {
      logContext.userId = (context.from as { id: number }).id;
    }
    if ('chat' in context && context.chat && typeof context.chat === 'object' && 'id' in context.chat) {
      logContext.chatId = (context.chat as { id: number }).id;
    }

    logger.error(logContext, 'Bot handler error');
  });

  bot.onResponseError((errorContext) => {
    errorsTotal.inc({ type: 'bot_api_error' });
    logger.error({
      error: errorContext, // Log the full error object with stack trace
      method: errorContext.method,
      code: errorContext.code,
      params: errorContext.params,
      payload: errorContext.payload
    }, 'Telegram API error');
  });

  const oneWayAvailabilityBot = handlers.getBot!();
  // Cast bot.api to BotAPI since it has all the required methods
  // but with more complex generic types
  oneWayAvailabilityBot.setBotApi(bot.api as unknown as BotAPI);
  oneWayAvailabilityBot.startExpiryScheduler();
  logger.info('Expiry scheduler started with automatic message updates');

  return { bot, oneWayAvailabilityBot };
}