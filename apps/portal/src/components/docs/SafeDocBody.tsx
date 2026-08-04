'use client';

import { parseSafeDocBody, type SafeDocBlock } from '@/lib/docs/safe-body';

export function SafeDocBody({ body }: { body: string | null }) {
  const blocks = parseSafeDocBody(body);
  if (blocks.length === 0) {
    return (
      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--muted)', lineHeight: 1.55 }}>
        No published body yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => (
        <SafeBlock key={`${block.type}-${i}`} block={block} />
      ))}
    </div>
  );
}

function SafeBlock({ block }: { block: SafeDocBlock }) {
  switch (block.type) {
    case 'heading_1':
      return (
        <h2 style={{ fontSize: 'var(--t-lg)', fontWeight: 700, lineHeight: 1.25 }}>
          {block.text}
        </h2>
      );
    case 'heading_2':
      return (
        <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 650, lineHeight: 1.3 }}>
          {block.text}
        </h3>
      );
    case 'heading_3':
      return (
        <h4 style={{ fontSize: 'var(--t-sm)', fontWeight: 650, lineHeight: 1.35 }}>
          {block.text}
        </h4>
      );
    case 'paragraph':
      return (
        <p style={{ fontSize: 'var(--t-sm)', color: 'var(--fg)', lineHeight: 1.55 }}>
          {block.text}
        </p>
      );
    case 'quote':
    case 'callout':
      return (
        <blockquote
          style={{
            margin: 0,
            padding: '0.65rem 0.85rem',
            borderLeft: '3px solid var(--border)',
            fontSize: 'var(--t-sm)',
            color: 'var(--muted)',
            lineHeight: 1.55,
            background: 'color-mix(in oklab, var(--bg) 50%, transparent)',
          }}
        >
          {block.text}
        </blockquote>
      );
    case 'bulleted_list_item':
      return (
        <div style={{ display: 'flex', gap: 8, fontSize: 'var(--t-sm)', lineHeight: 1.5 }}>
          <span style={{ color: 'var(--faint)' }}>•</span>
          <span>{block.text}</span>
        </div>
      );
    case 'numbered_list_item':
      return (
        <div style={{ display: 'flex', gap: 8, fontSize: 'var(--t-sm)', lineHeight: 1.5 }}>
          <span style={{ color: 'var(--faint)' }}>–</span>
          <span>{block.text}</span>
        </div>
      );
    case 'to_do':
      return (
        <label
          className="flex items-start gap-2"
          style={{ fontSize: 'var(--t-sm)', lineHeight: 1.5 }}
        >
          <input type="checkbox" checked={block.checked} readOnly disabled />
          <span style={{ color: block.checked ? 'var(--muted)' : 'var(--fg)' }}>
            {block.text}
          </span>
        </label>
      );
    case 'code':
      return (
        <pre
          className="ds-mono overflow-x-auto"
          style={{
            margin: 0,
            padding: '0.75rem 0.85rem',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'color-mix(in oklab, var(--bg) 55%, transparent)',
            fontSize: 'var(--t-xs)',
            lineHeight: 1.45,
          }}
        >
          {block.text}
        </pre>
      );
    case 'divider':
      return <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '0.25rem 0' }} />;
    case 'image':
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={block.src}
          alt={block.alt ?? ''}
          style={{
            maxWidth: '100%',
            borderRadius: 12,
            border: '1px solid var(--border)',
          }}
        />
      );
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="ds-data" style={{ minWidth: 280 }}>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{ fontSize: 'var(--t-sm)' }}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return null;
  }
}
