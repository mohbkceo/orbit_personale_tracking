export const success = (res, data, status = 200, extra = {}) =>
  res.status(status).json({ success: true, data, ...extra });
