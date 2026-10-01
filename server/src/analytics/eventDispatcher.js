const providers = [];

export function registerAnalyticsProvider(provider) { providers.push(provider); }
export async function dispatchAnalyticsEvents(events) {
  await Promise.allSettled(providers.map((provider) => Promise.resolve().then(() => provider.send(events))));
}
