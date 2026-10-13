import express, { type Express } from 'express';
import cors from 'cors';
import { config } from './config.js';
import healthRoutes from './routes/healthRoutes.js';
import jobRoutes from './routes/jobRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app: Express = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use('/api/health', healthRoutes);
app.use('/api', jobRoutes);

app.use(errorHandler);

export default app;
