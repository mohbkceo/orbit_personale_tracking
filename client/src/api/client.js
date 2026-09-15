import axios from 'axios';

export const api = axios.create({ baseURL: '/api', timeout: 15000, headers: { 'Content-Type': 'application/json' } });
api.interceptors.response.use((response) => response.data, (error) => Promise.reject(new Error(error.response?.data?.message || error.message || 'Something went wrong')));

export const endpoints = {
  dashboard: () => Promise.all([api.get('/dashboard/summary'), api.get('/dashboard/charts')]).then(([summary, charts]) => ({ ...summary.data, charts: charts.data })),
  list: (resource, params) => api.get(`/${resource}`, { params }),
  create: (resource, data) => api.post(`/${resource}`, data),
  update: (resource, id, data) => api.patch(`/${resource}/${id}`, data),
  remove: (resource, id) => api.delete(`/${resource}/${id}`),
};
