import { Link, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { call, rpc } from "@/lib/rpc";
import { InviteForm } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FormError, Spinner } from "@/components/kit";
import { AuthLayout } from "./Login";

/** The page a "Forgot password?" email links to. */
export default function Reset() {
  const { token = "" } = useParams();
  const info = useQuery({ queryKey: ["reset", token], queryFn: () => call(rpc.auth.reset[":token"].$get({ param: { token } })), retry: false });
  const form = useForm({ resolver: zodResolver(InviteForm), defaultValues: { password: "", confirm: "" } });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ password }) => {
    try {
      const res = await call(rpc.auth.reset[":token"].$post({ param: { token }, json: { password } }));
      // Two-step login stays on: those accounts finish on the sign-in page's code step.
      window.location.href = res.mfaRequired ? "/login?step=code" : "/";
    } catch (err) {
      form.setError("root", { message: (err as Error).message });
    }
  });

  return (
    <AuthLayout>
      <Card className="w-full max-w-sm p-6">
        {info.isLoading ? <Spinner /> : info.error ? (
          <>
            <p className="text-sm text-destructive">{(info.error as Error).message}</p>
            <Link to="/forgot" className="mt-4 block text-sm font-medium text-primary underline-offset-2 hover:underline">Send a new link</Link>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold">Choose a new password</h1>
            <p className="mb-5 text-sm text-muted-foreground">For {info.data!.email}. Other devices will be signed out.</p>
            <form onSubmit={submit} className="grid gap-4" noValidate>
              <Field label="New password" hint="At least 10 characters." htmlFor="p1" error={errors.password?.message}>
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
