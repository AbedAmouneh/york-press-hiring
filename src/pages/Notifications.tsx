import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { call, rpc } from "@/lib/rpc";
import type { Notification } from "@/lib/types";
import { cn } from "@/lib/utils";
import { dayGroup } from "@/lib/dates";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { EmptyState, FilterChips, Spinner } from "@/components/kit";
import { Card } from "@/components/ui/card";

export default function Notifications() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => call(rpc.notifications.$get()) });
  const all = q.data?.notifications ?? [];
  const rows = filter === "unread" ? all.filter((n) => !n.readAt) : all;
  const groups = new Map<string, Notification[]>();
  for (const n of rows) {
    const g = dayGroup(n.createdAt);
    groups.set(g, [...(groups.get(g) ?? []), n]);
  }
  const markRead = (ids?: string[]) => call(rpc.notifications.read.$post({ json: ids ? { ids } : {} })).then(() => qc.invalidateQueries({ queryKey: ["notifications"] }));

  return (
    <>
      <PageHeader title="Notifications">
        {!!q.data?.unread && <Button variant="outline" size="sm" onClick={() => markRead()}>Mark all read</Button>}
      </PageHeader>
      <FilterChips label="Filter notifications" options={[{ key: "all", label: "All", count: all.length }, { key: "unread", label: "Unread", count: q.data?.unread ?? 0 }]} value={filter} onChange={setFilter} />
      {q.isLoading ? <Spinner /> : rows.length ? (
        <div className="grid gap-6">
          {[...groups].map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-2 text-xs font-medium text-muted-foreground">{day}</h2>
              <Card className="gap-0 p-0">
                <ul className="divide-y">
                  {items.map((n) => {
                    const inner = (
                      <div className="flex items-start gap-3 px-4 py-3">
                        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} aria-label={n.readAt ? undefined : "Unread"} />
                        <span className={cn("flex-1 text-sm", n.readAt ? "text-muted-foreground" : "font-medium")}>{n.title}</span>
                        <span className="num whitespace-nowrap text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    );
                    return (
                      <li key={n.id}>
                        {n.link ? <Link to={n.link} className="block hover:bg-secondary/50" onClick={() => markRead([n.id])}>{inner}</Link> : inner}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      ) : <EmptyState title={filter === "unread" ? "No unread notifications" : "No notifications yet"} />}
    </>
  );
}
