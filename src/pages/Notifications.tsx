import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { call, rpc } from "@/lib/rpc";
import { fmtDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { EmptyState, Spinner } from "@/components/kit";
import { Card } from "@/components/ui/card";


export default function Notifications() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => call(rpc.notifications.$get()) });
  async function readAll() {
    await call(rpc.notifications.read.$post({ json: {} }));
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  return (
    <>
      <PageHeader eyebrow="In the app and by email" title="Notifications">
        {!!q.data?.unread && <Button variant="outline" onClick={readAll}>Mark all read</Button>}
      </PageHeader>
      {q.isLoading ? <Spinner /> : q.data?.notifications.length ? (
        <Card className="divide-y">
          {q.data.notifications.map((n) => {
            const inner = (
              <div className="flex items-start gap-3 px-4 py-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand ring-2 ring-primary/10"}`} />
                <span className={`flex-1 text-sm ${n.readAt ? "text-muted-foreground" : "font-medium"}`}>{n.title}</span>
                <span className="num whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(n.createdAt)}</span>
              </div>
            );
            return n.link ? (
              <Link key={n.id} to={n.link} className="block hover:bg-secondary/50" onClick={() => call(rpc.notifications.read.$post({ json: { ids: [n.id] } })).then(() => qc.invalidateQueries({ queryKey: ["notifications"] }))}>{inner}</Link>
            ) : <div key={n.id}>{inner}</div>;
          })}
        </Card>
      ) : <EmptyState title="No notifications yet" />}
    </>
  );
}
