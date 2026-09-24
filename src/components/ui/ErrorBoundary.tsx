"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Shown to the user. Defaults to a generic message — never a raw stack. */
  fallback?: ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Fails gracefully and logs verbosely. The user sees a plain recovery
 * affordance; the raw error and component stack go to the console for the
 * operator. Stack traces are never rendered into the DOM.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[ErrorBoundary]${this.props.label ? ` (${this.props.label})` : ""}:`,
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            role="alert"
            className="border border-urgency-critical bg-surface-1 p-4"
          >
            <p className="font-semibold text-urgency-critical">
              This section failed to load.
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              Reload the page. If it keeps happening, contact support and quote
              the time it started.
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="mt-3 border border-border-strong px-3 py-1.5 text-sm font-semibold uppercase tracking-wide text-fg hover:bg-surface-3"
            >
              Retry
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
