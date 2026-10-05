# Backup and restore (runbook)

PL-BACKUPS / AC-164. Production data lives on the self-hosted backend on the
production box (`pop-os`). `scripts/backup-capsule.ts` backs it up and puts a
backup back. The restore drill `scripts/qualify-backup-restore.ts` proves a
backup brings a company back; its last result is
`docs/quality/backup-restore-drill.json`.

## What a backup holds

- Every table (events, clients, menus, people, history, settings rows).
- Every stored file (dish and equipment pictures, attachments, chat files).
- A receipt beside it (`capsule-<time>.json`): when it was taken, the release
  the backend ran, size, SHA-256 of the backup file, and the **names** of the
  backend's settings. Setting values (keys, passwords) are never copied out of
  the backend. After a rebuild, each named setting must be set again from where
  it was first made (Clerk, Google, QuickBooks, Twilio, email service, the
  field encryption key).

The backup file is encrypted (AES-256-GCM) with `CAPSULE_BACKUP_KEY`. Without
that key a backup cannot be read, by anyone, including us.

## One-time setup on the production box

1. Make the key: `openssl rand -base64 32`.
2. Put it in the checkout's `.env.local` as `CAPSULE_BACKUP_KEY=<key>`.
3. Keep a second copy of the key **off the box** (password manager). If the
   box dies with the only copy, every backup is lost with it.
4. Add the daily job (`crontab -e`), 3 am box time:

   ```
   0 3 * * * cd ~/capsule && bun scripts/backup-capsule.ts backup >> ~/capsule-backups/backup.log 2>&1
   ```

Backups go to `~/capsule-backups`; the newest 14 stay (`--keep <n>` changes
that, `--dir <folder>` puts them on another drive). Copying that folder to a
second machine or drive protects against losing the box itself; the files are
encrypted, so the copy needs no extra protection.

## Restore

A restore **replaces everything** on the target backend with the backup.
Anything written after the backup was taken is gone, so restore only when the
data is lost or broken, and tell the team what time the backup is from.

1. Stop staff from working in Capsule (the restore takes about a minute for a
   small company; longer with many pictures).
2. On the box, in the checkout:

   ```
   bun scripts/backup-capsule.ts restore ~/capsule-backups/capsule-<time>.capsule-backup --target <CONVEX_SELF_HOSTED_URL>
   ```

   `--target` must be typed out and equal the backend address in
   `.env.local`; anything else stops before touching data.
3. Check: sign in, open an event with a menu, open a dish picture.
4. If the restore went to a new box, set each setting the receipt names, then
   deploy the release the receipt names with `scripts/deploy-backend.sh`.

## What a restore cannot bring back

The same list as a code rollback (health-and-recovery.md): emails, texts,
webhooks, Google Calendar events and QuickBooks records already sent stay
sent. After a restore, Capsule may send some of them again for work written
after the backup was taken; check the other system before resending by hand.

## The drill

`bun run --cwd <checkout> scripts/qualify-backup-restore.ts` runs on any
machine with this checkout; it never touches the shared dev or production
backend. It fills a throwaway backend with a company, backs it up three times
with `--keep 2`, writes one more client, starts a second, empty backend,
tries a wrong key, restores, and checks ids, counts, links between records,
picture bytes, the owner's sign-in and a stranger's sign-in. Last run
(2026-10-04): 13 of 13 checks passed; backup 2.2 s, restore 42 s (67 s from
an empty backend to a restored company).
