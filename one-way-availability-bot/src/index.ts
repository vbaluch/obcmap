import { setupBot } from "./bot.js";

process.loadEnvFile();

const groupId = process.env.GROUP_ID ? parseInt(process.env.GROUP_ID) : undefined;
const topicId = process.env.TOPIC_ID ? parseInt(process.env.TOPIC_ID) : undefined;
const bot = setupBot(process.env.BOT_TOKEN!, groupId, topicId);

bot.start();

console.log("Bot is running...");