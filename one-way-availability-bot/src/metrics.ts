import { Counter, Gauge, Histogram, Registry } from 'prom-client';

// Create metrics registry
export const register = new Registry();

// Commands counter
export const commandsTotal = new Counter({
  name: 'bot_commands_total',
  help: 'Total number of commands processed',
  labelNames: ['command', 'status'],
  registers: [register],
});

// Errors counter
export const errorsTotal = new Counter({
  name: 'bot_errors_total',
  help: 'Total number of errors',
  labelNames: ['type'],
  registers: [register],
});

// Database operations counter
export const databaseOperationsTotal = new Counter({
  name: 'bot_database_operations_total',
  help: 'Total number of database operations',
  labelNames: ['operation', 'status'],
  registers: [register],
});

// Telegram API calls counter
export const apiCallsTotal = new Counter({
  name: 'bot_api_calls_total',
  help: 'Total number of Telegram API calls',
  labelNames: ['method', 'status'],
  registers: [register],
});

// Entries expired counter
export const entriesExpiredTotal = new Counter({
  name: 'bot_entries_expired_total',
  help: 'Total number of entries expired and removed',
  registers: [register],
});

// Active entries gauge
export const entriesActive = new Gauge({
  name: 'bot_entries_active',
  help: 'Current number of active entries in database',
  registers: [register],
});

// Command duration histogram
export const commandDuration = new Histogram({
  name: 'bot_command_duration_seconds',
  help: 'Command processing time in seconds',
  labelNames: ['command'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

// Database query duration histogram
export const databaseQueryDuration = new Histogram({
  name: 'bot_database_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
  registers: [register],
});

// Cache hits/misses counter
export const cacheTotal = new Counter({
  name: 'bot_cache_total',
  help: 'Cache hits and misses',
  labelNames: ['result'],
  registers: [register],
});
