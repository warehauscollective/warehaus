'use client';

import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode; label: string };
type State = { error: Error | null };

/** One panel can fail without unmounting the dock or the other tabs. */
export class PortalPanelBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <p style={{ padding: '1.25rem', fontSize: 'var(--t-sm)', color: 'var(--danger)' }}>
          {this.props.label} could not load. The rest of the portal is still available.
        </p>
      );
    }
    return this.props.children;
  }
}
