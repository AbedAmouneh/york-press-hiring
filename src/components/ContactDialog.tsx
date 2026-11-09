import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Mail, MessageCircle } from "lucide-react";
import { call, rpc } from "@/lib/rpc";
import { cn, fmtDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError, Modal, Spinner, useToast } from "@/components/kit";
import { LINKEDIN_NOTE_MAX, type ContactChannel, type ContactKind } from "../../shared/schemas";

export type ContactTarget = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  kind: ContactKind;
};

const CHANNELS: { key: ContactChannel; label: string; icon: typeof Mail; needs: string }[] = [
  { key: "email", label: "Email", icon: Mail, needs: "No email address yet" },
  { key: "linkedin", label: "LinkedIn", icon: Briefcase, needs: "No LinkedIn profile" },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, needs: "No phone number" },
];

const SEND_LABEL: Record<ContactChannel, string> = { email: "Send email", linkedin: "Approve for LinkedIn", whatsapp: "Open WhatsApp" };

/**
 * Contact one person: pick a channel, edit the message (it starts from the saved template with one personal line),
 * then Send. Nothing is sent before the button is pressed.
 */
export function ContactDialog({ target, onClose, onSent }: { target: ContactTarget | null; onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const available = (c: ContactChannel) => !!target && (c === "email" ? !!target.email : c === "linkedin" ? !!target.linkedinUrl : !!target.phone);
  const firstAvailable = CHANNELS.find((c) => available(c.key))?.key ?? "email";
  const [channel, setChannel] = useState<ContactChannel>(firstAvailable);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A new person opens on their first usable channel.
  useEffect(() => { if (target) setChannel(firstAvailable); setError(null); }, [target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const draft = useQuery({
    queryKey: ["contact-draft", target?.id, channel, target?.kind],
    queryFn: () => call(rpc["role-candidates"][":id"].contact.draft.$post({ param: { id: target!.id }, json: { channel, kind: target!.kind } })),
    enabled: !!target && available(channel),
    staleTime: Infinity,
  });
  useEffect(() => { if (draft.data) { setSubject(draft.data.subject ?? ""); setBody(draft.data.body); } }, [draft.data]);

  async function send() {
    if (!target) return;
    setBusy(true);
    setError(null);
    // Open the WhatsApp tab inside the click, before waiting for the server, so the browser doesn't block it.
    const tab = channel === "whatsapp" ? window.open("about:blank", "_blank") : null;
    try {
      const res = await call(rpc["role-candidates"][":id"].contact.$post({ param: { id: target.id }, json: { channel, kind: target.kind, subject: channel === "email" ? subject : null, body } }));
      if (channel === "whatsapp" && res.link) {
        if (tab) tab.location.href = res.link;
        else window.location.href = res.link;
      }
      toast(channel === "email" ? `Email sent to ${target.name}.` : channel === "linkedin" ? "Approved. It goes out from your LinkedIn in the next Cowork session." : "WhatsApp opened with your message. Marked as contacted; undo it from the candidate if you don't send it.");
      onSent();
      onClose();
    } catch (e) {
      tab?.close();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const tooLong = channel === "linkedin" && body.length > LINKEDIN_NOTE_MAX;
  const d = draft.data;
  return (
    <Modal open={!!target} onOpenChange={(o) => !o && onClose()} title={`${target?.kind === "follow_up" ? "Follow up with" : "Contact"} ${target?.name ?? ""}`} description="Edit the message, then send it. Nothing goes out until you press the button.">
      {target && (
        <div className="grid gap-4">
          <div role="radiogroup" aria-label="Channel" className="grid grid-cols-3 gap-1 rounded-lg bg-secondary p-1">
            {CHANNELS.map(({ key, label, icon: Icon, needs }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={channel === key}
                disabled={!available(key)}
                title={available(key) ? undefined : needs}
                onClick={() => { setChannel(key); setError(null); }}
                className={cn("flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40", channel === key ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>

          {!available(channel) ? (
            <p className="text-sm text-muted-foreground">{CHANNELS.find((c) => c.key === channel)?.needs}.</p>
          ) : draft.isLoading ? <Spinner /> : draft.error ? <FormError>{(draft.error as Error).message}</FormError> : d && (
            <>
              {d.recentContact && (
                <p role="status" className="rounded-md bg-chip-amber/15 px-3 py-2 text-sm">
                  Already contacted for <b>{d.recentContact.roleTitle}</b> on {fmtDate(d.recentContact.at)}.
                </p>
              )}
              <div className="grid gap-1 text-xs text-muted-foreground">
                <div>To: <span className="text-foreground">{channel === "whatsapp" ? `+${d.to}` : d.to}</span></div>
                {d.email && (
                  <>
                    <div>From: {d.email.from}</div>
                    <div>Replies go to: {d.email.replyTo.join(", ")}</div>
                    {!!d.email.cc.length && <div>CC: {d.email.cc.join(", ")}</div>}
                  </>
                )}
              </div>
              {channel === "email" && (
                <Field label="Subject" htmlFor="contact-subject"><Input id="contact-subject" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
              )}
              <Field
                label="Message"
                htmlFor="contact-body"
                hint={channel === "linkedin" ? `${body.length} / ${LINKEDIN_NOTE_MAX} characters` : channel === "email" ? "An unsubscribe link is added at the end." : "WhatsApp opens with this message; you press send there."}
                error={tooLong ? `LinkedIn notes are limited to ${LINKEDIN_NOTE_MAX} characters.` : undefined}
              >
                <Textarea id="contact-body" rows={channel === "email" ? 10 : 6} className="max-h-[45dvh]" value={body} onChange={(e) => setBody(e.target.value)} />
              </Field>
            </>
          )}
          <FormError>{error}</FormError>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={busy || !available(channel) || !d || tooLong || body.trim().length < 5} onClick={send}>{busy ? "Sending…" : SEND_LABEL[channel]}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
