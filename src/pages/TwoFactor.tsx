// Two-step login screens: the code step after the password, and first-time setup for admin and CEO.
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, ShieldCheck } from "lucide-react";
import { call, rpc } from "@/lib/rpc";
import { useLogout } from "@/lib/auth";
import { TwoFactorCodeInput } from "../../shared/schemas";
import { AuthLayout } from "./Login";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FormError, Spinner, useToast } from "@/components/kit";

function CodeForm({ label, hint, submitLabel, onSubmit }: { label: string; hint?: string; submitLabel: string; onSubmit: (code: string) => Promise<void> }) {
  const form = useForm({ resolver: zodResolver(TwoFactorCodeInput), defaultValues: { code: "" } });
  const { errors, isSubmitting } = form.formState;
  const submit = form.handleSubmit(async ({ code }) => {
    try {
      await onSubmit(code);
    } catch (err) {
      form.setError("root", { message: (err as Error).message });
      form.setValue("code", "");
    }
  });
  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <Field label={label} hint={hint} htmlFor="code" error={errors.code?.message}>
        <Input id="code" autoFocus autoComplete="one-time-code" inputMode="numeric" spellCheck={false} className="text-lg tracking-widest" aria-invalid={!!errors.code} {...form.register("code")} />
      </Field>
      <FormError>{errors.root?.message}</FormError>
      <Button type="submit" disabled={isSubmitting}>{submitLabel}</Button>
    </form>
  );
}

/** Step two of signing in, shown after a correct password on an account with two-step login. */
export function CodeStep({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const toast = useToast();
  return (
    <Card className="w-full max-w-sm p-6">
      <h1 className="text-xl font-bold">Two-step login</h1>
      <p className="mb-5 text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
      <CodeForm
        label="Code"
        hint="Lost your phone? Enter one of your recovery codes instead."
        submitLabel="Verify"
        onSubmit={async (code) => {
          const res = await call(rpc.auth.mfa.$post({ json: { code } }));
          if (res.recoveryCodesLeft <= 2) toast(`Only ${res.recoveryCodesLeft} recovery codes left. Ask an admin to reset two-step login to get new ones.`, "error");
          onDone();
        }}
      />
      <button onClick={onCancel} className="mt-4 text-xs text-muted-foreground underline">Use a different account</button>
    </Card>
  );
}

/** Admin and CEO accounts land here until two-step login is on. */
export default function TwoFactorSetup() {
  const qc = useQueryClient();
  const toast = useToast();
  const logout = useLogout();
  const [codes, setCodes] = useState<string[] | null>(null);
  const setup = useMutation({ mutationFn: () => call(rpc.auth["2fa"].setup.$post()) });

  if (codes) {
    return (
      <AuthLayout>
        <Card className="w-full max-w-sm p-6">
          <h1 className="flex items-center gap-2 text-xl font-bold"><ShieldCheck className="h-5 w-5 text-success" /> Two-step login is on</h1>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            Save these recovery codes somewhere safe, like your password manager. Each one works once if you lose your phone. They won't be shown again.
          </p>
          <ol className="mb-4 grid grid-cols-2 gap-2 rounded-md border bg-secondary/40 p-3 font-mono text-sm">
            {codes.map((c) => <li key={c}>{c}</li>)}
          </ol>
          <div className="grid gap-2">
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(codes.join("\n")).then(() => toast("Recovery codes copied."), () => undefined)}><Copy /> Copy codes</Button>
            <Button onClick={() => qc.invalidateQueries()}>I've saved them, continue</Button>
          </div>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-xl font-bold">Set up two-step login</h1>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">
          Admin and CEO accounts need a code from your phone as well as your password. Install an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password or Authy), then continue.
        </p>
        {!setup.data ? (
          <>
            <FormError>{setup.error?.message}</FormError>
            <Button className="w-full" disabled={setup.isPending} onClick={() => setup.mutate()}>{setup.isPending ? <Spinner /> : "Show my QR code"}</Button>
          </>
        ) : (
          <div className="grid gap-4">
            <img src={setup.data.qrDataUrl} alt="QR code to scan with your authenticator app" className="mx-auto h-44 w-44 rounded-md border" />
            <p className="text-center text-xs text-muted-foreground">Can't scan it? Enter this key in the app:<br /><span className="select-all break-all font-mono text-foreground">{setup.data.secret}</span></p>
            <CodeForm
              label="Code from the app"
              submitLabel="Turn on two-step login"
              onSubmit={async (code) => setCodes((await call(rpc.auth["2fa"].enable.$post({ json: { code } }))).recoveryCodes)}
            />
          </div>
        )}
        <button onClick={logout} className="mt-4 text-xs text-muted-foreground underline">Sign out</button>
      </Card>
    </AuthLayout>
  );
}
