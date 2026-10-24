import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { Admin } from '../models/Admin.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { AuthSession } from '../models/AuthSession.js';

const cookieOptions = { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/' };

export const normalizeEmail = (email) => String(email).trim().toLowerCase();
export const hashPassword = (password) => bcrypt.hash(password, 12);
export const safeIdentity = (person) => ({ id: String(person._id), fullName: person.fullName, email: person.email, ...(!person.role ? { gender: person.gender || null } : { role: person.role }), status: person.status });

export const sessionHash = (id) => crypto.createHash('sha256').update(id).digest('hex');

export async function issueCookie(res, person, type, req) {
  const isAdmin = type === 'admin';
  const name = isAdmin ? 'orbit_admin' : 'orbit_user';
  const jti = crypto.randomBytes(32).toString('base64url');
  const maxAge = isAdmin ? 12 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  if (!isAdmin) await AuthSession.create({ user: person._id, tokenHash: sessionHash(jti), expiresAt: new Date(Date.now() + maxAge), ip: req?.ip, userAgent: String(req?.get?.('User-Agent') || '').slice(0, 200) });
  const token = jwt.sign({ sub: String(person._id), type, jti, av: person.authVersion || 0 }, env.AUTH_JWT_SECRET, { expiresIn: isAdmin ? '12h' : '7d', issuer: 'orbit' });
  res.cookie(name, token, { ...cookieOptions, maxAge });
}

export function clearCookie(res, type) {
  res.clearCookie(type === 'admin' ? 'orbit_admin' : 'orbit_user', cookieOptions);
}

export async function authenticateCookie(req, type) {
  const token = req.cookies?.[type === 'admin' ? 'orbit_admin' : 'orbit_user'];
  if (!token) throw new AppError('Authentication required', 401, undefined, 'AUTH_REQUIRED');
  let payload;
  try { payload = jwt.verify(token, env.AUTH_JWT_SECRET, { issuer: 'orbit' }); } catch { throw new AppError('Authentication required', 401, undefined, 'AUTH_REQUIRED'); }
  if (payload.type !== type) throw new AppError('Authentication required', 401, undefined, 'AUTH_REQUIRED');
  const person = await (type === 'admin' ? Admin : User).findById(payload.sub);
  if (!person || (type === 'admin' && person.status !== 'ACTIVE')) throw new AppError('Authentication required', 401, undefined, 'AUTH_REQUIRED');
  if (!person.role) {
    if ((payload.av || 0) !== (person.authVersion || 0)) throw new AppError('Session revoked', 401, undefined, 'SESSION_REVOKED');
    if (payload.jti && !(await AuthSession.exists({ user: person._id, tokenHash: sessionHash(payload.jti), revokedAt: null, expiresAt: { $gt: new Date() } }))) throw new AppError('Session revoked', 401, undefined, 'SESSION_REVOKED');
  }
  return person;
}

export async function revokeCurrentSession(req) {
  const token = req.cookies?.orbit_user;
  if (!token) return;
  try {
    const payload = jwt.verify(token, env.AUTH_JWT_SECRET, { issuer: 'orbit' });
    if (payload.type === 'user' && payload.jti) await AuthSession.updateOne({ user: payload.sub, tokenHash: sessionHash(payload.jti) }, { $set: { revokedAt: new Date() } });
  } catch { /* An invalid cookie has nothing to revoke. */ }
}

export async function login(email, password, type) {
  const Model = type === 'admin' ? Admin : User;
  const person = await Model.findOne({ email: normalizeEmail(email) }).select('+passwordHash');
  if (!person || !(await bcrypt.compare(password, person.passwordHash)) || (type === 'admin' && person.status !== 'ACTIVE')) throw new AppError('Invalid email or password', 401, undefined, 'INVALID_CREDENTIALS');
  person.lastLoginAt = new Date();
  await person.save();
  return person;
}
