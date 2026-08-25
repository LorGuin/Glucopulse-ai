import type { Handler } from '@netlify/functions';

// Corre en Netlify Functions (servidor), nunca en el navegador. GROQ_API_KEY
// es una variable de entorno del sitio en Netlify (Site settings > Environment
// variables), sin prefijo VITE_, así que nunca queda en el bundle del cliente.

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

  const { userQuery, systemPrompt } = JSON.parse(event.body || '{}') as {
    userQuery?: string;
    systemPrompt?: string;
  };
  if (!userQuery) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Falta userQuery en el body' }) };
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
      return {
        statusCode: groqResponse.status,
        body: JSON.stringify({ error: errorData.error?.message || `Error en Groq (${groqResponse.status})` }),
      };
    }

    const data = await groqResponse.json();
    const text = data.choices?.[0]?.message?.content?.trim() || 'No se obtuvo respuesta del modelo.';
    return { statusCode: 200, body: JSON.stringify({ text }) };
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Error interno al llamar a Groq' }) };
  }
};
