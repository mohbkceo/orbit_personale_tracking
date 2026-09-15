import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/orbit_personal_os'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  SETTINGS_ENCRYPTION_KEY: z.string().min(16).default('development-only-change-this-key'),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(8).default('development-webhook-secret'),
  APP_BASE_URL: z.string().default('http://localhost:5000'),
});

export const env = schema.parse(process.env);
