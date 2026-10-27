import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { DEPARTMENTS, ROLES, ROLE_LABELS, type Role } from "../../shared/types";
import { Badge, DataTable, Field, Modal, Select, Spinner, Td, Th, useToast } from "@/components/kit";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TableBody, TableHeader, TableRow } from "@/components/ui/table";

type U = { id: string; email: string; name: string; roles: Role[]; department: string | null; active: boolean; isDemo: boolean; invited: boolean; lastLoginAt: string | null };

function RolePicker({ value, onChange }: { value: Role[]; onChange: (r: Role[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ROLES.map((r) => {
        const on = value.includes(r);
        return (
          <button type="button" key={r} onClick={() => onChange(on ? value.filter((x) => x !== r) : [...value, r])} aria-pressed={on}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary"}`}>
            {ROLE_LABELS[r]}
          </button>
        );
      })}
    </div>
  );
}

export default function Users() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["users"], queryFn: () => api<{ users: U[] }>("/users") });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", department: "", roles: ["manager", "hm"] as Role[] });
  const [link, setLink] = useState<string | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await api<{ inviteLink?: string }>("/users", { body: { ...f, department: f.department || null } });
      setOpen(false);
      setF({ name: "", email: "", department: "", roles: ["manager", "hm"] });
      setLink(res.inviteLink ?? null);
      toast(`Invite sent to ${f.email}.`);
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (err) { toast((err as Error).message, "error"); }
  }
  async function update(u: U, body: Partial<U>) {
    try {
      await api(`/users/${u.id}`, { method: "PATCH", body });
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (err) { toast((err as Error).message, "error"); }
  }
  async function resend(u: U) {
    const res = await api<{ inviteLink?: string }>(`/users/${u.id}/invite`, { method: "POST" });
    setLink(res.inviteLink ?? null);
    toast(`New invite link sent to ${u.email}.`);
  }

  return (
    <>
      <PageHeader eyebrow="Admin" title="Users">
        <Button onClick={() => setOpen(true)}><UserPlus /> Invite user</Button>
      </PageHeader>
      {link && <p className="mb-4 break-all rounded-md border border-brand bg-accent p-3 text-sm">Email is in mock mode — share this invite link yourself: <span className="font-mono">{link}</span></p>}
      {q.isLoading ? <Spinner /> : (
        <DataTable>
          <TableHeader><TableRow><Th>Name</Th><Th>Roles</Th><Th>Department</Th><Th>Last sign-in</Th><Th>Active</Th><Th /></TableRow></TableHeader>
          <TableBody>
            {q.data?.users.map((u) => (
              <TableRow key={u.id}>
                <Td><div className="font-medium">{u.name} {u.isDemo && <Badge tone="warn">demo</Badge>} {u.invited && <Badge tone="info">invited</Badge>}</div><div className="font-mono text-xs text-muted-foreground">{u.email}</div></Td>
                <Td className="min-w-[260px]"><RolePicker value={u.roles} onChange={(roles) => update(u, { roles })} /></Td>
                <Td>
                  <Select value={u.department ?? ""} onChange={(e) => update(u, { department: e.target.value || null })} aria-label="Department" className="w-44">
                    <option value="">—</option>{[...DEPARTMENTS, "Leadership"].map((d) => <option key={d}>{d}</option>)}
                  </Select>
                </Td>
                <Td className="num text-xs">{fmtDateTime(u.lastLoginAt)}</Td>
                <Td><Switch checked={u.active} onCheckedChange={(active) => update(u, { active })} aria-label="Active" /></Td>
                <Td>{u.invited && <Button size="sm" variant="ghost" onClick={() => resend(u)}>Resend invite</Button>}</Td>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      )}
      <Modal open={open} onOpenChange={setOpen} title="Invite a user" description="They get an email with a link to set their password.">
        <form onSubmit={invite} className="grid gap-3">
          <Field label="Name" htmlFor="un"><Input id="un" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label="Email" htmlFor="ue"><Input id="ue" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
          <Field label="Department" htmlFor="ud"><Select id="ud" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}><option value="">—</option>{[...DEPARTMENTS, "Leadership"].map((d) => <option key={d}>{d}</option>)}</Select></Field>
          <Field label="Roles"><RolePicker value={f.roles} onChange={(roles) => setF({ ...f, roles })} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={!f.roles.length}>Send invite</Button></div>
        </form>
      </Modal>
    </>
  );
}
