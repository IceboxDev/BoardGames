import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { ApiError, SchemaError } from "../lib/api-fetch";
import { Button } from "./ui/Button";
import { PageShell } from "./ui/PageShell";

// Top-level error boundary mounted once inside `<BrowserRouter>` (see
// `App.tsx`). It catches every render-time exception in the route tree —
// most importantly the typed throws from `apiFetch` (`ApiError` for non-2xx,
// `SchemaError` for wire-protocol drift) and lazy-import failures from
// `React.lazy` chunks — and renders a recoverable error screen instead of
// the React tree collapsing to a blank page.
//
// Two reset surfaces:
//   1. Automatic, via `useLocation().pathname`. When the user navigates
//      (e.g. clicks the top-nav back button or hits a link), the wrapper
//      passes the new pathname as `resetKey`; `getDerivedStateFromProps`
//      clears the error state without remounting the subtree. The same-
//      pathname re-renders therefore stay cheap.
//   2. Manual, via the "Try again" button. Resets the error state in
//      place. If the cause is permanent (bad query param, schema drift on
//      a still-pending response), the child will rethrow on the next
//      render and the screen reappears — but the user always gets the
//      retry affordance.
//
// What this boundary intentionally does NOT catch:
//   - Errors inside event handlers (React rule; use try/catch at the call
//     site or surface via React Query's `error` state).
//   - Errors thrown from non-React async code (handle at the boundary of
//     the async API instead).
//   - Errors from inside this boundary's own render path. If the error
//     screen itself crashes the app, that is a bug in this file.

type Props = {
  children: ReactNode;
  /** When this string changes, the boundary clears its error state. */
  resetKey: string;
};

type State = {
  error: Error | null;
  /** Mirrored from props so `getDerivedStateFromProps` can detect changes. */
  resetKey: string;
};

export class RouteErrorBoundaryClass extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    // Normalize: React only invokes this with the thrown value verbatim,
    // and throwing non-Error values is legal JS. Wrap so the rest of the
    // component can rely on `error.message`.
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // `componentStack` is the React-only stack frame chain (which component
    // each ancestor was). Log alongside the error message so a future
    // engineer can identify the responsible subtree from production logs.
    // Telemetry sinks can hook this later by reading `window.__reportError`
    // or similar — keep the contract minimal for now.
    console.error("[RouteErrorBoundary]", error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return <RouteErrorScreen error={this.state.error} onReset={this.handleReset} />;
  }
}

/**
 * Production-facing error boundary. Wrap once inside `<BrowserRouter>`,
 * outside `<Suspense>`, so lazy-chunk fetch failures fall through here too.
 *
 * The function wrapper reads the current pathname from react-router and
 * forwards it as the boundary's `resetKey` — that's what makes the error
 * state auto-clear on navigation. Keep this component thin: any logic
 * other than reading `useLocation` belongs on the class.
 */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <RouteErrorBoundaryClass resetKey={pathname}>{children}</RouteErrorBoundaryClass>;
}

// ── Error screen ─────────────────────────────────────────────────────────

type ScreenProps = {
  error: Error;
  onReset: () => void;
};

function RouteErrorScreen({ error, onReset }: ScreenProps) {
  const summary = describeError(error);
  return (
    <PageShell layout="centered" background="plain">
      <div
        role="alert"
        className="w-full max-w-md rounded-2xl border border-rose-400/20 bg-surface-900/80 p-6 text-center shadow-xl shadow-black/40"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-rose-300">
          {summary.eyebrow}
        </p>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-white">{summary.title}</h1>
        <p className="mt-3 text-sm text-gray-400">{summary.body}</p>
        {summary.detail && (
          <pre
            // Diagnostic strip — surfaces the exact error path / message so
            // a user can paste it into a bug report. Long strings stay
            // scrollable inside the box rather than blowing out the panel.
            className="mt-4 max-h-32 overflow-auto rounded-lg border border-white/5 bg-surface-950/80 p-3 text-left font-mono text-[11px] text-gray-400"
          >
            {summary.detail}
          </pre>
        )}
        <div className="mt-6 flex flex-col items-center gap-2">
          <Button type="button" variant="primary" size="sm" onClick={onReset}>
            Try again
          </Button>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => {
              window.location.reload();
            }}
          >
            Reload the page
          </Button>
        </div>
      </div>
    </PageShell>
  );
}

type ErrorSummary = {
  eyebrow: string;
  title: string;
  body: string;
  /** Diagnostic detail (path / status / raw message). Optional. */
  detail: string | null;
};

/**
 * Map a thrown error to a human-readable summary. Specialized for the two
 * typed throws from {@link "../lib/api-fetch"} so the screen can tell the
 * user "the server said no" vs. "the data didn't match the contract" —
 * those have very different mental models for whether retrying will help.
 *
 * Exported for testability; the component itself is the only normal caller.
 */
// biome-ignore lint/style/useComponentExportOnlyModules: tiny helper, exported only so the unit tests can pin the ApiError / SchemaError mapping in isolation
export function describeError(error: Error): ErrorSummary {
  if (error instanceof ApiError) {
    const isAuth = error.status === 401 || error.status === 403;
    return {
      eyebrow: "Request failed",
      title: isAuth ? "Not allowed" : "Server returned an error",
      body: isAuth
        ? "Your session may have expired. Reload to sign in again."
        : "Try again in a moment. If the problem persists, refresh the page.",
      detail: `${error.status}${error.code ? ` (${error.code})` : ""}: ${error.message}`,
    };
  }
  if (error instanceof SchemaError) {
    const path = error.issues[0]?.path
      ?.map((p) => (typeof p === "object" && p !== null && "key" in p ? String(p.key) : String(p)))
      .join(".");
    return {
      eyebrow: "Data shape mismatch",
      title: "Unexpected response",
      body: "The server returned data this version of the app doesn't understand. Try reloading — a deploy may be in progress.",
      detail: `${error.stage}${path ? ` at "${path}"` : ""}: ${error.issues[0]?.message ?? "unknown"}`,
    };
  }
  // Generic fallback — the message is usually the most useful thing we can
  // surface without a stack trace. We deliberately don't render the stack;
  // it bloats the panel and most users can't action it.
  return {
    eyebrow: "Something went wrong",
    title: "An unexpected error occurred",
    body: "Try the action again. If it keeps failing, reload the page.",
    detail: error.message || null,
  };
}
