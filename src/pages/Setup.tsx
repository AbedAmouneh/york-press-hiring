import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Card } from "@/components/ui/misc";
import { AuthLayout } from "./Login";

export default function Setup() {
  const qc = useQueryClient();
  const [f, setF] = useState({
    adminName: "Abed El-Fattah Amouneh",
    adminEmail: "abed.amouneh@york-press.com",
    adminPassword: "",
    ceoName: "Khalil Sayegh",
    ceoEmail: "khalil.sayegh@york-press.com",
    managers: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<{ email: string; link?: string }[] | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const managers = f.managers.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
        const [name, email, department] = l.split(",").map((x) => x.trim());
        return { name, email, department };
      });
      const res = await api<{ invites: { email: string; link?: string }[] }>("/setup", { body: { ...f, managers } });
      setLinks(res.invites);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

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
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Your name" htmlFor="an"><Input id="an" value={f.adminName} onChange={set("adminName")} required /></Field>
          <Field label="Your email" htmlFor="ae"><Input id="ae" type="email" value={f.adminEmail} onChange={set("adminEmail")} required /></Field>
          <Field label="Choose a password" hint="At least 10 characters." htmlFor="ap"><Input id="ap" type="password" autoComplete="new-password" value={f.adminPassword} onChange={set("adminPassword")} required minLength={10} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="CEO name" htmlFor="cn"><Input id="cn" value={f.ceoName} onChange={set("ceoName")} required /></Field>
            <Field label="CEO email" htmlFor="ce"><Input id="ce" type="email" value={f.ceoEmail} onChange={set("ceoEmail")} required /></Field>
          </div>
          <Field label="Department managers (optional)" hint="One per line: Name, email, Department" htmlFor="mg">
            <Textarea id="mg" value={f.managers} onChange={set("managers")} placeholder={"Cath Russell, cath.russell@york-press.com, Editorial"} />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy}>Create account and send invites</Button>
        </form>
      </Card>
    </AuthLayout>
  );
}
