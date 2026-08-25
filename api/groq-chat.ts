import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Falta GROQ_API_KEY en las variables de entorno del servidor' });
  }

  const { userQuery, systemPrompt } = (req.body || {}) as { userQuery?: string; systemPrompt?: string };
  if (!userQuery) {
    return res.status(400).json({ error: 'Falta userQuery en el body' });
  }

  try {
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: systemPrompt || '' },
          { role: 'user', content: userQuery },
        ],
        temperature: 0.3,
      }),
    });

    if (!groqResponse.ok) {
      const errorData = await groqResponse.json().catch(() => ({}));
      return res
        .status(groqResponse.status)
        .json({ error: errorData.error?.message || `Error en Groq (${groqResponse.status})` });
    }

    const data = await groqResponse.json();
    const text = data.choices?.[0]?.message?.content?.trim() || 'No se obtuvo respuesta del modelo.';
    return res.status(200).json({ text });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error interno al llamar a Groq' });
  }
}
