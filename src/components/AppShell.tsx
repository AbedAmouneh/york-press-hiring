import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, Briefcase, CheckSquare, FileText, Inbox, Send, LogOut, Mail, Settings, Users } from "lucide-react";
import { call, rpc } from "@/lib/rpc";
import { can, useLogout, useMe } from "@/lib/auth";
import type { Me } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { ROLE_LABELS } from "../../shared/types";

type Item = { to: string; label: string; icon: typeof Bell; count?: number; show: boolean };

export function AppShell({ me }: { me: Me }) {
  const logout = useLogout();
  const preview = useMe().data?.preview ?? false;
  const notes = useQuery({ queryKey: ["notifications"], queryFn: () => call(rpc.notifications.$get()), refetchInterval: 30_000 });
  const approvals = useQuery({
    queryKey: ["requests", "approvals"],
    queryFn: () => call(rpc.requests.$get({ query: { scope: "approvals" } })),
    enabled: can(me, "ceo"),
    refetchInterval: 60_000,
  });
  const items: Item[] = [
    { to: "/approvals", label: "Approvals", icon: CheckSquare, count: approvals.data?.requests.length, show: can(me, "ceo") },
    { to: "/roles", label: can(me, "recruiter", "admin", "ceo") ? "Open roles" : "My roles", icon: Briefcase, show: true },
    { to: "/requests", label: can(me, "recruiter", "admin", "ceo") ? "All requests" : "My requests", icon: FileText, show: true },
    { to: "/outreach", label: "Email outreach", icon: Mail, show: can(me, "recruiter", "admin") },
    { to: "/linkedin", label: "LinkedIn queue", icon: Send, show: can(me, "recruiter", "admin") },
    { to: "/outbox", label: "Sent emails", icon: Inbox, show: can(me, "recruiter", "admin") },
    { to: "/settings", label: "Settings", icon: Settings, show: can(me, "recruiter", "admin") },
    { to: "/admin/users", label: "Users", icon: Users, show: can(me, "admin") },
    { to: "/notifications", label: "Notifications", icon: Bell, count: notes.data?.unread, show: true },
  ];
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="sticky top-0 z-30 flex shrink-0 flex-col gap-4 bg-primary px-3 py-4 text-primary-foreground md:h-screen md:w-60">
        <div className="flex items-center justify-between px-2">
          <Logo dark />
          <button onClick={logout} className="rounded p-2 text-white/70 hover:bg-white/10 md:hidden" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
        </div>
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {items.filter((i) => i.show).map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              className={({ isActive }) =>
                cn("flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white",
                  isActive && "bg-white/10 font-semibold text-white shadow-[inset_3px_0_0_var(--brand)]")
              }
            >
              <i.icon className="h-4 w-4" />
              <span className="flex-1">{i.label}</span>
              {!!i.count && <span className="rounded-full bg-brand px-1.5 text-[11px] font-bold text-primary">{i.count}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-white/10 px-2 pt-3 md:block">
          <div className="text-sm font-medium">{me.name}</div>
          <div className="text-xs text-white/60">{me.roles.map((r) => ROLE_LABELS[r]).join(" · ")}</div>
          {me.isDemo && <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-brand">Demo account</div>}
          <button onClick={logout} className="mt-3 flex items-center gap-2 text-xs text-white/70 hover:text-white"><LogOut className="h-3.5 w-3.5" /> Sign out</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
        {preview && (
          <div role="status" className="mx-auto mb-5 max-w-6xl rounded-md border border-warning bg-warning/10 px-3 py-2 text-sm">
            <b>Test copy for a pull request.</b> Uses sample candidates and the mock outbox: nothing here emails anyone or spends credits.
          </div>
        )}
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
