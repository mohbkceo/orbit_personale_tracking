import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { Admin } from '../models/Admin.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const cookieOptions = { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/' };

export const normalizeEmail = (email) => String(email).trim().toLowerCase();
export const hashPassword = (password) => bcrypt.hash(password, 12);
export const safeIdentity = (person) => ({ id: String(person._id), fullName: person.fullName, email: person.email, ...(person.role ? { role: person.role } : {}), status: person.status });

export function issueCookie(res, person, type) {
  const isAdmin = type === 'admin';
  const name = isAdmin ? 'orbit_admin' : 'orbit_user';
  const token = jwt.sign({ sub: String(person._id), type }, env.AUTH_JWT_SECRET, { expiresIn: isAdmin ? '12h' : '7d', issuer: 'orbit' });
  res.cookie(name, token, { ...cookieOptions, maxAge: isAdmin ? 12 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000 });
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
  return person;
}

export async function login(email, password, type) {
  const Model = type === 'admin' ? Admin : User;
  const person = await Model.findOne({ email: normalizeEmail(email) }).select('+passwordHash');
  if (!person || !(await bcrypt.compare(password, person.passwordHash)) || (type === 'admin' && person.status !== 'ACTIVE')) throw new AppError('Invalid email or password', 401, undefined, 'INVALID_CREDENTIALS');
  person.lastLoginAt = new Date();
  await person.save();
  return person;
}
