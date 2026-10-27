import { REQUEST_STATUS_LABELS, type CandidateStatus, type RequestStatus } from "../../shared/types";
import { Badge, type Tone } from "@/components/kit";

const REQ_TONE: Record<RequestStatus, Tone> = {
  draft: "neutral",
  submitted: "info",
  changes_requested: "warn",
  rejected: "bad",
  sourcing: "brand",
  open: "good",
  closed: "neutral",
};
export const RequestStatusBadge = ({ status }: { status: RequestStatus }) => <Badge tone={REQ_TONE[status]} dot>{REQUEST_STATUS_LABELS[status]}</Badge>;

const C_TONE: Record<CandidateStatus, Tone> = { new: "neutral", contacted: "info", replied: "brand", interview: "good", rejected: "bad", hired: "dark" };
export const CandidateStatusBadge = ({ status }: { status: CandidateStatus }) => (
  <Badge tone={C_TONE[status]}>{status[0].toUpperCase() + status.slice(1)}</Badge>
);

const O_LABEL: Record<string, [string, Tone]> = {
  queued: ["Email queued", "warn"],
  sent: ["Sent", "good"],
  failed: ["Failed", "bad"],
  cancelled: ["Cancelled", "neutral"],
  skipped: ["Skipped", "neutral"],
  awaiting_approval: ["LinkedIn · needs approval", "warn"],
  approved: ["LinkedIn · approved", "info"],
};
export function OutreachBadge({ outreach }: { outreach: { channel: string; status: string } | null }) {
  if (!outreach) return <span className="text-xs text-muted-foreground">—</span>;
  const [label, tone] = O_LABEL[outreach.status] ?? [outreach.status, "neutral"];
  return <Badge tone={tone}>{outreach.status === "sent" ? `${outreach.channel === "email" ? "Email" : "LinkedIn"} sent` : label}</Badge>;
}
