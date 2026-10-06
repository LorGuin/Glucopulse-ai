import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleGeminiRequest } from '../server/gemini.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }
  const result = await handleGeminiRequest(req.body || {}, req.headers.authorization);
  return res.status(result.status).json(result.body);
}
