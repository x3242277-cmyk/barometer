import { createPollCheckHandler } from './poll-check.mjs';
const checkPolls = createPollCheckHandler();
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/api/polls/check') return checkPolls(request);
    return env.ASSETS.fetch(request);
  }
};
