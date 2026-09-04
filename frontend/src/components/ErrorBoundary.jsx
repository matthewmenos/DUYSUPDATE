import React from 'react';

/**
 * App-level error boundary.
 * Without this, any uncaught render error unmounts the entire React tree
 * and leaves a blank screen. This surfaces the error instead and gives the
 * user a way to recover.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      const message = this.state.error?.message || String(this.state.error);
      return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center text-center p-6">
          <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
          <p className="text-blue-400 text-sm mb-2 max-w-md break-words">{message}</p>
          <p className="text-gray-500 text-sm mb-6 max-w-md">
            The page hit an unexpected error. Reloading usually fixes it.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-full bg-gradient-to-r from-blue-600 to-blue-400 text-white font-semibold text-sm hover:opacity-90 transition"
            >
              Reload
            </button>
            <button
              onClick={() => {
                this.setState({ error: null });
                window.location.href = '/';
              }}
              className="px-5 py-2.5 rounded-full border border-gray-700 text-gray-300 text-sm hover:bg-gray-900 transition"
            >
              Go home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;