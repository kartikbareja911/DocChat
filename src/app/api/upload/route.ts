import { NextResponse } from 'next/server'
import { createServerSideClient } from '@/lib/supabase/server'
import { extractTextFromFile } from '@/lib/fileParser'
import { validateEnv } from '@/lib/env'

function chunkText(text: string, chunkSize = 500): string[] {
  const words = text.split(/\s+/)
  const chunks: string[] = []
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(' '))
  }
  return chunks
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  initialBackoff = 1000
): Promise<Response> {
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

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  validateEnv()
  const batchSize = 12
  const embeddings: number[][] = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)

    const res = await fetchWithRetry('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: batch, model: 'voyage-3' }),
    })

    if (!res.ok) {
      const errorText = await res.text()
      if (res.status === 429) {
        try {
          const parsed = JSON.parse(errorText)
          if (parsed.detail && parsed.detail.includes('payment method')) {
            throw new Error(
              'Voyage AI Free Tier Rate Limit Exceeded (3 RPM). ' +
              'Please add a billing card in your Voyage AI Dashboard (https://dashboard.voyageai.com) ' +
              'to unlock standard rate limits, or wait 1+ minute before uploading another document.'
            )
          }
        } catch (_) {}
      }
      throw new Error(`Voyage AI API error: ${res.status} ${errorText}`)
    }

    const data = await res.json()
    const batchEmbeddings = data.data.map((item: any) => item.embedding)
    embeddings.push(...batchEmbeddings)

    // Small delay between batches to respect free tier rate limits
    if (i + batchSize < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  return embeddings
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const userIdInput = formData.get('userId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const allowedExtensions = ['pdf', 'docx', 'txt', 'md', 'csv']
    const extension = file.name.split('.').pop()?.toLowerCase() || ''

    if (!allowedExtensions.includes(extension)) {
      return NextResponse.json(
        { error: 'Invalid file format. Please upload a PDF, DOCX, TXT, MD, or CSV file.' },
        { status: 400 }
      )
    }

    const MAX_SIZE = 10 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File is too large (max 10MB). Your file: ${formatFileSize(file.size)}` },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const extractedText = await extractTextFromFile(file.name, file.type, buffer)

    if (!extractedText || extractedText.trim().length === 0) {
      return NextResponse.json({ error: 'Could not extract text from document' }, { status: 400 })
    }

    const cleanText = extractedText.replace(/\s+/g, ' ').trim()
    const chunks = chunkText(cleanText)

    if (chunks.length === 0) {
      return NextResponse.json({ error: 'Could not extract text from document' }, { status: 400 })
    }

    validateEnv()

    const supabase = await createServerSideClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id || userIdInput

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized: No user ID found' }, { status: 401 })
    }

    const embeddings = await getEmbeddings(chunks)

    const dbPayload = chunks.map((chunk, index) => ({
      user_id: userId,
      document_name: file.name,
      content: chunk,
      embedding: embeddings[index],
    }))

    const { error } = await supabase.from('document_chunks').insert(dbPayload)

    if (error) {
      console.error('Supabase DB Insert Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, chunksStored: chunks.length })
  } catch (error: any) {
    console.error('Upload API Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const documentName = searchParams.get('documentName')
    const userIdInput = searchParams.get('userId')

    if (!documentName) {
      return NextResponse.json({ error: 'Document name is required' }, { status: 400 })
    }

    validateEnv()

    const supabase = await createServerSideClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id || userIdInput

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized: No user ID found' }, { status: 401 })
    }

    const { error } = await supabase
      .from('document_chunks')
      .delete()
      .eq('user_id', userId)
      .eq('document_name', documentName)

    if (error) {
      console.error('Supabase DB Delete Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete API Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}