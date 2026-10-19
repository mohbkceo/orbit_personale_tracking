import axios from 'axios';
import { meta } from '../analytics/meta.js';
import i18n from '../i18n/index.js';

export const api = axios.create({ baseURL: '/api', timeout: 15000, withCredentials: true, headers: { 'Content-Type': 'application/json' } });
api.interceptors.request.use((config) => { Object.assign(config.headers, meta.headers()); return config; });
api.interceptors.response.use((response) => response.data, (error) => {
  const failure = new Error(error.response?.data?.message || error.message || 'Something went wrong');
  failure.code = error.response?.data?.code;
  failure.status = error.response?.status;
  failure.errors = error.response?.data?.errors;
  failure.responseData = error.response?.data;
  const path = String(error.config?.url || '');
  if (!path.startsWith('/admin/') && i18n.resolvedLanguage === 'ar') {
    const codeKeys = { ACCOUNT_EXISTS: 'accountExists', ACCESS_EXPIRED: 'accessExpired', ACCESS_REQUIRED: 'accessRequired', USER_SUSPENDED: 'suspended', FEATURE_NOT_INCLUDED: 'featureUpgrade', FEATURE_DISABLED: 'featureDisabled', FEATURE_LIMIT_EXCEEDED: 'limit', INTERNAL_ERROR: 'internal' };
    const key = codeKeys[failure.code] || (failure.status === 404 ? 'notFound' : failure.status === 400 || failure.status === 422 ? 'validation' : 'internal');
    failure.message = i18n.t(`errors:${key}`);
  }
  if (failure.code === 'ACCESS_EXPIRED' || failure.code === 'ACCESS_REQUIRED' || failure.code === 'USER_SUSPENDED') window.dispatchEvent(new Event('orbit:access-changed'));
  if (failure.status === 401 && !path.startsWith('/auth/') && !path.startsWith('/admin/auth/')) window.dispatchEvent(new Event('orbit:auth-changed'));
  return Promise.reject(failure);
});

export const endpoints = {
  dashboard: () => Promise.all([api.get('/dashboard/summary'), api.get('/dashboard/charts')]).then(([summary, charts]) => ({ ...summary.data, charts: charts.data })),
  list: (resource, params) => api.get(`/${resource}`, { params }),
  create: (resource, data) => api.post(`/${resource}`, data),
  update: (resource, id, data) => api.patch(`/${resource}/${id}`, data),
  remove: (resource, id) => api.delete(`/${resource}/${id}`),
};
