import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Card } from "@/components/ui/misc";

const DEMO = [
  ["demo.manager@york-press.test", "Manager"],
  ["demo.ceo@york-press.test", "CEO approver"],
  ["demo.recruiter@york-press.test", "Recruiter"],
  ["demo.hm@york-press.test", "Hiring manager"],
] as const;

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-full lg:grid-cols-[1fr_minmax(0,520px)]">
      <div className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <Logo dark />
        <div className="max-w-md">
          <p className="text-3xl font-bold leading-tight">Request a role. Get it approved. Meet the best candidates.</p>
          <p className="mt-4 text-white/70">Managers request positions, Khalil approves them, and the platform finds, scores and contacts about 50 candidates per role, with the Top 10 ready for review.</p>
        </div>
        <p className="text-xs text-white/50">York Press · Educating generations since 1944</p>
      </div>
      <div className="flex items-center justify-center px-4 py-10">{children}</div>
    </div>
  );
}

export default function Login() {
  const qc = useQueryClient();
  const me = useMe();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e?: React.FormEvent, creds?: { email: string; password: string }) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/login", { body: creds ?? { email, password } });
      await qc.invalidateQueries();
      navigate(params.get("next") ?? "/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 lg:hidden"><Logo /></div>
        <h1 className="text-xl font-bold">Sign in</h1>
        <p className="mb-5 text-sm text-muted-foreground">Use your York Press email.</p>
        <form onSubmit={signIn} className="grid gap-4">
          <Field label="Email" htmlFor="email"><Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="Password" htmlFor="password"><Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy}>Sign in</Button>
        </form>
        <p className="mt-4 text-xs text-muted-foreground">Forgot your password? Ask your admin to send a new invite link.</p>
        {me.data?.demoMode && me.data.demoPassword && (
          <div className="mt-6 border-t pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Demo · sign in as</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO.map(([e, label]) => (
                <Button key={e} variant="outline" size="sm" disabled={busy} onClick={() => signIn(undefined, { email: e, password: me.data!.demoPassword! })}>{label}</Button>
              ))}
            </div>
          </div>
        )}
      </Card>
    </AuthLayout>
  );
}
