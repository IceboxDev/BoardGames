import { useId, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, ErrorAlert, Field, Input, PageShell } from "../components/ui";
import { authClient } from "../lib/auth-client";

/**
 * Public page reached via the one-time link an admin generates and relays. Reads
 * `?token=` and lets the user set a new password through better-auth's
 * `resetPassword` (which validates the token: single-use + expiry). No session
 * required — the whole point is the user is locked out.
 */
export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();
  const passwordId = useId();
  const confirmId = useId();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    if (!token) return;
    setSubmitting(true);
    try {
      const { error: err } = await authClient.resetPassword({ newPassword: password, token });
      if (err) {
        setError(
          err.message ?? "This reset link is invalid or has expired — ask an admin for a new one.",
        );
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell layout="centered">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-white/10 bg-surface-900/80 p-8 shadow-2xl backdrop-blur">
        <div className="text-center">
          <h1 className="gradient-text text-3xl font-bold tracking-tight">Reset password</h1>
          <p className="mt-2 text-sm text-fg-secondary">
            {done ? "Your password has been updated." : "Choose a new password for your account."}
          </p>
        </div>

        {!token ? (
          <div className="space-y-4">
            <ErrorAlert message="This link is missing its reset token. Ask an admin to send you a fresh reset link." />
            <Button size="lg" className="w-full" onClick={() => navigate("/login")}>
              Back to sign in
            </Button>
          </div>
        ) : done ? (
          <Button
            size="lg"
            className="w-full"
            onClick={() => navigate("/login", { replace: true })}
          >
            Go to sign in
          </Button>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="New password" htmlFor={passwordId} hint="At least 8 characters">
              <Input
                id={passwordId}
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Confirm password" htmlFor={confirmId}>
              <Input
                id={confirmId}
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>

            {error && <ErrorAlert message={error} />}

            <Button type="submit" size="lg" loading={submitting} className="w-full">
              Set new password
            </Button>
          </form>
        )}
      </div>
    </PageShell>
  );
}
