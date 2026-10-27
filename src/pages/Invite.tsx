import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "./Login";
import { Field, Spinner } from "@/components/kit";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function Invite() {
  const { token } = useParams();
  const info = useQuery({ queryKey: ["invite", token], queryFn: () => api<{ name: string; email: string }>(`/auth/invite/${token}`), retry: false });
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) return setError("The passwords don't match.");
    try {
      await api(`/auth/invite/${token}`, { body: { password: pw } });
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <AuthLayout>
      <Card className="w-full max-w-sm p-6">
        {info.isLoading ? <Spinner /> : info.error ? (
          <p className="text-sm text-destructive">{(info.error as Error).message}</p>
        ) : (
          <>
            <h1 className="text-xl font-bold">Welcome, {info.data!.name.split(" ")[0]}</h1>
            <p className="mb-5 text-sm text-muted-foreground">Set a password for {info.data!.email}.</p>
            <form onSubmit={submit} className="grid gap-4">
              <Field label="Password" hint="At least 10 characters." htmlFor="p1"><Input id="p1" type="password" autoComplete="new-password" minLength={10} value={pw} onChange={(e) => setPw(e.target.value)} required /></Field>
              <Field label="Repeat password" htmlFor="p2"><Input id="p2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></Field>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit">Set password and sign in</Button>
            </form>
          </>
        )}
      </Card>
    </AuthLayout>
  );
}
