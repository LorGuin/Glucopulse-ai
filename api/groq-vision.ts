import type { VercelRequest, VercelResponse } from '@vercel/node';

// Corre en el servidor de Vercel, nunca en el navegador. GROQ_API_KEY es una
// variable de entorno SIN prefijo VITE_, así que nunca queda en el bundle.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Falta GROQ_API_KEY en las variables de entorno del servidor' });
  }

  const { imageDataUrl, prompt } = (req.body || {}) as { imageDataUrl?: string; prompt?: string };
  if (!imageDataUrl || !prompt) {
    return res.status(400).json({ error: 'Faltan imageDataUrl o prompt en el body' });
  }

  try {
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        // Si Groq da error "model not found", revisá el nombre vigente en
        // https://console.groq.com/docs/vision (los modelos de visión
        // preview de Groq cambian seguido) y reemplazalo acá.
        model: 'qwen/qwen3.6-27b',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: imageDataUrl },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!groqResponse.ok) {
      const errorData = await groqResponse.json().catch(() => ({}));
      return res
        .status(groqResponse.status)
        .json({ error: errorData.error?.message || `Error en Groq (${groqResponse.status})` });
    }

    const data = await groqResponse.json();
    const text = data.choices?.[0]?.message?.content || '{}';
    return res.status(200).json({ text });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error interno al llamar a Groq' });
  }
}
