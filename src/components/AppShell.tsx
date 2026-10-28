import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, Briefcase, CheckSquare, FileText, House, Inbox, LogOut, Mail, Menu, Plus, Send, Settings, Users } from "lucide-react";
import { call, rpc } from "@/lib/rpc";
import { can, useLogout, useMe } from "@/lib/auth";
import type { Me } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Avatar } from "./kit";
import { GlobalSearch } from "./GlobalSearch";
import { Logo } from "./Logo";
import { ROLE_LABELS } from "../../shared/types";

type Item = { to: string; label: string; icon: typeof Bell; count?: number; show: boolean };

function useNavItems(me: Me): Item[][] {
  const approvals = useQuery({
    queryKey: ["requests", "approvals"],
    queryFn: () => call(rpc.requests.$get({ query: { scope: "approvals" } })),
    enabled: can(me, "ceo"),
    refetchInterval: 60_000,
  });
  const staff = can(me, "recruiter", "admin");
  // Grouped: everyday work, then sending, then admin. Empty groups are dropped.
  return [
    [
      { to: "/", label: "Home", icon: House, show: true },
      { to: "/approvals", label: "Approvals", icon: CheckSquare, count: approvals.data?.requests.length, show: can(me, "ceo") },
      { to: "/roles", label: "Roles", icon: Briefcase, show: true },
      { to: "/requests", label: "Requests", icon: FileText, show: true },
    ],
    [
      { to: "/outreach", label: "Email outreach", icon: Mail, show: staff },
      { to: "/linkedin", label: "LinkedIn queue", icon: Send, show: staff },
      { to: "/outbox", label: "Sent emails", icon: Inbox, show: staff },
    ],
    [
      { to: "/settings", label: "Settings", icon: Settings, show: staff },
      { to: "/admin/users", label: "Users", icon: Users, show: can(me, "admin") },
    ],
  ].map((g) => g.filter((i) => i.show)).filter((g) => g.length);
}

function Sidebar({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  const logout = useLogout();
  const groups = useNavItems(me);
  return (
    <div className="flex h-full flex-col bg-ink px-3 py-4 text-white">
      <Link to="/" className="px-2" onClick={onNavigate}><Logo dark /></Link>
      <nav aria-label="Main" className="mt-6 flex flex-col gap-4">
        {groups.map((g, gi) => (
          <div key={gi} className={cn("flex flex-col gap-0.5", gi > 0 && "border-t border-white/10 pt-4")}>
            {g.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.to === "/"}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn("flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white",
                    isActive && "bg-white/12 font-medium text-white")
                }
              >
                <i.icon className="size-4" />
                <span className="flex-1">{i.label}</span>
                {!!i.count && <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white">{i.count}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="mt-auto flex items-center gap-2.5 rounded-lg px-2 pt-4">
        <Avatar name={me.name} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-medium">{me.name}</div>
          <div className="truncate text-xs text-white/55">{me.isDemo ? "Demo · " : ""}{me.roles.map((r) => ROLE_LABELS[r]).join(" · ")}</div>
        </div>
        <button onClick={logout} className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Sign out" title="Sign out">
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function AppShell({ me }: { me: Me }) {
  const preview = useMe().data?.preview ?? false;
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  const notes = useQuery({ queryKey: ["notifications"], queryFn: () => call(rpc.notifications.$get()), refetchInterval: 30_000 });
  const unread = notes.data?.unread ?? 0;
  const canRequest = can(me, "manager", "recruiter", "admin");
  return (
    <div className="min-h-full">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 md:block"><Sidebar me={me} /></aside>
      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="left" className="w-64 border-0 p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Main navigation</SheetDescription>
          <Sidebar me={me} onNavigate={() => setMenu(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-h-screen flex-col md:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur md:px-8">
          <button onClick={() => setMenu(true)} className="-ml-1 rounded-md p-1.5 hover:bg-secondary md:hidden" aria-label="Open menu"><Menu className="size-5" /></button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2">
            {canRequest && pathname !== "/requests/new" && (
              <Button asChild size="sm" className="gap-1.5">
                <Link to="/requests/new"><Plus className="size-4" /><span className="hidden sm:inline">New request</span></Link>
              </Button>
            )}
            <Link
              to="/notifications"
              className="relative rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
            >
              <Bell className="size-5" />
              {unread > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-white">{unread > 9 ? "9+" : unread}</span>}
            </Link>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          {preview && (
            <div role="status" className="mx-auto mb-5 max-w-6xl rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
              <b>Test copy.</b> Sample candidates only; nothing is emailed.
            </div>
          )}
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
