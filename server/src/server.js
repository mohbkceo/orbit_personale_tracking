import { app } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { startJobs } from './jobs/scheduler.js';
import { TelegramSession } from './models/TelegramSession.js';

await connectDatabase();
await TelegramSession.createIndexes();
const server = app.listen(env.PORT, () => {
  console.log(`Orbit API listening on http://localhost:${env.PORT}`);
  if (env.NODE_ENV !== 'test') startJobs();
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => { await disconnectDatabase(); process.exit(0); });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
