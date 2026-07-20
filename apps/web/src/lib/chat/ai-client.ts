import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage } from './types';

const SYSTEM_PROMPT = `You are Warehaus AI, the creative assistant for Warehaus Studio — a design and development agency. You help visitors explore the studio's work, discuss project ideas, and answer questions about design, technology, and creative strategy.

Be concise, conversational, and helpful. Match the studio's futuristic, premium tone. Keep responses under 3 paragraphs unless asked for detail.`;

export async function getChatResponse(
  messages: ChatMessage[],
  userMessage: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return "I'm currently in demo mode. Connect an Anthropic API key to enable full AI responses. In the meantime, feel free to explore the studio's work!";
  }

  const client = new Anthropic({ apiKey });

  const formattedMessages = [
    ...messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: formattedMessages,
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  return textBlock ? textBlock.text : 'I wasn\'t able to generate a response. Please try again.';
}
