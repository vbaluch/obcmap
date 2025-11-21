import { setupBot } from "./bot.js";
import { createServer } from "./server.js";
import { createLogger } from "./logger.js";
import { errorsTotal } from "./metrics.js";

const logger = createLogger('index');

// Load .env file if it exists (for local development)
// In Docker, env vars are injected via docker-compose env_file
try {
  process.loadEnvFile();
} catch (error) {
  // .env file doesn't exist - environment variables should be set externally
  logger.debug('.env file not found, using environment variables from system');
}

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

const { bot, oneWayAvailabilityBot } = setupBot(process.env.BOT_TOKEN!, groupId, topicId);

// Store server instance for graceful shutdown
let server: Awaited<ReturnType<typeof createServer>> | undefined;

// Graceful shutdown handling
const signals = ["SIGINT", "SIGTERM"] as const;

for (const signal of signals) {
  process.on(signal, async () => {
    logger.info({ signal }, 'Received shutdown signal, initiating graceful shutdown');

    try {
      // 1. Stop metrics server
      if (server) {
        await server.close();
        logger.info('Metrics server stopped');
      }

      // 2. Stop bot (GramIO graceful stop)
      await bot.stop();
      logger.info('Bot stopped');

      // 3. Close database connection
      oneWayAvailabilityBot.getStorage().getDatabase().close();
      logger.info('Database closed');

      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      errorsTotal.inc({ type: 'shutdown_error' });
      logger.error({ error }, 'Error during graceful shutdown');
      process.exit(1);
    }
  });
}

// Start metrics server and bot
createServer(metricsPort, {
  database: oneWayAvailabilityBot.getStorage().getDatabase(),
  botApi: bot.api,
})
  .then(async (fastifyInstance) => {
    server = fastifyInstance;
    logger.info({ port: metricsPort }, 'Metrics server started');

    // Start the Telegram bot
    await bot.start();
    logger.info('Bot is running');
  })
  .catch((error) => {
    errorsTotal.inc({ type: 'startup_error' });
    logger.error({
      error,
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
    }, 'Failed to start application');
    process.exit(1);
  });