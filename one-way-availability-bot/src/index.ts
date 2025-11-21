import { setupBot } from "./bot.js";
import { createServer } from "./server.js";
import { createLogger } from "./logger.js";
import { errorsTotal } from "./metrics.js";

const logger = createLogger('index');

process.loadEnvFile();

// Global error handlers as fallback
process.on('unhandledRejection', (reason, promise) => {
  errorsTotal.inc({ type: 'unhandled_rejection' });
  logger.error({ reason, promise }, 'Unhandled Promise Rejection');
});

process.on('uncaughtException', (error) => {
  errorsTotal.inc({ type: 'uncaught_exception' });
  logger.error({ error }, 'Uncaught Exception');
  process.exit(1);
});

const groupId = process.env.GROUP_ID ? parseInt(process.env.GROUP_ID) : undefined;
const topicId = process.env.TOPIC_ID ? parseInt(process.env.TOPIC_ID) : undefined;
const metricsPort = process.env.METRICS_PORT ? parseInt(process.env.METRICS_PORT) : 3000;

const { bot, availabilityBot } = setupBot(process.env.BOT_TOKEN!, groupId, topicId);

// Start metrics server and bot
createServer(metricsPort, {
  database: availabilityBot.getStorage().getDatabase(),
  botApi: bot.api,
})
  .then(async () => {
    // Start the Telegram bot
    await bot.start();
    logger.info('Bot is running');
  })
  .catch((error) => {
    errorsTotal.inc({ type: 'startup_error' });
    logger.error({ error }, 'Failed to start application');
    process.exit(1);
  });