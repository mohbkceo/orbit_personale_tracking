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
  AUTH_JWT_SECRET: z.string().min(32).default('development-auth-secret-change-this-before-production'),
  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default(''),
  ORBIT_TELEGRAM_BOT_TOKEN: z.string().default(''),
  ORBIT_TELEGRAM_BOT_USERNAME: z.string().default(''),
  DZEVENT_API_KEY: z.string().default(''),
  ANALYTICS_REQUIRE_CONSENT: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  META_PIXEL_ID: z.literal('1432887715641697').default('1432887715641697'),
  META_CAPI_ACCESS_TOKEN: z.string().default(''),
  META_CAPI_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  META_CAPI_TEST_EVENT_CODE: z.string().default(''),
  META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.0$/).default('v26.0'),
  SLICKPAY_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  SLICKPAY_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  SLICKPAY_API_KEY: z.string().default(''),
  SLICKPAY_RETURN_URL: z.string().default(''),
  SLICKPAY_WEBHOOK_URL: z.string().default(''),
  SLICKPAY_CONTRACT_VERIFIED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

export const env = schema.parse(process.env);
if (env.NODE_ENV === 'production' && env.AUTH_JWT_SECRET === 'development-auth-secret-change-this-before-production') throw new Error('AUTH_JWT_SECRET must be configured in production');
if (env.NODE_ENV === 'production' && env.SETTINGS_ENCRYPTION_KEY === 'development-only-change-this-key') throw new Error('SETTINGS_ENCRYPTION_KEY must be configured in production');
if (env.NODE_ENV === 'production' && env.TELEGRAM_WEBHOOK_SECRET === 'development-webhook-secret') throw new Error('TELEGRAM_WEBHOOK_SECRET must be configured in production');
