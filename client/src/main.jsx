import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';
import { analytics } from './analytics/client.js';
import i18n from './i18n/index.js';

document.documentElement.lang = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en';
document.documentElement.dir = i18n.resolvedLanguage === 'ar' ? 'rtl' : 'ltr';

void analytics.start();

createRoot(document.getElementById('root')).render(<StrictMode><BrowserRouter><App/></BrowserRouter></StrictMode>);
