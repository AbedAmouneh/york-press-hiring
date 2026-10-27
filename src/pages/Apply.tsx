import { useState } from "react";
import { useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { call, rpc } from "@/lib/rpc";
import { ApplyForm } from "@/lib/forms";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Field, FormError, Spinner } from "@/components/kit";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Public page linked from outreach emails: candidates upload their CV here. */
export default function Apply() {
  const { token = "" } = useParams();
  const role = useQuery({
    queryKey: ["apply", token],
    queryFn: () => call(rpc.public.apply[":token"].$get({ param: { token } })),
    retry: false,
  });
  const [done, setDone] = useState(false);
  const form = useForm({ resolver: zodResolver(ApplyForm), defaultValues: { name: "", email: "", linkedin: "", note: "" } });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    try {
      await call(rpc.public.apply[":token"].$post({
        param: { token },
        form: { name: values.name, email: values.email, linkedin: values.linkedin || undefined, note: values.note || undefined, consent: "true", cv: values.cv[0] },
      }));
      setDone(true);
    } catch (err) {
      form.setError("root", { message: (err as Error).message });
    }
  });

  return (
    <div className="min-h-full bg-background">
      <header className="bg-primary px-4 py-4"><div className="mx-auto max-w-2xl"><Logo dark /></div></header>
      <main className="mx-auto max-w-2xl px-4 py-8">
        {role.isLoading ? <Spinner /> : role.error ? (
          <Card className="p-6"><p>{(role.error as Error).message}</p></Card>
        ) : done ? (
          <Card className="p-8 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-success" />
            <h1 className="text-xl font-bold">Thank you, we've received your CV</h1>
            <p className="mt-2 text-sm text-muted-foreground">Our talent team will review it and get back to you.</p>
          </Card>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{role.data!.department} · {role.data!.locationPolicy}</p>
            <h1 className="mb-3 text-2xl font-bold">{role.data!.title}</h1>
            {role.data!.description && <p className="mb-6 whitespace-pre-line text-sm text-muted-foreground">{role.data!.description}</p>}
            <Card className="p-6">
              <form onSubmit={submit} className="grid gap-4" noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" htmlFor="name" error={errors.name?.message}><Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...form.register("name")} /></Field>
                  <Field label="Email" htmlFor="email" error={errors.email?.message}><Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register("email")} /></Field>
                </div>
                <Field label="LinkedIn profile (optional)" htmlFor="linkedin"><Input id="linkedin" placeholder="https://www.linkedin.com/in/…" {...form.register("linkedin")} /></Field>
                <Field label="CV" hint="PDF, Word or text, up to 4 MB." htmlFor="cv" error={errors.cv?.message}>
                  <Input id="cv" type="file" accept=".pdf,.doc,.docx,.txt" className="h-auto py-1.5" aria-invalid={!!errors.cv} {...form.register("cv")} />
                </Field>
                <Field label="Anything you'd like to add (optional)" htmlFor="note" error={errors.note?.message}><Textarea id="note" {...form.register("note")} /></Field>
                <div className="grid gap-1">
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1" {...form.register("consent")} />
                    <span>I agree that York Press may store my CV and contact details to assess me for this and similar roles, and that I can ask for them to be deleted at any time.</span>
                  </label>
                  {errors.consent && <p className="text-xs text-destructive">{errors.consent.message}</p>}
                </div>
                <FormError>{errors.root?.message}</FormError>
                <Button type="submit" variant="brand" disabled={isSubmitting}>{isSubmitting ? "Sending…" : "Send my CV"}</Button>
              </form>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
