export class AppError extends Error {
  constructor(message, status = 400, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}
