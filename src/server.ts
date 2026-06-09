import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testConnection } from './database/supabaseClient';
import authRoutes from './api/routes/auth.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err: any, req: express.Request, res: express.Response) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

async function start() {
  const connected = await testConnection();
  if (!connected) {
    console.error('No se pudo conectar a Supabase');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Backend corriendo en http://localhost:${PORT}\n`);
  });
}

start().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
