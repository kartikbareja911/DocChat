# DocChat AI — Full Build Guide
### Chat with your documents (RAG app) using Next.js + Supabase + Claude API

---

## 0. What we're building (recap)

A web app where a user:
1. Signs up / logs in
2. Uploads a PDF
3. Asks questions about it in a chat box
4. Gets answers with citations back to the source

**Stack:**
- Next.js (frontend + backend, one project)
- Supabase (auth + database + file storage + vector search via pgvector)
- Claude API (embeddings-free approach: we'll use OpenAI embeddings + Claude for answers, or Voyage AI embeddings — explained below)
- Vercel (deployment)

---

## 1. Prerequisites (install these first)

```bash
# Check if you have Node.js (need v18+)
node -v

# If not installed, download from nodejs.org, then verify:
npm -v
```

Create free accounts (all have free tiers):
- [supabase.com](https://supabase.com) — database/auth/storage
- [console.anthropic.com](https://console.anthropic.com) — Claude API key
- [vercel.com](https://vercel.com) — deployment (can sign up with GitHub)
- [github.com](https://github.com) — to store your code

---

## 2. Project Setup

```bash
npx create-next-app@latest docchat-ai
```

When prompted, choose:
- TypeScript: **Yes**
- ESLint: **Yes**
- Tailwind CSS: **Yes**
- `src/` directory: **Yes**
- App Router: **Yes**
- Import alias: default (`@/*`)

```bash
cd docchat-ai
npm install @anthropic-ai/sdk @supabase/supabase-js @supabase/ssr pdf-parse
```

What each package does:
| Package | Purpose |
|---|---|
| `@anthropic-ai/sdk` | Talk to Claude API |
| `@supabase/supabase-js` | Talk to your Supabase database/auth/storage |
| `pdf-parse` | Extract text from uploaded PDFs |

---

## 3. Set up Supabase

1. Go to supabase.com → New Project → note your **Project URL** and **anon public key** (Settings → API)
2. In your Next.js project, create `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
ANTHROPIC_API_KEY=your_claude_key
```

3. Enable **pgvector** — in Supabase dashboard: Database → Extensions → search "vector" → enable it

4. Run this SQL in Supabase's SQL Editor (Database → SQL Editor → New query):

```sql
-- Table to store document chunks + their embeddings
create table document_chunks (
  id bigint primary key generated always as identity,
  user_id uuid references auth.users(id),
  document_name text,
  content text,
  embedding vector(1536), -- size depends on embedding model used
  page_number int,
  created_at timestamp default now()
);

-- Function to search for similar chunks
create or replace function match_chunks (
  query_embedding vector(1536),
  match_user_id uuid,
  match_count int default 3
)
returns table (
  id bigint,
  content text,
  document_name text,
  page_number int,
  similarity float
)
language sql stable
as $$
  select
    document_chunks.id,
    document_chunks.content,
    document_chunks.document_name,
    document_chunks.page_number,
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from document_chunks
  where document_chunks.user_id = match_user_id
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
$$;
```

5. Set up Storage bucket for PDFs: Storage → New bucket → name it `documents` → keep private

6. Enable Auth: Authentication → Providers → Email is on by default. That's enough for now.

---

## 4. About embeddings — one clarification

Claude's API doesn't currently offer an embeddings endpoint. So for the embedding step specifically, use one of these (both have free tiers):
- **Voyage AI** (built by ex-Anthropic team, works great with Claude, has a free tier) — recommended
- **OpenAI embeddings** (`text-embedding-3-small`) — also cheap and reliable

Everything else (the actual answer generation) uses Claude.

```bash
npm install voyageai
```

Add to `.env.local`:
```
VOYAGE_API_KEY=your_voyage_key
```

---

## 5. File structure you'll build

```
docchat-ai/
├── src/
│   ├── app/
│   │   ├── page.tsx                 # Landing/chat page
│   │   ├── api/
│   │   │   ├── upload/route.ts      # Handles PDF upload + chunking + embedding
│   │   │   └── chat/route.ts        # Handles question → search → Claude answer
│   │   └── login/page.tsx           # Auth page
│   ├── lib/
│   │   ├── supabase.ts              # Supabase client setup
│   │   └── anthropic.ts             # Claude client setup
│   └── components/
│       ├── ChatBox.tsx
│       └── FileUpload.tsx
├── .env.local
└── package.json
```

---

## 6. Week 1 — Basic chat (no documents yet)

**Goal:** Get a working chat box that talks to Claude, so you understand the core loop before adding complexity.

`src/lib/anthropic.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk';

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

`src/app/api/chat/route.ts` (simple version, no RAG yet):
```typescript
import { anthropic } from '@/lib/anthropic';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { message } = await req.json();

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{ role: 'user', content: message }],
  });

  const textBlock = response.content.find(block => block.type === 'text');
  return NextResponse.json({ reply: textBlock?.text ?? '' });
}
```

Build a simple chat UI in `src/app/page.tsx` with an input box and a "send" button that calls `/api/chat` and displays the response. Get this fully working before moving on — this is your foundation.

**By end of Week 1, you should understand:** how a frontend calls your backend API route, and how that route calls Claude.

---

## 7. Week 2 — Add document upload + chunking + embeddings

**Goal:** Upload a PDF, break it into chunks, generate embeddings, store in Supabase.

`src/app/api/upload/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import pdf from 'pdf-parse';

function chunkText(text: string, chunkSize = 500): string[] {
  const words = text.split(' ');
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(' '));
  }
  return chunks;
}

async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: text, model: 'voyage-3' }),
  });
  const data = await res.json();
  return data.data[0].embedding;
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get('file') as File;
  const userId = formData.get('userId') as string;

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await pdf(buffer);
  const chunks = chunkText(parsed.text);

  const supabase = createClient();

  for (const chunk of chunks) {
    const embedding = await getEmbedding(chunk);
    await supabase.from('document_chunks').insert({
      user_id: userId,
      document_name: file.name,
      content: chunk,
      embedding,
    });
  }

  return NextResponse.json({ success: true, chunksStored: chunks.length });
}
```

Build a simple upload button in the UI that sends the file to this endpoint.

**By end of Week 2, you should understand:** chunking, embeddings, and how data gets stored for search later.

---

## 8. Week 3 — Wire retrieval into chat (the actual RAG part)

**Goal:** When a user asks a question, search for relevant chunks, feed them to Claude, show the cited answer.

Update `src/app/api/chat/route.ts`:
```typescript
import { anthropic } from '@/lib/anthropic';
import { createClient } from '@/lib/supabase';
import { NextResponse } from 'next/server';

async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: text, model: 'voyage-3' }),
  });
  const data = await res.json();
  return data.data[0].embedding;
}

export async function POST(req: Request) {
  const { message, userId } = await req.json();
  const supabase = createClient();

  // 1. Turn the question into an embedding
  const queryEmbedding = await getEmbedding(message);

  // 2. Search Supabase for the most relevant chunks
  const { data: chunks } = await supabase.rpc('match_chunks', {
    query_embedding: queryEmbedding,
    match_user_id: userId,
    match_count: 3,
  });

  const context = chunks
    ?.map((c: any) => `[From ${c.document_name}]: ${c.content}`)
    .join('\n\n');

  // 3. Send question + relevant chunks to Claude
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: `Answer the user's question using ONLY the context below. 
If the answer isn't in the context, say so. Cite which document it came from.

Context:
${context}`,
    messages: [{ role: 'user', content: message }],
  });

  const textBlock = response.content.find(block => block.type === 'text');
  return NextResponse.json({ reply: textBlock?.text ?? '', sources: chunks });
}
```

**By end of Week 3, you should have:** a fully working RAG pipeline — this is the core deliverable.

---

## 9. Week 4 (polish) — Auth, deploy, portfolio-ready

1. Add Supabase Auth (email/password login) — Supabase has a `@supabase/ssr` guide for Next.js App Router
2. Add loading states, error handling, a clean UI (Tailwind you already have installed)
3. Push code to GitHub
4. Deploy:
   ```bash
   npm install -g vercel
   vercel
   ```
   Or connect your GitHub repo directly at vercel.com → New Project. Add your `.env.local` variables in Vercel's dashboard (Settings → Environment Variables).
5. Write a good README: what it does, tech stack, a GIF/screenshot, live demo link

---

## 10. What to say about it in interviews

> "I built a RAG application where users upload documents and ask questions against them. I implemented chunking, generated embeddings via Voyage AI, stored and searched them using pgvector in Supabase, and used Claude to generate grounded, cited answers. I also handled auth and file storage, and deployed the full stack on Vercel."

That one sentence hits: RAG, embeddings, vector search, LLM integration, auth, cloud deployment — all real, in-demand skills.

---

## Quick troubleshooting notes
- If PDF parsing fails on scanned PDFs (images, not text), that's expected — `pdf-parse` only reads real text layers. Mention this as a "future improvement: OCR support" if asked.
- If embeddings dimension mismatch errors occur, double check the `vector(1536)` in your SQL matches your embedding model's output size (Voyage-3 outputs 1024 — adjust the SQL to `vector(1024)` if using Voyage).
- Free tiers: Supabase free tier and Voyage AI free tier are both generous enough for a portfolio project.
