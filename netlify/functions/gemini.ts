import type { Handler } from '@netlify/functions';
import { handleGeminiRequest } from '../../server/gemini.js';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido' }) };
  }
  let body: unknown = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }
  const result = await handleGeminiRequest(body, event.headers.authorization || event.headers.Authorization);
  return {
    statusCode: result.status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result.body),
  };
};
