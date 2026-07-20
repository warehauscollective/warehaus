'use client';

import { useState, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import { cn } from '@/lib/utils/cn';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [value, setValue] = useState('');

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
  }, []);

  return (
    <div className="px-4 py-3">
      <div
        className="flex items-end rounded-2xl backdrop-blur-2xl transition-colors"
        style={{
          background: 'var(--nav-bg)',
          borderWidth: '1px',
          borderColor: 'var(--nav-border)',
        }}
      >
        <textarea
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder="Type a message..."
          className={cn(
            'flex-1 resize-none bg-transparent px-4 py-3 text-base md:text-sm',
            'placeholder:text-foreground/40 text-foreground',
            'focus:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        />

        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          aria-label="Send message"
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl m-1',
            'transition-colors',
            'disabled:cursor-not-allowed disabled:opacity-40'
          )}
          style={{
            background: 'var(--nav-surface)',
            color: 'var(--nav-text)',
          }}
        >
          <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M22 2L11 13"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M22 2L15 22L11 13L2 9L22 2Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
