import { createApp } from './app.mjs';
import { createServiceRuntime } from '../scripts/provider-runtime.mjs';

const app = createApp(createServiceRuntime({ live: true }));
const port = Number(process.env.PORT || 8787);
const server = app.listen(port,'127.0.0.1',() => { console.log(`GSPEC API: http://127.0.0.1:${port}`); });
function shutdown() {
  for (const run of app.locals.engine.runs.values()) app.locals.engine.cancel(run);
  server.close(() => process.exit(0));
}
process.on('SIGINT',shutdown);
process.on('SIGTERM',shutdown);
