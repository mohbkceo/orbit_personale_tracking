import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { normalizePhone } from '../utils/userIdentity.js';

export const identityIndexes = [
  { field: 'email', name: 'user_email_unique_present' },
  { field: 'phone', name: 'user_phone_unique_present' },
];
const singleKey = (index, field) => Object.keys(index.key).length === 1 && index.key[field] === 1;
const desiredIndex = (index, field) =>
  singleKey(index, field) &&
  index.unique === true &&
  !index.sparse &&
  !index.collation &&
  JSON.stringify(index.partialFilterExpression) ===
    JSON.stringify({ [field]: { $type: 'string' } });
const legacyEmailIndex = (index) =>
  singleKey(index, 'email') &&
  index.unique === true &&
  !index.partialFilterExpression &&
  !index.collation &&
  !index.hidden &&
  !index.expireAfterSeconds;

async function listIdentityIndexes(collection) {
  try {
    return await collection.indexes();
  } catch (error) {
    // A new deployment may not have a users collection yet.
    if (error.code === 26) return [];
    throw error;
  }
}

export async function assertUserIdentityIndexes(collection) {
  const indexes = await listIdentityIndexes(collection);
  const complete = identityIndexes.every(({ field }) =>
    indexes.some((index) => desiredIndex(index, field)),
  );
  const incompatible = indexes.some(
    (index) =>
      index.unique &&
      ('email' in index.key || 'phone' in index.key) &&
      !identityIndexes.some(({ field }) => desiredIndex(index, field)),
  );
  if (!complete || incompatible)
    throw new Error(
      'Run the reviewed migrate:identities procedure before starting Orbit: user identity indexes are not ready.',
    );
}

// Index-only startup upgrade. Account values are never changed here: data that
// needs normalization or manual review must use the guarded CLI migration.
export async function ensureUserIdentityIndexes(collection) {
  const indexes = await listIdentityIndexes(collection);
  const complete = identityIndexes.every(({ field }) =>
    indexes.some((index) => desiredIndex(index, field)),
  );
  if (complete && !indexes.some(legacyEmailIndex)) {
    await assertUserIdentityIndexes(collection);
    return;
  }

  const validate = (plan) => {
    if (plan.problems.length || plan.phoneNormalizationCount)
      throw new Error(
        'Run the reviewed migrate:identities procedure before starting Orbit: identity data or indexes require manual review.',
      );
  };
  const plan = await inspectUserIdentities(collection);
  validate(plan);
  // Build both constraints before removing any legacy constraint. MongoDB
  // enforces uniqueness during index builds, including concurrent writes.
  for (const { field, name } of identityIndexes) {
    if (!plan.indexes.some((index) => desiredIndex(index, field))) {
      await collection.createIndex(
        { [field]: 1 },
        { name, unique: true, partialFilterExpression: { [field]: { $type: 'string' } } },
      );
    }
  }
  const ready = await inspectUserIdentities(collection);
  validate(ready);
  for (const name of plan.legacyEmailIndexes) {
    const current = (await collection.indexes()).find((index) => index.name === name);
    // Another starting instance may have completed the same index-only upgrade.
    if (!current) continue;
    const reviewed = plan.indexes.find((index) => index.name === name);
    if (!legacyEmailIndex(current) || JSON.stringify(current) !== JSON.stringify(reviewed))
      throw new Error('Legacy index definition changed; refusing to drop it');
    try {
      await collection.dropIndex(name);
    } catch (error) {
      if (error.code !== 27) throw error; // IndexNotFound from concurrent startup
    }
  }
  await assertUserIdentityIndexes(collection);
}

// Native collection API: never initializes Mongoose models or writes during inspection.
export async function inspectUserIdentities(collection) {
  const indexes = await listIdentityIndexes(collection);
  const identities = [];
  const problems = [];
  const owners = { email: new Map(), phone: new Map() };
  const phoneUpdates = [];
  let missingEmail = 0;
  for await (const user of collection
    .find({}, { projection: { email: 1, phone: 1 } })
    .sort({ _id: 1 })) {
    const id = String(user._id);
    identities.push({ id, email: user.email ?? null, phone: user.phone ?? null });
    if (!user.email) missingEmail++;
    if (!user.email && !user.phone) problems.push({ id, reason: 'No usable login identifier' });
    for (const field of ['email', 'phone']) {
      if (user[field] == null) continue;
      let canonical;
      try {
        if (typeof user[field] !== 'string' || !user[field].trim()) throw new Error();
        canonical =
          field === 'phone' ? normalizePhone(user.phone) : user.email.trim().toLowerCase();
        if (field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(canonical)) throw new Error();
      } catch {
        problems.push({ id, field, reason: 'Invalid identity; resolve manually' });
        continue;
      }
      if (owners[field].has(canonical))
        problems.push({
          field,
          ids: [owners[field].get(canonical), id],
          reason: 'Normalized identity collision',
        });
      else owners[field].set(canonical, id);
      // Preserve email bytes. Noncanonical legacy addresses need explicit review.
      if (field === 'email' && canonical !== user.email)
        problems.push({
          id,
          field,
          reason: 'Noncanonical email; preserve and resolve manually before rollout',
        });
      if (field === 'phone' && canonical !== user.phone)
        phoneUpdates.push({ id, from: user.phone, to: canonical });
    }
  }
  const legacy = indexes.filter(legacyEmailIndex);
  for (const index of indexes) {
    if (
      index.unique &&
      Object.keys(index.key).length > 1 &&
      ('email' in index.key || 'phone' in index.key)
    ) {
      problems.push({
        index: index.name,
        reason: 'Compound unique identity index; review manually',
      });
    }
    for (const { field, name } of identityIndexes) {
      if (
        (singleKey(index, field) || index.name === name) &&
        !desiredIndex(index, field) &&
        !legacyEmailIndex(index)
      ) {
        problems.push({
          index: index.name,
          reason: 'Unrecognized identity index; review manually',
        });
      }
    }
  }
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ indexes, identities }))
    .digest('hex');
  const normalizedPhones = new Map(phoneUpdates.map((update) => [update.id, update.to]));
  const normalizedIdentityFingerprint = createHash('sha256')
    .update(
      JSON.stringify(
        identities.map((identity) => ({
          ...identity,
          phone: normalizedPhones.get(identity.id) || identity.phone,
        })),
      ),
    )
    .digest('hex');
  return {
    database: collection.conn?.name || collection.dbName,
    collection: collection.collectionName,
    users: identities.length,
    missingEmail,
    indexes,
    legacyEmailIndexes: legacy.map((index) => index.name),
    phoneNormalizationCount: phoneUpdates.length,
    problems,
    fingerprint,
    normalizedIdentityFingerprint,
    // Do not print identity values in the CLI report.
    phoneUpdates,
  };
}

export async function migrateUserIdentities(
  collection,
  { expectedFingerprint, replaceEmailIndexes = [], writesPaused = false } = {},
) {
  const plan = await inspectUserIdentities(collection);
  if (!writesPaused)
    throw new Error('Pause all account/identity writers before applying this migration');
  if (!expectedFingerprint || plan.fingerprint !== expectedFingerprint)
    throw new Error('Database changed or plan not reviewed; inspect again');
  if (plan.problems.length) throw new Error('Identity/index problems require manual resolution');
  if (
    JSON.stringify([...replaceEmailIndexes].sort()) !==
    JSON.stringify([...plan.legacyEmailIndexes].sort())
  )
    throw new Error('Specify exactly the reviewed legacy email index names');

  // Both email indexes coexist while the new unique constraint is built. If any
  // createIndex fails, no existing index is dropped. All unrelated indexes stay.
  const email = identityIndexes[0];
  if (!plan.indexes.some((index) => desiredIndex(index, 'email'))) {
    await collection.createIndex(
      { email: 1 },
      { name: email.name, unique: true, partialFilterExpression: { email: { $type: 'string' } } },
    );
  }
  for (const update of plan.phoneUpdates) {
    const result = await collection.updateOne(
      { _id: new mongoose.Types.ObjectId(update.id), phone: update.from },
      { $set: { phone: update.to } },
    );
    if (result.matchedCount !== 1)
      throw new Error('Identity changed during migration; stop writers and inspect again');
  }
  if (!plan.indexes.some((index) => desiredIndex(index, 'phone'))) {
    await collection.createIndex(
      { phone: 1 },
      {
        name: identityIndexes[1].name,
        unique: true,
        partialFilterExpression: { phone: { $type: 'string' } },
      },
    );
  }
  const ready = await inspectUserIdentities(collection);
  if (
    ready.problems.length ||
    ready.phoneNormalizationCount ||
    ready.normalizedIdentityFingerprint !== plan.normalizedIdentityFingerprint
  )
    throw new Error('Post-build validation failed; old email index retained');
  for (const name of replaceEmailIndexes) {
    const current = (await collection.indexes()).find((index) => index.name === name);
    const reviewed = plan.indexes.find((index) => index.name === name);
    if (
      !current ||
      !legacyEmailIndex(current) ||
      JSON.stringify(current) !== JSON.stringify(reviewed)
    )
      throw new Error('Legacy index definition changed; refusing to drop it');
    await collection.dropIndex(name);
  }
  return inspectUserIdentities(collection);
}
