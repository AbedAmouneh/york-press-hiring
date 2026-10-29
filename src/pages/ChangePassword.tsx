import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { call, rpc } from "@/lib/rpc";
import { InviteForm } from "@/lib/forms";
import type { Me } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "./Login";
import { Field, FormError } from "@/components/kit";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/** Shown after signing in with a starting password an admin set: the person picks their own before going on. */
export default function ChangePassword({ user }: { user: Me }) {
  const qc = useQueryClient();
  const form = useForm({ resolver: zodResolver(InviteForm), defaultValues: { password: "", confirm: "" } });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ password }) => {
    try {
      await call(rpc.auth.password.$post({ json: { password } }));
      await qc.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      form.setError("root", { message: (err as Error).message });
    }
  });

  return (
    <AuthLayout>
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-xl font-bold">Welcome, {user.name.split(" ")[0]}</h1>
        <p className="mb-5 text-sm text-muted-foreground">Choose your own password to continue.</p>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field required label="New password" hint="At least 10 characters." htmlFor="np1" error={errors.password?.message}>
            <Input id="np1" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register("password")} />
          </Field>
          <Field required label="Repeat password" htmlFor="np2" error={errors.confirm?.message}>
            <Input id="np2" type="password" autoComplete="new-password" aria-invalid={!!errors.confirm} {...form.register("confirm")} />
          </Field>
          <FormError>{errors.root?.message}</FormError>
          <Button type="submit" disabled={isSubmitting}>Save and continue</Button>
        </form>
      </Card>
    </AuthLayout>
  );
}
