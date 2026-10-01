import { count, percent } from './state.js';

export const performanceColumns = [
  { key: 'value', label: 'Dimension' },
  { key: 'visitors', label: 'Visitors', numeric: true, render: (row) => count(row.visitors) },
  { key: 'sessions', label: 'Sessions', numeric: true, render: (row) => count(row.sessions) },
  { key: 'leads', label: 'Leads', numeric: true, render: (row) => count(row.leads) },
  {
    key: 'registrations',
    label: 'Registrations',
    numeric: true,
    render: (row) => count(row.registrations),
  },
  {
    key: 'conversions',
    label: 'Conversions',
    numeric: true,
    render: (row) => count(row.conversions),
  },
  {
    key: 'rate',
    label: 'Conversions / visitors',
    numeric: true,
    sortValue: (row) => (row.visitors ? row.conversions / row.visitors : 0),
    render: (row) => (row.visitors ? percent(row.conversions / row.visitors) : '—'),
  },
];
