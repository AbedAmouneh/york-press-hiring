export type DecisionAction = "approve" | "reject" | "request_changes";

/** What the requester and hiring manager are told when Khalil decides on a request. */
export function decisionNotice(action: DecisionAction, by: string, title: string, comment?: string | null) {
  const verb = action === "approve" ? "approved" : action === "reject" ? "rejected" : "asked for changes to";
  const label = action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Changes requested";
  const note = comment?.trim() ? `\n\n${by}'s comment:\n${comment.trim()}` : "";
  const next =
    action === "approve" ? "\n\nSourcing has started; you'll be notified when candidates are ready."
    : action === "request_changes" ? "\n\nOpen the request, make the changes and submit it again."
    : "";
  return {
    title: `${label}: ${title}`,
    emailBody: `${by} ${verb} your request for ${title}.${note}${next}`,
  };
}
