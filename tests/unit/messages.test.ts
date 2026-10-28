import { describe, expect, it } from "vitest";
import { canDeleteMessage, MESSAGE_DELETE_MINUTES, MESSAGE_MAX } from "../../shared/messages.js";
import { MessageInput } from "../../shared/schemas.js";

const sent = new Date("2026-10-28T10:00:00Z");
const after = (minutes: number) => new Date(sent.getTime() + minutes * 60_000);

describe("canDeleteMessage", () => {
  it("lets the author delete within the window", () => {
    expect(canDeleteMessage({ authorId: "me", createdAt: sent }, "me", after(1))).toBe(true);
    expect(canDeleteMessage({ authorId: "me", createdAt: sent.toISOString() }, "me", after(MESSAGE_DELETE_MINUTES))).toBe(true);
  });
  it("keeps the message after the window", () => {
    expect(canDeleteMessage({ authorId: "me", createdAt: sent }, "me", after(MESSAGE_DELETE_MINUTES + 1))).toBe(false);
  });
  it("never lets someone else delete it, even a removed author's message", () => {
    expect(canDeleteMessage({ authorId: "me", createdAt: sent }, "someone-else", after(1))).toBe(false);
    expect(canDeleteMessage({ authorId: null, createdAt: sent }, "me", after(1))).toBe(false);
  });
});

describe("MessageInput", () => {
  it("needs some text and trims it", () => {
    expect(MessageInput.safeParse({ body: "  \n " }).success).toBe(false);
    expect(MessageInput.parse({ body: "  Is the budget OK?  " }).body).toBe("Is the budget OK?");
  });
  it("caps the length", () => {
    expect(MessageInput.safeParse({ body: "x".repeat(MESSAGE_MAX) }).success).toBe(true);
    expect(MessageInput.safeParse({ body: "x".repeat(MESSAGE_MAX + 1) }).success).toBe(false);
  });
});
