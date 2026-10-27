import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureError } from "@/lib/monitoring";
import { Button } from "@/components/ui/button";

type State = { error: Error | null };

/** Catches render errors so one broken screen doesn't blank the whole app, and reports them. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error);
    captureError(error, { componentStack: info.componentStack ?? "" });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-lg font-semibold">Something went wrong on this page</h1>
        <p className="text-sm text-muted-foreground">The error has been reported. Reloading usually fixes it.</p>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    );
  }
}
