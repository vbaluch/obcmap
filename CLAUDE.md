# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains a Telegram bot (`one-way-availability-bot`) that manages OBC one-way flight availability entries. Users can add/remove their availability for flights, and the bot maintains a shared list in a Telegram group topic.

## Development Commands

**Working Directory**: All commands should be run from `one-way-availability-bot/` directory.

```bash
# Install dependencies
pnpm install

# Run in development mode (hot reload)
pnpm dev

# Build TypeScript to dist/
pnpm build

# Run production build
pnpm start

# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage report
pnpm test:coverage

# Run a specific test file
pnpm test src/__tests__/parser.test.ts
```

## Environment Configuration

The bot requires a `.env` file in `one-way-availability-bot/` with:
- `BOT_TOKEN` - Telegram bot token from BotFather
- `GROUP_ID` - Target group chat ID (negative number, format: -1001234567890)
- `TOPIC_ID` - Target forum topic message thread ID

See `.env.example` for the template.

## Architecture

### Core Components

**Bot Entry Point** (`src/index.ts`)
- Loads environment variables using `process.loadEnvFile()`
- Initializes and starts the bot

**Bot Setup** (`src/bot.ts`)
- Creates bot handlers using GramIO framework
- Registers commands: `/start`, `/help`, `/add`, `/remove`, `/rm`, `/list`, `/clear`
- Starts the expiry scheduler for automatic cleanup

**AvailabilityBot** (`src/availability-bot.ts`)
- Main bot logic class
- Handles all message processing and command routing
- Enforces group membership verification with caching (60min positive, 5min negative)
- Only accepts commands via private messages (not in groups)
- Manages the single pinned message in the target group topic
- Integrates with ExpiryScheduler for automatic message updates

### Data Flow

**Entry Parsing** (`src/parser.ts`)
- Parses availability entries in format: `MMDD DEP ARR`
- Supports multiple separators: spaces, `/`, `-` (e.g., `1115 BER IST`, `1115 BER/IST`, `1115 BER-IST`)
- Validates date range (up to 7 days in advance, allows 2 days back for timezone tolerance)
- Calculates timezone-aware expiry timestamp using departure airport location

**Storage Layer** (`src/storage.ts` + `src/database.ts`)
- Two-layer architecture: Storage (business logic) wraps DatabaseWrapper (SQLite operations)
- Stores entries with unique constraint on (user_id, date, departure, arrival)
- Tracks last posted message ID per chat for delete-and-replace pattern
- Enforces 3 entries per user limit at database level
- Auto-cleanup of expired entries on read operations

**Timezone Handling** (`src/airport-timezone.ts`)
- Loads airport coordinates from `../ourairports-data/airports.csv`
- Uses geo-tz library to map coordinates to IANA timezone identifiers
- Calculates expiry as midnight local time at departure airport (accounting for DST)
- Fallback to UTC-12 for unknown airports (ensures entries stay visible longest)

**Expiry Scheduler** (`src/expiry-scheduler.ts`)
- Runs cleanup every 5 minutes (configurable)
- Removes entries past their timezone-aware expiry timestamp
- Triggers message update callback when entries are removed
- Separate from bot instance for testability

### Key Business Rules

1. Users must have a Telegram username (@username) to use the bot
2. Users must be members of the configured GROUP_ID to add entries
3. Commands only work in private messages (silently ignored in groups)
4. Maximum 3 active entries per user
5. Entries allowed up to 7 days in future (with 2-day past tolerance for timezones)
6. Entries expire at midnight local time in the departure airport timezone
7. Bot maintains exactly one message in the target topic (delete old, post new pattern)
8. All user-facing dates use MMDD format; internal storage uses YYYY-MM-DD

### Message Update Pattern

The bot uses a "single source of truth" message pattern:
1. Store the last message ID in the database
2. When any change occurs (add/remove/expiry), delete the old message
3. Post a new formatted message with the current state
4. Store the new message ID for next update

This ensures the group always sees exactly one current availability list.

## Testing

All tests use in-memory SQLite databases (`:memory:`) for isolation. The test structure includes:
- Mock context helpers in `src/utils/test-helpers.ts`
- Tests organized by feature in `src/__tests__/`
- Coverage collection excludes `src/index.ts` (main entry point)

When writing tests:
- Always use `:memory:` for database path
- Call `clearAllData()` in beforeEach for clean state
- Close database connections in afterEach to prevent leaks
- Use the mock context helpers for consistent test setup

## Common Patterns

**Adding a new command:**
1. Add command handler in `src/availability-bot.ts` (e.g., `handleXxxCommand`)
2. Register in `handleMessage` method for routing
3. Register in `src/bot.ts` using `bot.command()`
4. Add tests in `src/__tests__/`

**Modifying entry validation:**
- Update regex patterns in `src/parser.ts`
- Ensure consistent patterns in `parseRemoveCommand()` in `src/availability-bot.ts`
- Add tests to verify parsing and error messages

**Changing expiry logic:**
- Modify `getMidnightTimestamp()` in `src/airport-timezone.ts`
- Update `cleanupExpiredEntries()` in `src/storage.ts` if needed
- Test with various timezones and DST transitions
