export const TIME_PROTOCOL_VERSION = 1;

export const TIME_SYNC_RULES = {
  endpoint: '/api/time',
  timeoutMs: 5000,
  refreshMs: 60000,
  retryMs: 15000,
};

export interface ServerTimeMessage {
  version: number;
  now: number;
  requestId: string;
}
