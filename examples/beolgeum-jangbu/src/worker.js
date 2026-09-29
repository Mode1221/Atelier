// Cloudflare Workers 진입점
import { createApp, scheduled } from './app.js';

const app = createApp();
export default {
  fetch: (req, env, ctx) => app.fetch(req, env, ctx),
  scheduled: (_event, env, ctx) => ctx.waitUntil(scheduled(env)),
};
