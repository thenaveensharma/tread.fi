import bitgetFeed from './bitget';
import taasFeed from './taas';

const registry = {};

export function registerExchange(key, adapter) {
  if (!key || !adapter) return;
  registry[String(key).toUpperCase()] = adapter;
}

export function getExchangeFeed(exchangeCode) {
  if (!exchangeCode) return taasFeed;
  return registry[String(exchangeCode).toUpperCase()] || taasFeed;
}

// Built-in adapters
registerExchange('BITGET', bitgetFeed);

export default registry;
