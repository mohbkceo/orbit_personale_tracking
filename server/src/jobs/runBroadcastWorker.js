import { CustomAutomation, AutomationExecution } from '../models/CustomAutomation.js';
import { AuditLog } from '../models/AuditLog.js';
import { startCustomAutomationWorker } from './customAutomationWorker.js';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { startBroadcastWorker } from './broadcastWorker.js';
import { BroadcastCampaign } from '../models/BroadcastCampaign.js';
import { BroadcastRecipient } from '../models/BroadcastRecipient.js';
import { BroadcastSettings } from '../models/BroadcastSettings.js';
import { BroadcastWorkerSlot } from '../models/BroadcastWorkerSlot.js';

await connectDatabase();
await Promise.all([CustomAutomation.createIndexes(), AutomationExecution.createIndexes(), AuditLog.createIndexes()]);
await Promise.all([BroadcastCampaign.createIndexes(), BroadcastRecipient.createIndexes(), BroadcastSettings.createIndexes(), BroadcastWorkerSlot.createIndexes()]);
const stop = startBroadcastWorker();
const stopCustomAutomations = startCustomAutomationWorker();
console.log('Orbit broadcast worker started');
async function shutdown() { stopCustomAutomations(); stop(); await disconnectDatabase(); process.exit(0); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
