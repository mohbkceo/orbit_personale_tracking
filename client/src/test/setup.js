import { beforeEach } from 'vitest';
import i18n from '../i18n/index.js';

beforeEach(async () => { await i18n.changeLanguage('en'); });
