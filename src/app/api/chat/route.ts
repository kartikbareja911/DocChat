import { NextResponse } from 'next/server'
import { createServerSideClient } from '@/lib/supabase/server'
import { ai } from '@/lib/gemini'
import { validateEnv } from '@/lib/env'

// Rate limiting storage (in-memory for simplicity; use Redis in production)
const rateLimits = new Map<string, { count: number; lastAttempt: number }>()

function checkRateLimit(key: string, limit = 10, windowMs = 60000): { allowed: boolean; resetAt: number } {
  const now = Date.now()
  const entry = rateLimits.get(key)

  if (!entry) {
    rateLimits.set(key, { count: 1, lastAttempt: now })
    return { allowed: true, resetAt: now + windowMs }
  }

  if (now - entry.lastAttempt > windowMs) {
    rateLimits.set(key, { count: 1, lastAttempt: now })
    return { allowed: true, resetAt: now + windowMs }
  }

  if (entry.count >= limit) {
    return { allowed: false, resetAt: entry.lastAttempt + windowMs }
  }

  rateLimits.set(key, { ...entry, count: entry.count + 1, lastAttempt: now })
  return { allowed: true, resetAt: entry.lastAttempt + windowMs }
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 3, initialBackoff = 1000): Promise<Response> {
  let backoff = initialBackoff
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, options)
    if (res.status === 429) {
      const errorText = await res.text()
      let friendlyError = `Rate limited. Retrying in ${backoff}ms...`
      try {
        const parsed = JSON.parse(errorText)
        if (parsed.detail && parsed.detail.includes('payment method')) {
          friendlyError = 'Voyage AI Free Tier Limit: Add a billing card at https://dashboard.voyageai.com to unlock higher limits, or wait before retrying.'
        }
      } catch (_) {}
      console.warn(`Voyage AI 429: ${friendlyError} (attempt ${i + 1}/${retries})`)
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, backoff))
        backoff *= 1.5
      }
      continue
    }
    return res
  }
  return fetch(url, options)
}

async function getEmbedding(text: string): Promise<number[]> {
  validateEnv()
  const res = await fetchWithRetry('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: text, model: 'voyage-3' }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    if (res.status === 429) {
      try {
        const parsed = JSON.parse(errorText)
        if (parsed.detail && parsed.detail.includes('payment method')) {
          throw new Error('Voyage AI Rate Limit: Please add a billing card in your Voyage AI Dashboard (https://dashboard.voyageai.com) to unlock standard rate limits, or wait 1 minute before asking again.')
        }
      } catch (_) {}
    }
    throw new Error(`Voyage AI API error: ${res.status} ${errorText}`)
  }

  const data = await res.json()
  return data.data[0].embedding
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    // Input validation
    if (!body?.message || typeof body.message !== 'string') {
      return NextResponse.json({ error: 'Message is required and must be a string' }, { status: 400 })
    }

    if (body.message.length > 10000) {
      return NextResponse.json({ error: 'Message is too long (max 10000 characters)' }, { status: 400 })
    }

    const trimmedMessage = body.message.trim()
    if (trimmedMessage.length === 0) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 })
    }

    const userIdInput = body.userIdInput || null
    const documentName = body.documentName || null
    const sessionId = body.sessionId || null

    // Rate limiting per user/IP
    const rateKey = `chat:${userIdInput || 'anonymous'}`
    const rateLimit = checkRateLimit(rateKey, 20, 60000)

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    const supabase = await createServerSideClient()

    // Retrieve actual user session for security
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id || userIdInput

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized: No user ID found' }, { status: 401 })
    }

    // Determine active session ID (auto-create thread if missing)
    let activeSessionId = sessionId

    if (!activeSessionId) {
      const words = trimmedMessage.split(/\s+/)
      const title = words.slice(0, 5).join(' ') + (words.length > 5 ? '...' : '')

      const { data: newSession, error: sessionErr } = await supabase
        .from('chat_sessions')
        .insert({ title, user_id: userId })
        .select('id')
        .single()

      if (sessionErr) {
        console.error('Failed to auto-create chat session:', sessionErr)
      } else if (newSession) {
        activeSessionId = newSession.id
      }
    }

    // Store user message to history
    if (activeSessionId) {
      const { error: msgErr } = await supabase
        .from('chat_messages')
        .insert({
          session_id: activeSessionId,
          role: 'user',
          content: trimmedMessage,
        })
      if (msgErr) console.error('Failed to save user message to DB:', msgErr)
    }

    // 1. Turn the question into an embedding
    const queryEmbedding = await getEmbedding(trimmedMessage)

    // 2. Search Supabase for the most relevant chunks (optionally scoped to a single document)
    const { data: chunks, error: rpcError } = await supabase.rpc('match_chunks', {
      query_embedding: queryEmbedding,
      match_user_id: userId,
      match_count: 5,
      match_document_name: documentName || null,
    })

    if (rpcError) {
      console.error('Supabase match_chunks Error:', rpcError)
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }

    // Filter out low-similarity noise chunks (safe threshold: 25% for Voyage-3)
    const similarityThreshold = 0.25
    const relevantChunks = (chunks || []).filter((c: any) => c.similarity >= similarityThreshold)

    const context = relevantChunks.length > 0
      ? relevantChunks.map((c: any) => `[From Document "${c.document_name}"]: ${c.content}`).join('\n\n')
      : 'No relevant documents found.'

    // 3. Send question + relevant chunks to Gemini
    const systemPrompt = `You are a helpful AI assistant that answers questions, summarizes, and analyzes contents of the uploaded document context provided.
Follow these rules:
1. Use the provided context to answer the user's question, summarize information, or perform analysis/evaluation if requested.
2. If the user's question is completely unrelated to the documents or cannot be answered using the provided context, clearly state: "I cannot find the answer in the uploaded documents."
3. Cite which document(s) the answer/information came from using their document names.
4. Keep the style modern, clear, and professional.

Context:
${context}`

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: trimmedMessage,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2,
      },
    })

    const reply = response.text || ''

    // Store assistant response in history
    if (activeSessionId) {
      const { error: msgErr } = await supabase
        .from('chat_messages')
        .insert({
          session_id: activeSessionId,
          role: 'assistant',
          content: reply,
          sources: relevantChunks,
        })
      if (msgErr) console.error('Failed to save assistant response to DB:', msgErr)
    }

    return NextResponse.json({ reply, sources: relevantChunks, sessionId: activeSessionId })
  } catch (error: any) {
    console.error('Chat API Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}