# DineOS backups

Every night at 03:05 India time, `.github/workflows/backup.yml` copies the database, locks the copy
with your backup passphrase and keeps it on GitHub for 30 days. Older copies delete themselves
(DPDP: data isn't kept longer than needed). The repository is public, so only the locked file is
ever stored. Without the passphrase nobody, including GitHub, can open it.

## Setting it up (once, by the owner)

1. Supabase → project **dineos** → **Connect** → **Session pooler**. Copy the connection string and
   put your database password in place of `[YOUR-PASSWORD]`.
2. GitHub → **littlegasp/Dinedot** → **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_DB_URL`: the string from step 1
   - `BACKUP_PASSPHRASE`: a long passphrase. Save it in your password manager. If it's lost, the backups can't be opened.
3. **Actions → Backup → Run workflow** once to check. A file `dineos-backup-<date>` appears under the run.

Scheduled runs only start from the repository's default branch, so `backup.yml` also has to be on
that branch (today `main`).

## Restoring (only if something went badly wrong)

1. Download the backup from the Actions run and unlock it:
   `gpg --decrypt dineos-YYYY-MM-DD.tar.gpg | tar -xf -`. This gives `public.dump` and `auth.dump`.
2. In a **new** Supabase project (Mumbai), restore the logins first, then the data:
   `pg_restore --data-only -d "$NEW_DB_URL" auth.dump`
   `pg_restore --no-owner --no-privileges -d "$NEW_DB_URL" public.dump`
3. Re-run the lockdown check from `CLAUDE.md` (guests can run only the six guest functions, every table locked).
4. Point the app's `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_KEY` (Cloudflare build variables) at the new project.

Restoring into the live project over live data is not recommended. Restore next to it and compare first.
