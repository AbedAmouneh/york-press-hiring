import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { call, rpc } from "@/lib/rpc";
import { ForgotPasswordInput } from "../../shared/schemas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/kit";
import { AuthLayout } from "./Login";

export default function Forgot() {
  const form = useForm({ resolver: zodResolver(ForgotPasswordInput), defaultValues: { email: "" } });
  const { errors, isSubmitting } = form.formState;
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = form.handleSubmit(async ({ email }) => {
    try {
      await call(rpc.auth.forgot.$post({ json: { email } }));
      setSentTo(email.trim());
    } catch (err) {
      form.setError("root", { message: (err as Error).message });
    }
  });

  return (
    <AuthLayout>
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-xl font-bold">Reset your password</h1>
        {sentTo ? (
          // The same message whether or not the address has an account.
          <p className="mt-2 text-sm text-muted-foreground" role="status">
            If {sentTo} has an account, we've emailed it a link to choose a new password. The link works for 1 hour.
          </p>
        ) : (
          <>
            <p className="mb-5 text-sm text-muted-foreground">Enter your work email and we'll send you a link.</p>
            <form onSubmit={submit} className="grid gap-4" noValidate>
              <Field label="Email" htmlFor="email" error={errors.email?.message}>
                <Input id="email" type="email" autoComplete="username" aria-invalid={!!errors.email} {...form.register("email")} />
              </Field>
              <FormError>{errors.root?.message}</FormError>
              <Button type="submit" disabled={isSubmitting}>Send reset link</Button>
            </form>
          </>
        )}
        <Link to="/login" className="mt-4 block text-xs text-muted-foreground underline-offset-2 hover:underline">Back to sign in</Link>
      </Card>
    </AuthLayout>
  );
}
