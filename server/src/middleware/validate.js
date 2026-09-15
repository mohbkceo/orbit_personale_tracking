export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: result.error.flatten().fieldErrors,
    });
  }
  req[source] = result.data;
  next();
};
