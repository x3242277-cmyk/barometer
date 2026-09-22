// Netlify Functions v2 adapter: same handler used by the local dev server
// and the Cloudflare Worker (see ../../server/worker.mjs). Standard
// Request/Response, so no translation layer is needed here.
import { createPollCheckHandler } from '../../server/poll-check.mjs';

const checkPolls = createPollCheckHandler();

export default (request) => checkPolls(request);

export const config = { path: '/api/polls/check' };
