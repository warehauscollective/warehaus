'use client';

import { useState, useCallback, useRef } from 'react';
import type { ChatMessage, ChatState } from '@/lib/chat/types';
import type { ActiveTab } from '@/components/providers/LayoutProvider';

// Only the pillar tabs map to a chat persona; other surfaces (e.g. Style Guide)
// fall through to an undefined sender.
const TAB_TO_SENDER: Partial<Record<ActiveTab, ChatMessage['sender']>> = {
  dream: 'dreamer',
  design: 'designer',
  develop: 'developer',
};

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useChatApi(activeTab?: ActiveTab) {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    error: null,
  });

  const messagesRef = useRef(state.messages);
  messagesRef.current = state.messages;

  const sendMessage = useCallback(async (content: string) => {
    const userMessage: ChatMessage = {
      id: createId(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isLoading: true,
      error: null,
    }));

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          history: messagesRef.current,
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.status}`);
      }

      const data = await response.json();

      const assistantMessage: ChatMessage = {
        id: createId(),
        role: 'assistant',
        content: data.reply,
        timestamp: new Date(),
        sender: activeTab ? TAB_TO_SENDER[activeTab] : undefined,
      };

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
        isLoading: false,
      }));
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'An unexpected error occurred.';

      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
    }
  }, [activeTab]);

  return {
    messages: state.messages,
    isLoading: state.isLoading,
    error: state.error,
    sendMessage,
  };
}
