import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { call, rpc } from "@/lib/rpc";
import { useMe } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/kit";
import { LoginInput } from "../../shared/schemas";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
  const form = useForm({ resolver: zodResolver(LoginInput), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  async function signIn(creds: { email: string; password: string }) {
    try {
      await call(rpc.auth.login.$post({ json: creds }));
      await qc.invalidateQueries();
      navigate(params.get("next") ?? "/", { replace: true });
    } catch (err) {
      form.setError("root", { message: (err as Error).message });
    }
  }

  return (
    <AuthLayout>
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 lg:hidden"><Logo /></div>
        <h1 className="text-xl font-bold">Sign in</h1>
        <p className="mb-5 text-sm text-muted-foreground">Use your York Press email.</p>
        <form onSubmit={form.handleSubmit(signIn)} className="grid gap-4" noValidate>
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="username" aria-invalid={!!errors.email} {...form.register("email")} />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password?.message}>
            <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register("password")} />
          </Field>
          <FormError>{errors.root?.message}</FormError>
          <Button type="submit" disabled={isSubmitting}>Sign in</Button>
        </form>
        <p className="mt-4 text-xs text-muted-foreground">Forgot your password? Ask your admin to send a new invite link.</p>
        {me.data?.demoMode && me.data.demoPassword && (
          <div className="mt-6 border-t pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Demo · sign in as</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO.map(([e, label]) => (
                <Button key={e} variant="outline" size="sm" disabled={isSubmitting} onClick={() => signIn({ email: e, password: me.data!.demoPassword! })}>{label}</Button>
              ))}
            </div>
          </div>
        )}
      </Card>
    </AuthLayout>
  );
}
