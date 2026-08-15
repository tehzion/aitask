import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: unknown) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aitask:uncaught-render-error', { detail: String(error) }));
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
        <section
          className="calm-raised w-full max-w-md px-6 py-8 text-center"
          role="alert"
          aria-live="assertive"
        >
          <h1 className="text-xl font-semibold text-ink">Something went wrong</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {this.props.label ? `${this.props.label} hit an unexpected error. ` : ''}
            Reload the app to continue. Your saved workspace data is safe.
          </p>
          {this.state.errorMessage && (
            <p className="mt-3 truncate rounded-panel bg-inset px-3 py-2 font-mono text-xs text-muted">
              {this.state.errorMessage}
            </p>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex min-h-10 items-center justify-center rounded-control bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
          >
            Reload AiTask
          </button>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, errorMessage: '' });
              window.history.replaceState(null, '', '/');
              window.location.assign('/');
            }}
            className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-control px-4 text-sm font-semibold text-muted transition-colors hover:bg-inset"
          >
            Go to Dashboard
          </button>
        </section>
      </div>
    );
  }
}

export default ErrorBoundary;
