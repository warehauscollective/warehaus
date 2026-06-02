'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { cn } from '@/lib/utils/cn';
import { ChatAvatar } from './ChatAvatar';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { useChatApi } from './useChatApi';
import { Heading, Text, Eyebrow } from '@/components/react/ui/typography';

const PANEL_WIDTH = 380;

export function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { messages, isLoading, sendMessage, error } = useChatApi();

  const handleOpen = (open: boolean) => {
    setIsOpen(open);
    if (open && !hasOpened) {
      setHasOpened(true);
    }
  };

  // GSAP slide animation
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    gsap.to(panel, {
      x: isOpen ? 0 : PANEL_WIDTH,
      duration: 0.4,
      ease: 'power3.out',
    });
  }, [isOpen]);

  // Set initial position off-screen (no flash)
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    gsap.set(panel, { x: PANEL_WIDTH });
  }, []);

  return (
    <>
      {/* Toggle button — always visible */}
      <button
        type="button"
        onClick={() => handleOpen(!isOpen)}
        aria-label={isOpen ? 'Close chat panel' : 'Open chat panel'}
        className={cn(
          'fixed right-4 bottom-6 z-50 flex h-12 w-12 items-center justify-center',
          'rounded-full bg-accent/15 text-accent ring-1 ring-accent/25',
          'transition-colors hover:bg-accent/25',
          isOpen && 'opacity-0 pointer-events-none'
        )}
      >
        {/* Chat bubble icon */}
        <svg
          width={22}
          height={22}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Warehaus AI Chat"
        style={{ width: PANEL_WIDTH }}
        className={cn(
          'fixed top-0 right-0 z-50 flex h-full flex-col',
          'glass border-l border-border bg-surface'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2.5">
            <ChatAvatar size="sm" />
            <Heading level={6} display={false} as="span" className="text-foreground">
              Warehaus AI
            </Heading>
          </div>

          <button
            type="button"
            onClick={() => handleOpen(false)}
            aria-label="Minimize chat"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md',
              'text-muted transition-colors hover:bg-surface-elevated hover:text-foreground'
            )}
          >
            {/* Minimize / chevron-right icon */}
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M9 18l6-6-6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Welcome message — shown once before any conversation */}
        {hasOpened && messages.length === 0 && (
          <div className="px-5 pt-6 pb-2">
            <Eyebrow as="span">
              Start Here
            </Eyebrow>
            <Text size="sm" className="mt-2 leading-relaxed text-foreground/80">
              Welcome to Warehaus AI. Ask me anything about your project — from
              design ideas to code architecture.
            </Text>
          </div>
        )}

        {/* Messages */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <ChatMessages messages={messages} isLoading={isLoading} />
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-4 mb-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
            {error}
          </div>
        )}

        {/* Input */}
        <ChatInput onSend={sendMessage} disabled={isLoading} />
      </div>
    </>
  );
}
