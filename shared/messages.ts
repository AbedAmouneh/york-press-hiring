// Rules for the discussion on a request, shared by the API and the screens.

/** Longest message, matching the limit on Khalil's decision comments. */
export const MESSAGE_MAX = 2000;

/** How long the author has to delete a message they posted by mistake. After that it stays, so the record can be trusted. */
export const MESSAGE_DELETE_MINUTES = 15;

/** Only the author, and only within the delete window. */
export function canDeleteMessage(m: { authorId: string | null; createdAt: string | Date }, userId: string, now = new Date()) {
  if (!m.authorId || m.authorId !== userId) return false;
  return now.getTime() - new Date(m.createdAt).getTime() <= MESSAGE_DELETE_MINUTES * 60_000;
}
