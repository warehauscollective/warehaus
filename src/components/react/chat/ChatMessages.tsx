'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils/cn';
import { useTypewriter } from '@/hooks/useTypewriter';
import type { ChatMessage } from '@/lib/chat/types';
import type { ActiveTab } from '@/components/providers/LayoutProvider';

const SENDER_CONFIG: Record<string, { label: string; color: string; bg: string; glow: string }> = {
  dreamer:   { label: 'Dreamer',   color: 'text-dream',   bg: 'bg-dream-surface',   glow: 'var(--dream-primary)' },
  designer:  { label: 'Designer',  color: 'text-design',  bg: 'bg-design-surface',  glow: 'var(--design-primary)' },
  developer: { label: 'Developer', color: 'text-develop', bg: 'bg-develop-surface', glow: 'var(--develop-primary)' },
};

const TAB_TO_SENDER: Partial<Record<ActiveTab, string>> = {
  dream: 'dreamer',
  design: 'designer',
  develop: 'developer',
};

interface ChatMessagesProps {
  messages: ChatMessage[];
  isLoading?: boolean;
  activeTab?: ActiveTab;
}

export function ChatMessages({ messages, isLoading, activeTab }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Track which message IDs we've already seen. Initialised with the first
  // set of messages so greeting messages don't animate.
  const [seenIds, setSeenIds] = useState<Set<string>>(
    () => new Set(messages.map((m) => m.id)),
  );

  // Derive which IDs are new (should animate) — purely from state + props
  const animatingIds = new Set<string>();
  for (const msg of messages) {
    if (msg.role === 'assistant' && !seenIds.has(msg.id)) {
      animatingIds.add(msg.id);
    }
  }

  // Called by each bubble when its typewriter finishes
  const markSeen = useCallback((id: string) => {
    setSeenIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // Auto-scroll to bottom when messages change or loading state changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <p className="text-center text-sm text-muted">
          No messages yet. Say hello to get started.
        </p>
      </div>
    );
  }

  const thinkingSender = (activeTab && TAB_TO_SENDER[activeTab]) ?? 'dreamer';

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto min-h-0 px-4 pt-14 md:pt-8 pb-4">
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          animate={animatingIds.has(msg.id)}
          onDone={markSeen}
          onScrollBottom={scrollToBottom}
        />
      ))}

      {/* Thinking indicator while waiting for API response */}
      {isLoading && <ThinkingBubble senderKey={thinkingSender} />}

      <div ref={bottomRef} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Thinking bubble                                                    */
/* ------------------------------------------------------------------ */

function ThinkingBubble({ senderKey }: { senderKey: string }) {
  const sender = SENDER_CONFIG[senderKey];
  if (!sender) return null;

  return (
    <div className="flex items-start gap-2.5">
      <SenderAvatar sender={sender} />

      <div className="flex flex-col gap-1">
        <span className={cn('text-[10px] font-bold uppercase tracking-wider', sender.color)}>
          {sender.label}
        </span>

        <div className="rounded-xl px-3.5 py-2.5 bg-white/5 text-foreground">
          <div className="flex items-center gap-1 h-5">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ backgroundColor: sender.glow, animationDelay: '0ms', animationDuration: '1s' }}
            />
            <span
              className="inline-block w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ backgroundColor: sender.glow, animationDelay: '150ms', animationDuration: '1s' }}
            />
            <span
              className="inline-block w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ backgroundColor: sender.glow, animationDelay: '300ms', animationDuration: '1s' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Avatar                                                             */
/* ------------------------------------------------------------------ */

function SenderAvatar({ sender }: { sender: (typeof SENDER_CONFIG)[string] }) {
  return (
    <div
      className={cn(
        'mt-1 h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold',
        sender.bg,
        sender.color,
      )}
    >
      {sender.label[0]}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Message bubble                                                     */
/* ------------------------------------------------------------------ */

function MessageBubble({
  message,
  animate,
  onDone,
  onScrollBottom,
}: {
  message: ChatMessage;
  animate: boolean;
  onDone: (id: string) => void;
  onScrollBottom: () => void;
}) {
  const isUser = message.role === 'user';
  const sender = message.sender ? SENDER_CONFIG[message.sender] : null;

  const shouldAnimate = animate && !isUser;
  const { displayed, done } = useTypewriter(message.content, shouldAnimate, 18);
  const text = shouldAnimate ? displayed : message.content;

  // Mark as seen once typewriter completes
  useEffect(() => {
    if (shouldAnimate && done) {
      onDone(message.id);
    }
  }, [shouldAnimate, done, onDone, message.id]);

  // Scroll as text reveals
  useEffect(() => {
    if (shouldAnimate && !done) {
      onScrollBottom();
    }
  }, [displayed, shouldAnimate, done, onScrollBottom]);

  return (
    <div
      className={cn(
        'flex items-start gap-2.5',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar for assistant messages */}
      {!isUser && sender && <SenderAvatar sender={sender} />}

      <div className={cn('max-w-[85%]', !isUser && sender && 'flex flex-col gap-1')}>
        {/* Sender label */}
        {!isUser && sender && (
          <span className={cn('text-[10px] font-bold uppercase tracking-wider', sender.color)}>
            {sender.label}
          </span>
        )}

        <div
          className={cn(
            'rounded-xl px-3.5 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-white/10 text-foreground'
              : 'bg-white/5 text-foreground'
          )}
        >
          {text}
          {/* Blinking cursor while typing */}
          {shouldAnimate && !done && (
            <span className="inline-block w-[2px] h-[1em] bg-current ml-0.5 align-middle animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
}
