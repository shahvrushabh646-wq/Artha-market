import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/widgets";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        const result = await authClient.signUp.email({ name: name.trim() || email.split("@")[0], email: email.trim(), password });
        if (result.error) throw new Error(result.error.message ?? "Could not create account");
      } else {
        const result = await authClient.signIn.email({ email: email.trim(), password });
        if (result.error) throw new Error(result.error.message ?? "Could not sign in");
      }
      await authClient.getSession();
      await navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md pt-8">
      <Panel className="p-5">
        <h1 className="font-display text-2xl tracking-tight text-fg">{mode === "login" ? "Log in to Artha" : "Create your Artha account"}</h1>
        <p className="mt-2 text-sm text-muted">Your portfolio and watchlist are tied to your account.</p>
        <form className="mt-5 space-y-3" onSubmit={submit}>
          {mode === "signup" ? <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoComplete="name" required /> : null}
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" autoComplete="email" required />
          <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required />
          {error ? <p className="text-sm text-down">{error}</p> : null}
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}</Button>
        </form>
        <button type="button" className="mt-4 text-sm text-muted underline" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}>
          {mode === "login" ? "Create a new account" : "Already have an account? Log in"}
        </button>
      </Panel>
    </div>
  );
}
