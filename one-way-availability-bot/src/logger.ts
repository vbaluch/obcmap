import pino from 'pino';

// Create base logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;

// Helper to create child logger with module context
export function createLogger(module: string) {
  return logger.child({ module });
}
