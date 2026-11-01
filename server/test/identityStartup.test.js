import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  assertUserIdentityIndexes,
  ensureUserIdentityIndexes,
  identityIndexes,
} from '../src/services/identityMigrationService.js';

let mongo;
let connection;
let users;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  connection = await mongoose.createConnection(mongo.getUri(), {
    autoIndex: false,
    autoCreate: false,
  }).asPromise();
});
beforeEach(() => {
  users = connection.db.collection(`users_${new mongoose.Types.ObjectId()}`);
});
afterAll(async () => {
  await connection?.close();
  await mongo?.stop();
});

async function legacyUsers() {
  await users.createIndex({ email: 1 }, { unique: true, name: 'email_1' });
  await users.createIndex({ fullName: 1 }, { name: 'custom_name_index' });
  await users.insertOne({ email: 'legacy@example.com', passwordHash: 'preserved-hash' });
}

describe('identity indexes at server startup', () => {
  it('starts the production HTTP server against a legacy database without changing accounts', async () => {
    const database = `startup_${new mongoose.Types.ObjectId()}`;
    const collection = connection.getClient().db(database).collection('users');
    await collection.createIndex({ email: 1 }, { unique: true, name: 'email_1' });
    await collection.createIndex({ legacyMarker: 1 }, { name: 'custom_legacy_index' });
    await collection.insertOne({ email: 'legacy@example.com', passwordHash: 'preserved-hash' });
    const before = await collection.find({}).toArray();
    const portServer = createServer();
    portServer.listen(0, '127.0.0.1');
    await once(portServer, 'listening');
    const port = portServer.address().port;
    await new Promise((resolve) => portServer.close(resolve));
    const child = spawn(process.execPath, ['src/server.js'], {
      cwd: new URL('../', import.meta.url),
      env: {
        ...process.env,
        NODE_ENV: 'production', PORT: String(port), MONGODB_URI: mongo.getUri(database),
        AUTH_JWT_SECRET: 'startup-test-auth-secret-over-thirty-two-characters',
        SETTINGS_ENCRYPTION_KEY: 'startup-test-encryption-key',
        TELEGRAM_WEBHOOK_SECRET: 'startup-test-webhook-secret',
        BROADCAST_WORKER_EMBEDDED: 'false', SLICKPAY_ENABLED: 'false', META_CAPI_ENABLED: 'false',
        ORBIT_TELEGRAM_BOT_TOKEN: '', DZEVENT_API_KEY: '', RESEND_API_KEY: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      await new Promise((resolve, reject) => {
        let output = '';
        const timer = setTimeout(() => reject(new Error(`Startup timed out: ${output}`)), 20000);
        child.stdout.on('data', (chunk) => {
          output += chunk;
          if (output.includes('Orbit API listening')) { clearTimeout(timer); resolve(); }
        });
        child.stderr.on('data', (chunk) => { output += chunk; });
        child.once('error', (error) => { clearTimeout(timer); reject(error); });
        child.once('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`Server exited ${code}: ${output}`));
        });
      });
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(response.status).toBe(200);
      expect((await response.json()).data.status).toBe('ok');
      expect(await collection.find({}).toArray()).toEqual(before);
      await expect(assertUserIdentityIndexes(collection)).resolves.toBeUndefined();
      expect((await collection.indexes()).map((index) => index.name)).toContain('custom_legacy_index');
    } finally {
      if (child.exitCode === null) {
        const exited = once(child, 'exit');
        child.kill();
        await exited;
      }
    }
  });

  it('initializes a new database and enforces both identities while allowing missing values', async () => {
    await ensureUserIdentityIndexes(users);
    await expect(assertUserIdentityIndexes(users)).resolves.toBeUndefined();
    await users.insertMany([
      { email: 'one@example.com' },
      { email: 'two@example.com' },
      { phone: '+213550123456' },
      { phone: '+213550123457' },
    ]);
    await expect(users.insertOne({ email: 'one@example.com' })).rejects.toMatchObject({ code: 11000 });
    await expect(users.insertOne({ phone: '+213550123456' })).rejects.toMatchObject({ code: 11000 });
  });

  it.each([false, true])('upgrades legacy email indexes with additive indexes already present: %s', async (alreadyBuilt) => {
    await legacyUsers();
    if (alreadyBuilt) {
      for (const { field, name } of identityIndexes) {
        await users.createIndex({ [field]: 1 }, {
          name, unique: true, partialFilterExpression: { [field]: { $type: 'string' } },
        });
      }
    }
    const before = await users.find({}).toArray();
    await ensureUserIdentityIndexes(users);
    await expect(assertUserIdentityIndexes(users)).resolves.toBeUndefined();
    expect(await users.find({}).toArray()).toEqual(before);
    const names = (await users.indexes()).map((index) => index.name);
    expect(names).toContain('custom_name_index');
    expect(names).not.toContain('email_1');
    await users.insertMany([{ phone: '+213550123456' }, { phone: '+213550123457' }]);
  });

  it('skips account scanning and index changes on subsequent starts', async () => {
    await ensureUserIdentityIndexes(users);
    const find = vi.spyOn(users, 'find');
    const create = vi.spyOn(users, 'createIndex');
    const drop = vi.spyOn(users, 'dropIndex');
    await ensureUserIdentityIndexes(users);
    expect(find).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(drop).not.toHaveBeenCalled();
  });

  it.each([
    [{ email: 'other@example.com', phone: '0550123456' }],
    [{ email: 'other@example.com', phone: 'invalid' }],
    [{ email: 'UPPER@example.com' }],
    [{ email: 'other@example.com', phone: '+213550123456' }, { email: 'third@example.com', phone: '+213550123456' }],
  ])('requires manual migration for data needing review: %j', async (...documents) => {
    await legacyUsers();
    await users.insertMany(documents);
    const before = await users.find({}).toArray();
    const indexes = await users.indexes();
    await expect(ensureUserIdentityIndexes(users)).rejects.toThrow('migrate:identities');
    expect(await users.find({}).toArray()).toEqual(before);
    expect(await users.indexes()).toEqual(indexes);
  });

  it('refuses unrecognized unique identity indexes without removing them', async () => {
    await legacyUsers();
    await users.createIndex({ email: 1, status: 1 }, { unique: true, name: 'custom_email_status' });
    const before = await users.indexes();
    await expect(ensureUserIdentityIndexes(users)).rejects.toThrow('manual review');
    expect(await users.indexes()).toEqual(before);
  });

  it('retains the old constraint if the phone index build fails after the email build succeeds', async () => {
    await legacyUsers();
    const createIndex = users.createIndex.bind(users);
    vi.spyOn(users, 'createIndex').mockImplementation((key, options) => {
      if (key.phone) throw new Error('Simulated phone index build failure');
      return createIndex(key, options);
    });
    await expect(ensureUserIdentityIndexes(users)).rejects.toThrow('phone index build failure');
    expect((await users.indexes()).map((index) => index.name)).toContain('email_1');
    await expect(users.insertOne({ email: 'legacy@example.com' })).rejects.toMatchObject({ code: 11000 });
  });

  it('allows simultaneous startup upgrades', async () => {
    await legacyUsers();
    await Promise.all([ensureUserIdentityIndexes(users), ensureUserIdentityIndexes(users)]);
    await expect(assertUserIdentityIndexes(users)).resolves.toBeUndefined();
  });

  it('does not mistake an index-listing failure for an empty database', async () => {
    vi.spyOn(users, 'indexes').mockRejectedValue(new Error('Database unavailable'));
    await expect(ensureUserIdentityIndexes(users)).rejects.toThrow('Database unavailable');
  });
});
