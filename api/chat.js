// /api/chat.js — Vercel Serverless Function
// Принимает POST от фронтенда, проксирует в OpenRouter с серверным API-ключом.

module.exports = async function handler(req, res) {
    // Разрешаем только POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { messages, model, max_tokens } = req.body;

    // Проверяем наличие ключа на сервере
    if (!process.env.OPENROUTER_API_KEY) {
        return res.status(500).json({ error: 'API key not configured on server' });
    }

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY
            },
            body: JSON.stringify({
                model: model || 'minimax/minimax-m3:free',
                messages: messages,
                max_tokens: max_tokens || 1500
            })
        });

        const data = await response.json();

        if (data.choices && data.choices[0]) {
            return res.status(200).json(data.choices[0].message);
        }

        return res.status(500).json({ error: 'No response from LLM', details: data });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
