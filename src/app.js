import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase } from './db/database.js';
import { createExpressRouter } from './http/expressAdapter.js';
import { html } from './http/response.js';
import { registerAuthRoutes } from './routes/authRoutes.js';
import { registerDashboardRoutes } from './routes/dashboardRoutes.js';
import { registerBudgetRoutes } from './routes/budgetRoutes.js';
import { registerTransactionRoutes } from './routes/transactionRoutes.js';
import { registerSavingsRoutes } from './routes/savingsRoutes.js';
import { registerForecastRoutes } from './routes/forecastRoutes.js';
import { registerCsvRoutes } from './routes/csvRoutes.js';
import { registerSettingsRoutes } from './routes/settingsRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = getDatabase();
const app = express();
const router = createExpressRouter(app, db);

app.disable('x-powered-by');
app.set('trust proxy', true);

app.use((req, res, next) => {
  const ingressPath = normaliseIngressPath(req.get('x-ingress-path'));
  res.locals.ingressPath = ingressPath;

  if (ingressPath && req.url.startsWith(`${ingressPath}/`)) {
    req.url = req.url.slice(ingressPath.length) || '/';
  } else if (ingressPath && req.url === ingressPath) {
    req.url = '/';
  }

  next();
});

app.use((req, res, next) => {
  const frameAncestors = res.locals.ingressPath ? "'self'" : "'none'";
  res.setHeader('Content-Security-Policy', `default-src 'self'; style-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors ${frameAncestors}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

const staticAssetMaxAge = process.env.NODE_ENV === 'production' ? '5m' : 0;
app.use('/assets', express.static(path.join(__dirname, 'assets'), { maxAge: staticAssetMaxAge }));
app.use('/vendor/echarts', express.static(path.join(__dirname, '..', 'node_modules', 'echarts', 'dist'), { maxAge: staticAssetMaxAge }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

registerAuthRoutes(router, db);
registerDashboardRoutes(router, db);
registerBudgetRoutes(router, db);
registerTransactionRoutes(router, db);
registerSavingsRoutes(router, db);
registerForecastRoutes(router, db);
registerCsvRoutes(router, db);
registerSettingsRoutes(router, db);

app.use((req, res) => {
  html(res, '<h1>Not found</h1>', 404);
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  return html(
    res,
    '<!doctype html><html><body><h1>Something went wrong</h1><p>The request could not be completed.</p></body></html>',
    500
  );
});

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const server = app.listen(port, host, () => {
  const address = server.address();
  const resolvedPort =
    address && typeof address === 'object' && 'port' in address ? address.port : port;
  const resolvedHost =
    address && typeof address === 'object' && 'address' in address ? address.address : host;
  console.log(`UK Household Budget app listening on http://${resolvedHost}:${resolvedPort}`);
});

server.on('error', (error) => {
  console.error('Failed to start UK Household Budget app');
  console.error(error);
  process.exitCode = 1;
});

server.on('close', () => {
  console.error('UK Household Budget app server closed.');
});

export { app, server };

function normaliseIngressPath(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '/') return '';
  return `/${raw.replace(/^\/+|\/+$/g, '')}`;
}
