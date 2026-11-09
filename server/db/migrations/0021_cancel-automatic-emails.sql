-- Outreach is now sent only when someone presses Send. Emails that runs queued automatically are cancelled so
-- nothing goes out that a person didn't press Send on; they can contact those people again from the role page.
UPDATE "outreach_messages" SET "status" = 'cancelled', "error" = 'Cancelled: messages are now sent only when someone presses Send.'
WHERE "channel" = 'email' AND "status" = 'queued';
