import express from 'express';
import accountsRouter from './routes/accounts.js';
import transfersRouter from './routes/transfers.js';
import { errorHandler, notFound } from './middleware/errors.js';

const app = express();
app.use(express.json({ limit: '100kb' }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/accounts', accountsRouter);
app.use('/api/transfers', transfersRouter);
app.use(notFound);
app.use(errorHandler);
export default app;
