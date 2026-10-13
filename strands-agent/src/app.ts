import express, { type Express } from 'express';
import cors from 'cors';
import agentRoutes from './routes/agentRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app: Express = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/api', agentRoutes);

app.use(errorHandler);

export default app;
