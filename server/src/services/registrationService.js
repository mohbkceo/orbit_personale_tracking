import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Setting } from '../models/Setting.js';
import { hashPassword, normalizeEmail } from './authService.js';
import { audit } from './auditService.js';
import { AppError } from '../utils/AppError.js';
import { captureConversionContext, claimRegistrationContext, recordDurableConversion } from '../analytics/analyticsService.js';
import { EVENTS } from '../analytics/events.js';

export async function registerPublic(input, req, res) {
  const email = normalizeEmail(input.email);
  if (await User.exists({ email })) throw new AppError('An account with this email already exists. Please sign in.', 409, undefined, 'ACCOUNT_EXISTS');
  const user = new User({ fullName: input.fullName, email, passwordHash: await hashPassword(input.password), firstUseOnboarding: { status: 'NOT_STARTED', step: 'welcome', autoPresent: true } });
  const context = await captureConversionContext(req, res, user, undefined, { newAccount: true });
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await User.create([user.toObject()], { session });
      await Setting.create([{ user: user._id, defaultCurrency: 'DZD', language: input.language || 'en' }], { session });
      await audit('USER_CREATED', { actorType: 'USER', actorId: user._id, targetType: 'User', targetId: user._id, session });
      const claimedContext = await claimRegistrationContext(context, user._id, session);
      await recordDurableConversion(EVENTS.REGISTRATION_COMPLETED, `registration:${user._id}`, user._id, claimedContext, {}, session);
    });
  } catch (error) {
    if (error.code === 11000) throw new AppError('An account with this email already exists. Please sign in.', 409, undefined, 'ACCOUNT_EXISTS');
    throw error;
  } finally { await session.endSession(); }
  return user;
}
