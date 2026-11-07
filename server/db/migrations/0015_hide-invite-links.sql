-- Invitation links let whoever holds them set the account's password. Remove them from emails already logged.
UPDATE "email_log" SET "body" = regexp_replace("body", '/invite/[A-Za-z0-9_-]+', '/invite/[hidden]', 'g') WHERE "body" ~ '/invite/[A-Za-z0-9_-]+';
