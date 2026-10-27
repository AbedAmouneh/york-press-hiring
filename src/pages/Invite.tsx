import { useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { InviteForm } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "./Login";
import { Field, FormError, Spinner } from "@/components/kit";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function Invite() {
  const { token } = useParams();
  const info = useQuery({ queryKey: ["invite", token], queryFn: () => api<{ name: string; email: string }>(`/auth/invite/${token}`), retry: false });
  const form = useForm({ resolver: zodResolver(InviteForm), defaultValues: { password: "", confirm: "" } });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ password }) => {
    try {
      await api(`/auth/invite/${token}`, { body: { password } });
      window.location.href = "/";
    } catch (err) {
      form.setError("root", { message: (err as Error).message });
    }
  });

  return (
    <AuthLayout>
      <Card className="w-full max-w-sm p-6">
        {info.isLoading ? <Spinner /> : info.error ? (
          <p className="text-sm text-destructive">{(info.error as Error).message}</p>
        ) : (
          <>
            <h1 className="text-xl font-bold">Welcome, {info.data!.name.split(" ")[0]}</h1>
            <p className="mb-5 text-sm text-muted-foreground">Set a password for {info.data!.email}.</p>
            <form onSubmit={submit} className="grid gap-4" noValidate>
              <Field label="Password" hint="At least 10 characters." htmlFor="p1" error={errors.password?.message}>
                <Input id="p1" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register("password")} />
              </Field>
              <Field label="Repeat password" htmlFor="p2" error={errors.confirm?.message}>
                <Input id="p2" type="password" autoComplete="new-password" aria-invalid={!!errors.confirm} {...form.register("confirm")} />
              </Field>
              <FormError>{errors.root?.message}</FormError>
              <Button type="submit" disabled={isSubmitting}>Set password and sign in</Button>
            </form>
          </>
        )}
      </Card>
    </AuthLayout>
  );
}
