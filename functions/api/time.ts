import { createTimeResponse } from '../../server/timeEndpoint';

export function onRequest({ request }: { request: Request }) {
  return createTimeResponse(request);
}
