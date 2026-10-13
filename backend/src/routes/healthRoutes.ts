import { Router, type Request, type Response } from 'express';
import { strandsAgent } from '../clients/strandsAgentClient.js';
import { documentEngine } from '../clients/documentEngineClient.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const [agent, engine] = await Promise.all([strandsAgent.health(), documentEngine.health()]);
  res.json({
    status: 'healthy',
    service: 'backend',
    dependencies: {
      strandsAgentReachable: agent,
      documentEngineReachable: engine,
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
