import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Trash2 } from "lucide-react";
import { call, rpc } from "@/lib/rpc";
import { fmtDateTime } from "@/lib/utils";
import { Avatar, FormError, useToast } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { MESSAGE_DELETE_MINUTES, MESSAGE_MAX } from "../../shared/messages";

/** The back-and-forth on a request. Everyone who can open the request can read and post. */
export function Discussion({ requestId, meId }: { requestId: string; meId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const key = ["messages", requestId];
  const q = useQuery({ queryKey: key, queryFn: () => call(rpc.requests[":id"].messages.$get({ param: { id: requestId } })), refetchInterval: 30_000 });
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const messages = q.data?.messages ?? [];
  const { hash } = useLocation();
  const loaded = !!q.data;
  // A notification links to #discussion: scroll there once the messages are on screen.
  useEffect(() => {
    if (loaded && hash === "#discussion") document.getElementById("discussion")?.scrollIntoView({ block: "start" });
  }, [loaded, hash]);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await call(rpc.requests[":id"].messages.$post({ param: { id: requestId }, json: { body: text } }));
      setText("");
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  async function remove(messageId: string) {
    try {
      await call(rpc.requests[":id"].messages[":messageId"].$delete({ param: { id: requestId, messageId } }));
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast((e as Error).message, "error");
      await qc.invalidateQueries({ queryKey: key });
    }
  }

  return (
    <Card id="discussion" className="scroll-mt-20 gap-4 p-6">
      <h2 className="font-semibold">Discussion</h2>
      {messages.length ? (
        <ol aria-label="Messages" className="grid gap-4">
          {messages.map((m) => (
            <li key={m.id} className="group flex gap-3">
              <Avatar name={m.authorName} size="sm" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="font-medium">{m.authorId === meId ? "You" : m.authorName}</span>
                  <span className="text-xs text-muted-foreground">{fmtDateTime(m.createdAt)}</span>
                  {m.canDelete && m.authorId === meId && (
                    <button
                      type="button"
                      onClick={() => remove(m.id)}
                      className="ml-auto rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                      aria-label="Delete message"
                      title={`You can delete this for ${MESSAGE_DELETE_MINUTES} minutes after sending`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                <p dir="auto" className="whitespace-pre-line break-words text-start text-sm">{m.body}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        !q.isLoading && <p className="text-sm text-muted-foreground">No messages yet. Ask a question or add context for the team.</p>
      )}
      <form
        className="grid gap-2"
        onSubmit={(e) => { e.preventDefault(); void send(); }}
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
          rows={3}
          dir="auto"
          maxLength={MESSAGE_MAX}
          placeholder="Write a message"
          aria-label="Write a message"
        />
        <FormError>{error}</FormError>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{text.length > MESSAGE_MAX - 200 ? `${text.length} / ${MESSAGE_MAX}` : "Everyone on this request is notified."}</span>
          <Button type="submit" size="sm" disabled={!text.trim() || sending}><Send /> Send</Button>
        </div>
      </form>
    </Card>
  );
}
