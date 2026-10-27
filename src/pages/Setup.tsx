import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { call, rpc } from "@/lib/rpc";
import { SetupForm, type SetupFormValues } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "./Login";
import { Field, FormError } from "@/components/kit";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const DEFAULTS: SetupFormValues = {
  adminName: "Abed El-Fattah Amouneh",
  adminEmail: "abed.amouneh@york-press.com",
  adminPassword: "",
  ceoName: "Khalil Sayegh",
  ceoEmail: "khalil.sayegh@york-press.com",
  managers: "",
};

export default function Setup() {
  const qc = useQueryClient();
  const [links, setLinks] = useState<{ email: string; link?: string }[] | null>(null);
  const form = useForm({ resolver: zodResolver(SetupForm), defaultValues: DEFAULTS });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    try {
      const res = await call(rpc.setup.$post({ json: values }));
      setLinks(res.invites);
    } catch (err) {
      form.setError("root", { message: (err as Error).message });
    }
  });

  if (links) {
    return (
      <AuthLayout>
        <Card className="w-full max-w-md p-6">
          <h1 className="text-xl font-bold">You're set up</h1>
          <p className="mt-1 text-sm text-muted-foreground">Invites were sent to the people below. Email is in mock mode until a Resend key is added, so the links are shown here to copy.</p>
          <ul className="my-4 grid gap-2 text-sm">
            {links.map((l) => (
              <li key={l.email} className="rounded border bg-secondary/50 p-2">
                <div className="font-medium">{l.email}</div>
                {l.link && <div className="break-all font-mono text-xs text-muted-foreground">{l.link}</div>}
              </li>
            ))}
          </ul>
          <Button onClick={() => qc.invalidateQueries()}>Open the app</Button>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Card className="w-full max-w-md p-6">
        <h1 className="text-xl font-bold">First-time setup</h1>
        <p className="mb-5 text-sm text-muted-foreground">Create your admin account and invite Khalil. You only do this once.</p>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field label="Your name" htmlFor="an" error={errors.adminName?.message}>
            <Input id="an" aria-invalid={!!errors.adminName} {...form.register("adminName")} />
          </Field>
          <Field label="Your email" htmlFor="ae" error={errors.adminEmail?.message}>
            <Input id="ae" type="email" aria-invalid={!!errors.adminEmail} {...form.register("adminEmail")} />
          </Field>
          <Field label="Choose a password" hint="At least 10 characters." htmlFor="ap" error={errors.adminPassword?.message}>
            <Input id="ap" type="password" autoComplete="new-password" aria-invalid={!!errors.adminPassword} {...form.register("adminPassword")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="CEO name" htmlFor="cn" error={errors.ceoName?.message}>
              <Input id="cn" aria-invalid={!!errors.ceoName} {...form.register("ceoName")} />
            </Field>
            <Field label="CEO email" htmlFor="ce" error={errors.ceoEmail?.message}>
              <Input id="ce" type="email" aria-invalid={!!errors.ceoEmail} {...form.register("ceoEmail")} />
            </Field>
          </div>
          <Field label="Department managers (optional)" hint="One per line: Name, email, Department" htmlFor="mg" error={errors.managers?.message}>
            <Textarea id="mg" placeholder={"Cath Russell, cath.russell@york-press.com, Editorial"} aria-invalid={!!errors.managers} {...form.register("managers")} />
          </Field>
          <FormError>{errors.root?.message}</FormError>
          <Button type="submit" disabled={isSubmitting}>Create account and send invites</Button>
        </form>
      </Card>
    </AuthLayout>
  );
}
