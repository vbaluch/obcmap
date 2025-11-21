import Fastify from 'fastify';
import { register } from './metrics';
import { createLogger } from './logger';
import type { DatabaseWrapper } from './database';
import type { BotAPI } from './one-way-availability-bot';

const logger = createLogger('server');

export interface HealthCheckDependencies {
  database: DatabaseWrapper;
  botApi?: BotAPI;
}

export async function createServer(port: number, dependencies: HealthCheckDependencies) {
  const fastify = Fastify({
    logger: false, // We use our own logger
  });

  // Metrics endpoint
  fastify.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', register.contentType);
    const metrics = await register.metrics();
    reply.send(metrics);
  });

  // Health check endpoint
  fastify.get('/health', async (_request, reply) => {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'unknown',
        botApi: 'unknown',
      },
    };

    let isHealthy = true;

    // Check database
    try {
      // Try a simple query to verify DB is responsive
      dependencies.database.getAllEntries();
      health.checks.database = 'ok';
    } catch (error) {
      health.checks.database = 'error';
      isHealthy = false;
      logger.error({ error }, 'Database health check failed');
    }

    // Check bot API (if set)
    if (dependencies.botApi) {
      health.checks.botApi = 'ok';
    } else {
      health.checks.botApi = 'not_configured';
    }

    if (!isHealthy) {
      health.status = 'degraded';
      reply.code(503);
    } else {
      reply.code(200);
    }

    reply.send(health);
  });

  try {
    await fastify.listen({ port, host: '0.0.0.0' });
    logger.info({ port }, 'Metrics server started');
    return fastify;
  } catch (error) {
    logger.error({ error, port }, 'Failed to start metrics server');
    throw error;
  }
}
