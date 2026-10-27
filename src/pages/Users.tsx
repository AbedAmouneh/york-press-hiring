import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { call, rpc } from "@/lib/rpc";
import { useMe } from "@/lib/auth";
import type { UserRow } from "@/lib/types";
import { fmtDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { DEPARTMENTS, ROLES, ROLE_LABELS, type Role } from "../../shared/types";
import { UserInviteInput } from "../../shared/schemas";
import { Badge, DataTable, Field, FormError, Modal, Select, Spinner, Td, Th, useToast } from "@/components/kit";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TableBody, TableHeader, TableRow } from "@/components/ui/table";

type U = UserRow;

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

const INVITE_DEFAULTS: z.input<typeof UserInviteInput> = { name: "", email: "", department: null, roles: ["manager", "hm"] };

function InviteUserForm({ onDone, onCancel }: { onDone: (email: string, link: string | null) => void; onCancel: () => void }) {
  const form = useForm({ resolver: zodResolver(UserInviteInput), defaultValues: INVITE_DEFAULTS });
  const { errors, isSubmitting } = form.formState;
  const submit = form.handleSubmit(async (values) => {
    try {
      const res = await call(rpc.users.$post({ json: values }));
      form.reset(INVITE_DEFAULTS);
      onDone(values.email, res.inviteLink ?? null);
    } catch (err) {
      form.setError("root", { message: (err as Error).message });
    }
  });
  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      <Field label="Name" htmlFor="un" error={errors.name?.message}><Input id="un" aria-invalid={!!errors.name} {...form.register("name")} /></Field>
      <Field label="Email" htmlFor="ue" error={errors.email?.message}><Input id="ue" type="email" aria-invalid={!!errors.email} {...form.register("email")} /></Field>
      <Field label="Department" htmlFor="ud">
        <Select id="ud" {...form.register("department", { setValueAs: (v) => v || null })}>
          <option value="">—</option>{[...DEPARTMENTS, "Leadership"].map((d) => <option key={d}>{d}</option>)}
        </Select>
      </Field>
      <Field label="Roles" error={errors.roles?.message}>
        <Controller control={form.control} name="roles" render={({ field }) => <RolePicker value={field.value} onChange={field.onChange} />} />
      </Field>
      <FormError>{errors.root?.message}</FormError>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={isSubmitting}>Send invite</Button></div>
    </form>
  );
}

export default function Users() {
  const me = useMe().data!.user!;
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["users"], queryFn: () => call(rpc.users.$get()) });
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  function invited(email: string, inviteLink: string | null) {
    setOpen(false);
    setLink(inviteLink);
    toast(`Invite sent to ${email}.`);
    qc.invalidateQueries({ queryKey: ["users"] });
  }
  async function update(u: U, body: Pick<Partial<U>, "name" | "roles" | "department" | "active">) {
    try {
      await call(rpc.users[":id"].$patch({ param: { id: u.id }, json: body }));
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (err) { toast((err as Error).message, "error"); }
  }
  async function resetTwoFactor(u: U) {
    if (!window.confirm(`Reset two-step login for ${u.name}? They'll be signed out and set it up again with a new QR code.`)) return;
    try {
      await call(rpc.users[":id"]["two-factor"].reset.$post({ param: { id: u.id } }));
      toast(`Two-step login reset for ${u.name}.`);
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (err) { toast((err as Error).message, "error"); }
  }
  async function resend(u: U) {
    const res = await call(rpc.users[":id"].invite.$post({ param: { id: u.id } }));
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
                <Td><div className="font-medium">{u.name} {u.isDemo && <Badge tone="warn">demo</Badge>} {u.invited && <Badge tone="info">invited</Badge>} {u.twoFactorEnabled && <Badge tone="good">2-step</Badge>}</div><div className="font-mono text-xs text-muted-foreground">{u.email}</div></Td>
                <Td className="min-w-[260px]"><RolePicker value={u.roles} onChange={(roles) => update(u, { roles })} /></Td>
                <Td>
                  <Select value={u.department ?? ""} onChange={(e) => update(u, { department: e.target.value || null })} aria-label="Department" className="w-44">
                    <option value="">—</option>{[...DEPARTMENTS, "Leadership"].map((d) => <option key={d}>{d}</option>)}
                  </Select>
                </Td>
                <Td className="num text-xs">{fmtDateTime(u.lastLoginAt)}</Td>
                <Td><Switch checked={u.active} onCheckedChange={(active) => update(u, { active })} aria-label="Active" /></Td>
                <Td className="whitespace-nowrap">
                  {u.invited && <Button size="sm" variant="ghost" onClick={() => resend(u)}>Resend invite</Button>}
                  {u.twoFactorEnabled && u.id !== me.id && <Button size="sm" variant="ghost" onClick={() => resetTwoFactor(u)}>Reset 2-step</Button>}
                </Td>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      )}
      <Modal open={open} onOpenChange={setOpen} title="Invite a user" description="They get an email with a link to set their password.">
        <InviteUserForm onDone={invited} onCancel={() => setOpen(false)} />
      </Modal>
    </>
  );
}
