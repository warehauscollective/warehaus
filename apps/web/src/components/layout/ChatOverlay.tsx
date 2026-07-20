'use client';

import { useEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import { useLayout, type ActiveTab } from '@/components/providers/LayoutProvider';
import { ChatMessages } from '@/components/react/chat/ChatMessages';
import { ChatInput } from '@/components/react/chat/ChatInput';
import { ProjectScope } from '@/components/react/chat/ProjectScope';
import { useChatApi } from '@/components/react/chat/useChatApi';
import type { ChatMessage } from '@/lib/chat/types';

const DEFAULT_GREETING: ChatMessage = {
  id: 'greeting-default',
  role: 'assistant',
  content: "Hey — I'm the Warehaus assistant. Ask me anything about the work, the process, or what you're building.",
  timestamp: new Date(),
};

// Pillar tabs get a persona-specific greeting; other surfaces fall back to the
// neutral default.
const GREETING: Partial<Record<ActiveTab, ChatMessage>> = {
  dream: {
    id: 'greeting-dreamer',
    role: 'assistant',
    content: "What's the vision? Tell me what you're dreaming up and I'll help you shape it into something real.",
    timestamp: new Date(),
    sender: 'dreamer',
  },
  design: {
    id: 'greeting-designer',
    role: 'assistant',
    content: "Ready to make it beautiful. What are we designing — layout, colors, typography, motion? Let's talk.",
    timestamp: new Date(),
    sender: 'designer',
  },
  develop: {
    id: 'greeting-developer',
    role: 'assistant',
    content: "Let's build. What are we working on — components, integrations, performance? I'm ready to ship.",
    timestamp: new Date(),
    sender: 'developer',
  },
};

export function ChatOverlay() {
  const { chatOverlayOpen, toggleChatOverlay, activeTab } = useLayout();
  const { messages, isLoading, sendMessage, error } = useChatApi(activeTab);

  const allMessages = useMemo(
    () => [GREETING[activeTab] ?? DEFAULT_GREETING, ...messages],
    [activeTab, messages],
  );

  // Lock page scroll when open (but allow chat scroll)
  useEffect(() => {
    if (chatOverlayOpen) {
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, [chatOverlayOpen]);

  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!chatOverlayOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleChatOverlay();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [chatOverlayOpen, toggleChatOverlay]);

  // Close on click outside chat container
  useEffect(() => {
    if (!chatOverlayOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (chatContainerRef.current && !chatContainerRef.current.contains(e.target as Node)) {
        toggleChatOverlay();
      }
    };
    const timer = setTimeout(() => {
      window.addEventListener('click', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handleClick);
    };
  }, [chatOverlayOpen, toggleChatOverlay]);

  return (
    <div
      role="dialog"
      aria-label="Warehaus AI Chat"
      aria-modal="true"
      className={`fixed inset-0 z-40 flex flex-col ${
        chatOverlayOpen ? '' : 'pointer-events-none'
      }`}
    >
      {/* Blurred backdrop — blur animates in first */}
      <div
        className="absolute inset-0 transition-all duration-500 ease-out"
        style={{
          backgroundColor: chatOverlayOpen
            ? 'color-mix(in oklab, var(--background) 55%, transparent)'
            : 'transparent',
          backdropFilter: chatOverlayOpen ? 'blur(64px)' : 'blur(0px)',
          WebkitBackdropFilter: chatOverlayOpen ? 'blur(64px)' : 'blur(0px)',
        }}
      />

      {/* Mobile close button — fades in after backdrop */}
      <button
        type="button"
        onClick={toggleChatOverlay}
        aria-label="Close chat"
        className={`md:hidden absolute top-4 left-4 z-20 flex h-9 w-9 items-center justify-center rounded-full transition-opacity duration-300 ${
          chatOverlayOpen ? 'opacity-100 delay-200' : 'opacity-0'
        }`}
        style={{
          background: 'color-mix(in oklab, var(--foreground) 10%, transparent)',
          color: 'color-mix(in oklab, var(--foreground) 60%, transparent)',
        }}
      >
        <X className="w-5 h-5" />
      </button>

      {/* Chat container — fades in after backdrop */}
      <div
        ref={chatContainerRef}
        className={`relative z-10 flex flex-1 flex-col min-h-0 max-w-2xl w-full mx-auto transition-opacity duration-300 ${
          chatOverlayOpen ? 'opacity-100 delay-200' : 'opacity-0'
        }`}
      >
        {/* Messages — intro thread + user messages (min-h-0 lets flex child shrink & scroll) */}
        <div className="flex flex-1 flex-col min-h-0">
          <ChatMessages messages={allMessages} isLoading={isLoading} activeTab={activeTab} />
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-5 mb-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Input pinned to bottom of chat area, above navbar */}
        <div className="space-y-2 pb-6 md:pb-[calc(1.75rem+56px+2rem)]">
          <ChatInput onSend={sendMessage} disabled={isLoading} />
          <ProjectScope />
        </div>
      </div>
    </div>
  );
}
