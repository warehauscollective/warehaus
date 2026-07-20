import { NextRequest, NextResponse } from 'next/server';
import type { ChatMessage } from '@/lib/chat/types';
import { getChatResponse } from '@/lib/chat/ai-client';

// Simple in-memory rate limiting: 10 requests per minute per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }

  entry.count++;
  return entry.count > 10;
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { message, history } = body as {
      message: string;
      history: ChatMessage[];
    };

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'A non-empty "message" string is required.' },
        { status: 400 }
      );
    }

    const reply = await getChatResponse(history || [], message);

    return NextResponse.json({ reply });
  } catch (err) {
    console.error('Chat API error:', err);
    return NextResponse.json(
      { error: 'Failed to process chat request.' },
      { status: 500 }
    );
  }
}
