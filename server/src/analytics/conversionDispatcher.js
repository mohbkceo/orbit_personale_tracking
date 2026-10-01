const providers = [];

export function registerConversionProvider(provider) { providers.push(provider); }
export async function dispatchConversion(event) {
  await Promise.allSettled(providers.map((provider) => Promise.resolve().then(() => provider.send(event))));
}
