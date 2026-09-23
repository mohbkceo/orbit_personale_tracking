import axios from 'axios';

export const api = axios.create({ baseURL: '/api', timeout: 15000, withCredentials: true, headers: { 'Content-Type': 'application/json' } });
api.interceptors.response.use((response) => response.data, (error) => {
  const failure = new Error(error.response?.data?.message || error.message || 'Something went wrong');
  failure.code = error.response?.data?.code;
  failure.status = error.response?.status;
  failure.errors = error.response?.data?.errors;
  if (failure.code === 'ACCESS_EXPIRED' || failure.code === 'ACCESS_REQUIRED' || failure.code === 'USER_SUSPENDED') window.dispatchEvent(new Event('orbit:access-changed'));
  const path = String(error.config?.url || '');
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
