import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Card, Spinner } from "@/components/ui/misc";

/** Public page linked from outreach emails: candidates upload their CV here. */
export default function Apply() {
  const { token } = useParams();
  const role = useQuery({
    queryKey: ["apply", token],
    queryFn: () => api<{ title: string; department: string; locationPolicy: string; description: string }>(`/public/apply/${token}`),
    retry: false,
  });
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/public/apply/${token}`, { form: new FormData(e.currentTarget) });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-background">
      <header className="bg-primary px-4 py-4"><div className="mx-auto max-w-2xl"><Logo dark /></div></header>
      <main className="mx-auto max-w-2xl px-4 py-8">
        {role.isLoading ? <Spinner /> : role.error ? (
          <Card className="p-6"><p>{(role.error as Error).message}</p></Card>
        ) : done ? (
          <Card className="p-8 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-success" />
            <h1 className="text-xl font-bold">Thank you — we've received your CV</h1>
            <p className="mt-2 text-sm text-muted-foreground">Our talent team will review it and get back to you.</p>
          </Card>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{role.data!.department} · {role.data!.locationPolicy}</p>
            <h1 className="mb-3 text-2xl font-bold">{role.data!.title}</h1>
            {role.data!.description && <p className="mb-6 whitespace-pre-line text-sm text-muted-foreground">{role.data!.description}</p>}
            <Card className="p-6">
              <form onSubmit={submit} className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" htmlFor="name"><Input id="name" name="name" required autoComplete="name" /></Field>
                  <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" required autoComplete="email" /></Field>
                </div>
                <Field label="LinkedIn profile (optional)" htmlFor="linkedin"><Input id="linkedin" name="linkedin" placeholder="https://www.linkedin.com/in/…" /></Field>
                <Field label="CV" hint="PDF, Word or text, up to 4 MB." htmlFor="cv"><Input id="cv" name="cv" type="file" accept=".pdf,.doc,.docx,.txt" required className="h-auto py-1.5" /></Field>
                <Field label="Anything you'd like to add (optional)" htmlFor="note"><Textarea id="note" name="note" /></Field>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="consent" className="mt-1" required />
                  <span>I agree that York Press may store my CV and contact details to assess me for this and similar roles, and that I can ask for them to be deleted at any time.</span>
                </label>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" variant="brand" disabled={busy}>{busy ? "Sending…" : "Send my CV"}</Button>
              </form>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
