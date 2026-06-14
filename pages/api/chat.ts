import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { messages, system, apiKey: clientKey } = req.body

  // Accept key from env (production) or from client (user-supplied in UI)
  const apiKey = process.env.ANTHROPIC_API_KEY || clientKey

  if (!apiKey) {
    return res.status(401).json({ error: 'NO_API_KEY' })
  }

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request body' })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system,
        messages,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      if (response.status === 401) return res.status(401).json({ error: 'INVALID_KEY' })
      return res.status(response.status).json({ error: err })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text ?? 'No response received.'
    return res.status(200).json({ text })
  } catch (err) {
    console.error('Anthropic API error:', err)
    return res.status(500).json({ error: 'Failed to reach Anthropic API' })
  }
}
