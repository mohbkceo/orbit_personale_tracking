import { describe, expect, it } from 'vitest';
import { whatsappUrl } from '../../client/src/marketing/whatsapp.js';

describe('WhatsApp purchase link', () => {
  it('uses configured values and URL encodes the message', () => {
    expect(
      whatsappUrl({ whatsappNumber: '+213 555 123 456', whatsappMessage: 'Hello, Orbit & me?' }),
    ).toBe('https://wa.me/213555123456?text=Hello%2C%20Orbit%20%26%20me%3F');
  });
  it('never creates malformed links when configuration is incomplete', () => {
    expect(whatsappUrl(null)).toBeNull();
    expect(whatsappUrl({ whatsappNumber: '', whatsappMessage: 'Hello' })).toBeNull();
    expect(whatsappUrl({ whatsappNumber: '123', whatsappMessage: 'Hello' })).toBeNull();
    expect(whatsappUrl({ whatsappNumber: '213555123456', whatsappMessage: '' })).toBeNull();
    expect(whatsappUrl({ whatsappNumber: '213555123456', whatsappMessage: 'Hello', whatsappEnabled: false })).toBeNull();
  });
});
