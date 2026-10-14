import express, { type Express } from 'express';
import cors from 'cors';
import { config } from './config.js';
import healthRoutes from './routes/healthRoutes.js';
import jobRoutes from './routes/jobRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app: Express = express();

// CORS: allow any origin in the configured allowlist. '*' allows all. A Cloud
// Run service has multiple valid hostnames (<hash>-<region>.run.app and
// <project-number>.<region>.run.app), so the allowlist must accept each one and
// REFLECT the matching origin back (required when credentials/auth headers are
// used). Requests with no Origin (same-origin, curl, health checks) are allowed.
const allowAllOrigins = config.corsOrigins.includes('*');
app.use(
  cors({
    origin(origin, callback) {
      if (allowAllOrigins || !origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use('/api/health', healthRoutes);
app.use('/api', jobRoutes);

app.use(errorHandler);

export default app;
