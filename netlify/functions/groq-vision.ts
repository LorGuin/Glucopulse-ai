import type { Handler } from '@netlify/functions';

// Corre en Netlify Functions (servidor), nunca en el navegador. GROQ_API_KEY
// es una variable de entorno del sitio en Netlify, sin prefijo VITE_, así
// que nunca queda en el bundle del cliente.

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Falta GROQ_API_KEY en las variables de entorno del servidor' }),
    };
  }

  const { imageDataUrl, prompt } = JSON.parse(event.body || '{}') as {
    imageDataUrl?: string;
    prompt?: string;
  };
  if (!imageDataUrl || !prompt) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Faltan imageDataUrl o prompt en el body' }) };
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
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!groqResponse.ok) {
      const errorData = await groqResponse.json().catch(() => ({}));
      return {
        statusCode: groqResponse.status,
        body: JSON.stringify({ error: errorData.error?.message || `Error en Groq (${groqResponse.status})` }),
      };
    }

    const data = await groqResponse.json();
    const text = data.choices?.[0]?.message?.content || '{}';
    return { statusCode: 200, body: JSON.stringify({ text }) };
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Error interno al llamar a Groq' }) };
  }
};
