'use client';

import { Component, type ReactNode } from 'react';
import { OutlineButton } from '@/components/ui/primitives';

type Props = { children: ReactNode; label: string };
type State = { error: Error | null };

/** One panel can fail without unmounting the dock or the other tabs. */
export class PortalPanelBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[portal] ${this.props.label} panel error`, error);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex flex-col items-start"
          style={{ padding: '1.25rem', gap: 'var(--s-3)' }}
        >
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--danger-text)' }}>
            {this.props.label} could not load. The rest of the portal is still available.
          </p>
          <OutlineButton onClick={() => this.setState({ error: null })}>Try again</OutlineButton>
        </div>
      );
    }
    return this.props.children;
  }
}
