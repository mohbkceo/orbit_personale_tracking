export const EVENTS = Object.freeze({
  PAGE_VIEWED: 'page_viewed',
  SIGNUP_STARTED: 'signup_started',
  REGISTRATION_COMPLETED: 'registration_completed',
  CONTACT_STARTED: 'contact_started',
  LEAD_CREATED: 'lead_created',
  ACCESS_ACTIVATED: 'access_activated',
  CHECKOUT_STARTED: 'checkout_started',
  PAYMENT_INITIATED: 'payment_initiated',
  PAYMENT_CONFIRMED: 'payment_confirmed',
  PAYMENT_FAILED: 'payment_failed',
  PAID_SUBSCRIPTION_ACTIVATED: 'paid_subscription_activated',
  TASK_CREATED: 'task_created',
  TASK_COMPLETED: 'task_completed',
  PROJECT_CREATED: 'project_created',
});
export const WEB_EVENT_NAMES = Object.freeze([EVENTS.PAGE_VIEWED, EVENTS.SIGNUP_STARTED]);
