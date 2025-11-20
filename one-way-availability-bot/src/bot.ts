import { Bot } from "gramio";
import { AvailabilityBot, BotAPI } from "./availability-bot";
import { airportTimezoneService } from "./airport-timezone";
import { getExampleDate } from "./utils/date-helpers";

export interface BotHandlers {
  onStart: (context: any) => Promise<void>;
  onHelp: (context: any) => Promise<void>;
  onAdd: (context: any) => Promise<void>;
  onRemove: (context: any) => Promise<void>;
  onMessage: (context: any) => Promise<void>;
  // For testing
  getBot?: () => AvailabilityBot;
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
  const availabilityBot = new AvailabilityBot(undefined, groupId, topicId);

  const sendHelpMessage = async (context: any) => {
    // Send regular help message
    await context.send(getHelpText(), { parse_mode: 'MarkdownV2' });

    // Check if user is admin and send admin help
    await availabilityBot.sendAdminHelpIfAdmin(context);
  };

  return {
    onStart: sendHelpMessage,
    onHelp: sendHelpMessage,
    onAdd: async (context) => {
      // Route to main handleMessage to ensure proper multi-line detection
      await availabilityBot.handleMessage(context);
    },
    onRemove: async (context) => {
      // Route to main handleMessage to ensure proper multi-line detection
      await availabilityBot.handleMessage(context);
    },
    onMessage: async (context) => {
      await availabilityBot.handleMessage(context);
    },
    getBot: () => availabilityBot,
  };
}

export function setupBot(token: string, groupId?: number, topicId?: number): Bot {
  const bot = new Bot(token);
  const handlers = createBotHandlers(groupId, topicId);

  bot.command("start", handlers.onStart);
  bot.command("help", handlers.onHelp);
  bot.command("add", handlers.onAdd);
  bot.command("remove", handlers.onRemove);
  bot.command("rm", handlers.onRemove);
  bot.on("message", handlers.onMessage);

  // Set the bot API and start the expiry scheduler
  if (handlers.getBot) {
    const availabilityBot = handlers.getBot();
    // Cast bot.api to BotAPI since it has all the required methods
    // but with more complex generic types
    availabilityBot.setBotApi(bot.api as unknown as BotAPI);
    availabilityBot.startExpiryScheduler();
    console.log('Expiry scheduler started with automatic message updates');
  }

  return bot;
}