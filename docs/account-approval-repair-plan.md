# MicroBuild — Account Approval Workflow Repair Plan

**Date:** May 2026  
**Issue:** Migration `supabase/migrations/account-approval-workflow.sql` partially failed.  
**Severity:** Non-critical — no production data lost; only test rows are affected.  
**Principle:** Do not delete any rows. Do not rewrite the schema. Repair by archiving.

---

## 1. What Happened

### The Error

```
ERROR: could not create unique index "uidx_creator_apps_email_active"
DETAIL: Key (lower(email))=(derraiden8@gmail.com) is duplicated.
```

### Which statement failed

Line 133–135 of `account-approval-workflow.sql`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uidx_creator_apps_email_active
  ON public.creator_applications (lower(email))
  WHERE status NOT IN ('rejected', 'suspended');
```

This is a **partial unique index** — it only enforces uniqueness on rows where `status` is not `'rejected'` or `'suspended'`. The index failed because the `creator_applications` table already contains **two or more rows** for the email `derraiden8@gmail.com` that are both in a non-terminal state (not `'rejected'`, not `'suspended'`).

These are development test submissions — the developer submitted the creator application form multiple times during testing before duplicate-prevention was built.

---

## 2. What Partially Ran (Before the Failure)

The migration is a series of individual SQL statements. Supabase SQL editor runs them sequentially. Based on the error location (step 6 of 7), the following statements **likely already executed**:

| Step | Statements | Likely Status |
|------|-----------|--------------|
| 1 | DROP + ADD CHECK constraint on `creator_applications.status` | ✅ Ran |
| 2 | ADD COLUMN IF NOT EXISTS × 9 on `creator_applications` | ✅ Ran |
| 3 | UPDATE `approval_status = status` WHERE NULL | ✅ Ran |
| 4 | ADD COLUMN IF NOT EXISTS × 5 on `user_profiles` | ✅ Ran |
| 5 | ADD COLUMN IF NOT EXISTS × 2 on `creator_profiles` | ✅ Ran |
| 6a | DROP INDEX + CREATE `uidx_creator_apps_auth_user_active` | ✅ Ran (no auth_user_id conflicts — all NULL) |
| **6b** | DROP INDEX + **CREATE `uidx_creator_apps_email_active`** | ❌ **FAILED HERE** |
| 6c | DROP INDEX + CREATE `uidx_creator_profiles_application` | ⚠️ Did not run |
| 6d | DROP INDEX + CREATE `uidx_creator_profiles_user_profile` | ⚠️ Did not run |
| 7 | CREATE INDEX × 3 (non-unique, just performance) | ⚠️ Did not run |

**How to confirm:** Run the diagnostics queries in sections C (columns) and E (indexes) in `supabase/diagnostics/account-approval-diagnostics.sql`. If the new columns exist on `creator_applications` (e.g., `approval_status`, `auth_user_id`) but `uidx_creator_apps_email_active` does not appear in the index list, the above table is accurate.

---

## 3. What Data Conflict Exists

### The duplicate rows

The email `derraiden8@gmail.com` (likely the developer's own test account) appears in `creator_applications` at least twice, both rows with a status that is **not** `'rejected'` or `'suspended'`.

**Pattern:** The developer submitted the `/creators/apply` form more than once during testing, producing multiple `new`/`reviewing`/etc. rows for the same email. Before this migration, there was no unique constraint preventing this.

### Why only this index fails

- `uidx_creator_apps_auth_user_active` (by `auth_user_id`) did **not** fail because all old test submissions have `auth_user_id = NULL` — they were made before auth linking was implemented. A unique index on a null column has no effect (NULLs are never considered equal in partial indexes).
- `uidx_creator_apps_email_active` (by `lower(email)`) **did** fail because email was always captured, and the test rows share the same email.

---

## 4. Non-Destructive Repair Options

### Option A — Archive by updating status (Recommended)

Mark all but the **most recent** duplicate row for each conflicting email as `'rejected'` with `approval_status = 'archived_test_duplicate'`. The partial index only applies when `status NOT IN ('rejected', 'suspended')`, so archived rows fall outside the uniqueness check.

**No rows are deleted.** All data is preserved. The audit trail remains intact.

### Option B — Widen the index to exclude only NULL emails

Change the index definition to skip rows where email is NULL. This does not help here because all rows have emails — it would not resolve the conflict.

### Option C — Delete the duplicate test rows

Not recommended. The repair plan avoids deletes to protect any potentially real data, and because the user explicitly said "Do not delete data."

---

## 5. Recommended Fix

### Step 1 — Run diagnostics first

Run `supabase/diagnostics/account-approval-diagnostics.sql` (sections A and C) in the Supabase SQL editor to confirm:
- How many duplicate rows exist
- Which row IDs are the duplicates
- Whether the new columns from the migration exist

### Step 2 — Archive the older duplicate rows

Run the following SQL **after reviewing the diagnostic output**.

This UPDATE archives any older duplicate rows per email (keeping the most recent one active), setting their `status` to `'rejected'` so they fall outside the partial unique index filter. It sets `approval_status` to `'archived_test_duplicate'` so they are clearly marked as intentionally archived, not legitimately rejected.

```sql
-- ============================================================
-- REPAIR STEP 1 of 2: Archive older duplicate test rows
-- ============================================================
-- This UPDATE affects only rows that are:
--   a) Not the most recent row for their email
--   b) Currently in a non-terminal status (not already rejected/suspended)
--   c) Have no auth_user_id (were submitted before auth linking existed)
--
-- It does NOT delete any rows.
-- It does NOT affect the most recent application per email.
-- It does NOT affect any row that is already rejected or suspended.
-- ============================================================

UPDATE public.creator_applications
SET
  status          = 'rejected',
  approval_status = 'archived_test_duplicate',
  admin_notes     = 'Archived by repair script — older duplicate test submission. Not a real rejection.',
  admin_decision_at = now()
WHERE id IN (
  -- Select all non-latest rows per email that are in non-terminal status
  SELECT id
  FROM (
    SELECT
      id,
      lower(email) AS email_lower,
      status,
      created_at,
      auth_user_id,
      ROW_NUMBER() OVER (
        PARTITION BY lower(email)
        ORDER BY created_at DESC   -- keep newest (row_number = 1)
      ) AS rn
    FROM public.creator_applications
    WHERE status NOT IN ('rejected', 'suspended')
  ) ranked
  WHERE rn > 1                     -- only older duplicates
    AND auth_user_id IS NULL        -- extra safety: only pre-auth test rows
);

-- Verify: after this UPDATE, no email should appear more than once
-- in non-terminal status:
SELECT lower(email) AS email, count(*) AS count
FROM public.creator_applications
WHERE status NOT IN ('rejected', 'suspended')
GROUP BY lower(email)
HAVING count(*) > 1;
-- Expected: 0 rows returned
```

### Step 3 — Create the remaining indexes

Once the duplicates are resolved, create the three indexes that failed or did not run:

```sql
-- ============================================================
-- REPAIR STEP 2 of 2: Create the indexes that failed/didn't run
-- ============================================================

-- Index 6b (failed): one active application per email
DROP INDEX IF EXISTS uidx_creator_apps_email_active;
CREATE UNIQUE INDEX uidx_creator_apps_email_active
  ON public.creator_applications (lower(email))
  WHERE status NOT IN ('rejected', 'suspended');

-- Index 6c (didn't run): one creator_profile per application
DROP INDEX IF EXISTS uidx_creator_profiles_application;
CREATE UNIQUE INDEX IF NOT EXISTS uidx_creator_profiles_application
  ON public.creator_profiles (creator_application_id)
  WHERE creator_application_id IS NOT NULL;

-- Index 6d (didn't run): one creator_profile per user_profile_id
DROP INDEX IF EXISTS uidx_creator_profiles_user_profile;
CREATE UNIQUE INDEX IF NOT EXISTS uidx_creator_profiles_user_profile
  ON public.creator_profiles (user_profile_id)
  WHERE user_profile_id IS NOT NULL;

-- Step 7 indexes (didn't run): non-unique performance indexes
CREATE INDEX IF NOT EXISTS idx_creator_applications_auth_user_id
  ON public.creator_applications (auth_user_id);

CREATE INDEX IF NOT EXISTS idx_creator_applications_user_profile_id
  ON public.creator_applications (user_profile_id);

CREATE INDEX IF NOT EXISTS idx_creator_applications_approval_status
  ON public.creator_applications (approval_status);
```

### Step 4 — Verify

Run sections D and E from the diagnostics file to confirm:
- The new unique indexes exist
- No duplicate violations remain

---

## 6. Rows to Keep vs. Archive

| Email | Keep | Archive |
|-------|------|---------|
| `derraiden8@gmail.com` | Most recent row (`created_at DESC`) | All older rows |

The "keep" row is the one most likely to represent the current/intended application. The "archive" rows are clearly test submissions that pre-date any auth linking.

---

## 7. What the Migration Already Changed (Do Not Re-Run)

The following parts of `account-approval-workflow.sql` **already executed** and should **not** be re-run in isolation — they are guarded with `IF NOT EXISTS` / `IF EXISTS` and are safe to re-run as a full script, but running them again will be a no-op:

- `DROP CONSTRAINT IF EXISTS creator_applications_status_check` → already dropped
- `ADD CONSTRAINT creator_applications_status_check` → already added with extended values
- All `ADD COLUMN IF NOT EXISTS` statements on all three tables → columns exist
- `UPDATE approval_status = status WHERE approval_status IS NULL` → already updated
- `CREATE UNIQUE INDEX uidx_creator_apps_auth_user_active` → already created

---

## 8. After the Repair

Once the repair SQL runs cleanly:
1. The `account-approval-workflow.sql` migration is fully effective — all columns and indexes are in place.
2. Future application submissions from logged-in users will be deduplicated at the DB level.
3. Future application submissions from the same email (even if not logged in) will be blocked if a non-terminal row already exists.
4. The archived test rows remain visible in admin for audit purposes, clearly marked with `approval_status = 'archived_test_duplicate'`.

---

## 9. Warnings

- **Do not delete rows** from `creator_applications` — even test rows may be referenced by foreign keys.
- **Do not rerun the full `account-approval-workflow.sql`** until the duplicate rows are archived — it will fail again at the same index step.
- **Do not widen the index filter** (e.g., excluding more statuses) — this defeats the purpose of the duplicate prevention.
- **Do not run this on production** without first running the full diagnostics and understanding which rows are affected.
