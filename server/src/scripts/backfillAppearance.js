import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { Setting } from '../models/Setting.js';
import { APPEARANCE_DEFAULTS, resolveAppearance } from '../config/appearance.js';

export async function backfillAppearance() {
  let updated = 0;
  for await (const setting of Setting.collection.find({}, { projection: { theme: 1, appearance: 1 } })) {
    const resolved = resolveAppearance(setting.appearance, setting.theme);
    const missing = Object.fromEntries(Object.keys(APPEARANCE_DEFAULTS).filter((key) => setting.appearance?.[key] === undefined).map((key) => [`appearance.${key}`, resolved[key]]));
    if (!Object.keys(missing).length) continue;
    await Setting.collection.updateOne({ _id: setting._id }, { $set: missing });
    updated++;
  }
  return updated;
}

if (process.argv[1]?.endsWith('backfillAppearance.js')) {
  try { await connectDatabase(); console.log(`Backfilled appearance for ${await backfillAppearance()} workspaces`); }
  finally { await disconnectDatabase(); }
}
