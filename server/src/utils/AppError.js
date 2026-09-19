export class AppError extends Error {
  constructor(message, status = 400, errors, code) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.code = code;
  }
}
