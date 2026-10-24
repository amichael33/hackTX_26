import 'dotenv/config';
import { createApp } from './app.js';

const app = createApp({
  serpApiKey: process.env.SERPAPI_KEY,
  demoMode: process.env.DEMO_MODE === '1',
  serveStatic: process.env.NODE_ENV !== 'production',
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`store server listening on :${port}`));
