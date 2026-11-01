import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { z } from 'zod';
import { AppError } from './AppError.js';

export function normalizePhone(value) {
  if (typeof value !== 'string' || value.length > 64)
    throw new AppError(
      'Enter a valid phone number, including its country code outside Algeria.',
      422,
      undefined,
      'INVALID_PHONE',
    );
  let input = value
    .trim()
    .replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) - (digit <= '٩' ? 0x660 : 0x6f0)));
  if (!/^\+?[\d\s().-]+$/.test(input))
    throw new AppError('Enter a valid phone number.', 422, undefined, 'INVALID_PHONE');
  if (input.startsWith('00')) input = `+${input.slice(2)}`;
  const phone = parsePhoneNumberFromString(input, { defaultCountry: 'DZ', extract: false });
  if (!phone?.isValid() || phone.ext)
    throw new AppError('Enter a valid phone number.', 422, undefined, 'INVALID_PHONE');
  return phone.number;
}

export const phoneInput = z
  .string()
  .min(1)
  .max(64)
  .transform((value, ctx) => {
    try {
      return normalizePhone(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number.' });
      return z.NEVER;
    }
  });
export const emailInput = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const registrationFields = {
  fullName: z.string().trim().min(2).max(120),
  phone: phoneInput,
  // Optional for integrations; every new signup still requires a phone.
  email: emailInput.optional(),
  password: z.string().min(12).max(200),
};

export function identityQuery(identifier) {
  if (typeof identifier !== 'string' || !identifier.trim() || identifier.length > 254)
    throw new AppError('Enter an email or phone number.', 422, undefined, 'INVALID_IDENTIFIER');
  if (identifier.includes('@')) {
    const email = emailInput.safeParse(identifier);
    if (!email.success)
      throw new AppError('Enter a valid email address.', 422, undefined, 'INVALID_IDENTIFIER');
    return { email: email.data };
  }
  return { phone: normalizePhone(identifier) };
}

export const userLoginInput = z
  .strictObject({
    identifier: z.string().min(1).max(254).optional(),
    email: emailInput.optional(),
    phone: phoneInput.optional(),
    password: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    const queries = [];
    try {
      if (value.identifier !== undefined) queries.push(identityQuery(value.identifier));
      if (value.email !== undefined) queries.push({ email: value.email });
      if (value.phone !== undefined) queries.push({ phone: value.phone });
      if (
        !queries.length ||
        queries.some((query) => JSON.stringify(query) !== JSON.stringify(queries[0]))
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['identifier'],
          message: 'Supply one consistent email or phone identity.',
        });
      }
    } catch (error) {
      ctx.addIssue({ code: 'custom', path: ['identifier'], message: error.message });
    }
  });

export function registrationIdentity(input) {
  const phone = normalizePhone(input.phone);
  const email = input.email === undefined ? undefined : emailInput.parse(input.email);
  return { phone, ...(email ? { email } : {}) };
}

export const accountExists = () =>
  new AppError(
    'An account with this identity already exists. Please sign in.',
    409,
    undefined,
    'ACCOUNT_EXISTS',
  );
