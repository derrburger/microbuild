-- ============================================================
-- MicroBuild — Account Approval Diagnostics
-- ============================================================
-- PURPOSE: SELECT-only audit queries.
--          Read the results before making any changes.
--          Run in the Supabase SQL editor one block at a time.
--
-- Sections:
--   A. Duplicate detection — creator_applications
--   B. Application status distribution
--   C. Schema audit — current columns on all three tables
--   D. Constraint audit — what constraints exist
--   E. Index audit — what indexes exist
--   F. RLS policy audit
--   G. Cross-table linkage audit
-- ============================================================


-- ═══════════════════════════════════════════════════════════
-- A. DUPLICATE DETECTION — creator_applications
-- ═══════════════════════════════════════════════════════════

-- A1. Duplicate emails (case-insensitive) among NON-terminal rows
--     These are the rows that caused uidx_creator_apps_email_active to fail.
--     Any email with count > 1 here must be resolved before the index can be created.
SELECT
  lower(email)                          AS email_lower,
  count(*)                              AS total_rows,
  array_agg(id ORDER BY created_at)     AS ids_oldest_first,
  array_agg(status ORDER BY created_at) AS statuses,
  array_agg(tier ORDER BY created_at)   AS tiers,
  array_agg(created_at ORDER BY created_at) AS created_ats
FROM public.creator_applications
WHERE status NOT IN ('rejected', 'suspended')
GROUP BY lower(email)
HAVING count(*) > 1
ORDER BY total_rows DESC, email_lower;


-- A2. All rows for the specific conflicting email (replace if needed)
--     Shows the full history for derraiden8@gmail.com so you can decide
--     which row to keep and which to archive.
SELECT
  id,
  lower(email)    AS email_lower,
  status,
  tier,
  requested_plan_price,
  created_at,
  -- New columns added by account-approval-workflow.sql (may be NULL if migration partially ran)
  auth_user_id,
  user_profile_id,
  approval_status
FROM public.creator_applications
WHERE lower(email) = 'derraiden8@gmail.com'
ORDER BY created_at;


-- A3. All non-terminal rows grouped by email — full picture
SELECT
  lower(email)  AS email_lower,
  id,
  status,
  tier,
  created_at,
  auth_user_id,
  approval_status
FROM public.creator_applications
WHERE status NOT IN ('rejected', 'suspended')
ORDER BY lower(email), created_at;


-- A4. Duplicate auth_user_ids among non-terminal rows
--     (will only show conflicts if auth_user_id has been populated)
SELECT
  auth_user_id,
  count(*)                              AS total_rows,
  array_agg(id ORDER BY created_at)     AS ids_oldest_first,
  array_agg(status ORDER BY created_at) AS statuses,
  array_agg(created_at ORDER BY created_at) AS created_ats
FROM public.creator_applications
WHERE auth_user_id IS NOT NULL
  AND status NOT IN ('rejected', 'suspended')
GROUP BY auth_user_id
HAVING count(*) > 1
ORDER BY total_rows DESC;


-- A5. Duplicate user_profile_ids among non-terminal rows
SELECT
  user_profile_id,
  count(*)                              AS total_rows,
  array_agg(id ORDER BY created_at)     AS ids_oldest_first,
  array_agg(status ORDER BY created_at) AS statuses
FROM public.creator_applications
WHERE user_profile_id IS NOT NULL
  AND status NOT IN ('rejected', 'suspended')
GROUP BY user_profile_id
HAVING count(*) > 1
ORDER BY total_rows DESC;


-- ═══════════════════════════════════════════════════════════
-- B. APPLICATION STATUS DISTRIBUTION
-- ═══════════════════════════════════════════════════════════

-- B1. Count by status — all rows
SELECT
  status,
  count(*) AS row_count
FROM public.creator_applications
GROUP BY status
ORDER BY row_count DESC;


-- B2. Count by tier and status
SELECT
  tier,
  status,
  count(*) AS row_count
FROM public.creator_applications
GROUP BY tier, status
ORDER BY tier, status;


-- B3. Full listing of all creator_applications rows (ordered newest first)
--     Review this to understand the test data landscape.
SELECT
  id,
  full_name,
  lower(email)    AS email_lower,
  status,
  tier,
  created_at,
  auth_user_id,
  user_profile_id,
  approval_status
FROM public.creator_applications
ORDER BY created_at DESC;


-- ═══════════════════════════════════════════════════════════
-- C. SCHEMA AUDIT — current columns
-- ═══════════════════════════════════════════════════════════

-- C1. creator_applications — all columns and types
SELECT
  ordinal_position,
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'creator_applications'
ORDER BY ordinal_position;


-- C2. user_profiles — all columns and types
SELECT
  ordinal_position,
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'user_profiles'
ORDER BY ordinal_position;


-- C3. creator_profiles — all columns and types
SELECT
  ordinal_position,
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'creator_profiles'
ORDER BY ordinal_position;


-- ═══════════════════════════════════════════════════════════
-- D. CONSTRAINT AUDIT
-- ═══════════════════════════════════════════════════════════

-- D1. All CHECK and UNIQUE constraints on creator_applications
SELECT
  conname        AS constraint_name,
  contype        AS constraint_type,  -- 'c' = check, 'u' = unique, 'p' = primary key, 'f' = foreign key
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.creator_applications'::regclass
ORDER BY contype, conname;


-- D2. All CHECK and UNIQUE constraints on user_profiles
SELECT
  conname        AS constraint_name,
  contype        AS constraint_type,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.user_profiles'::regclass
ORDER BY contype, conname;


-- D3. All CHECK and UNIQUE constraints on creator_profiles
SELECT
  conname        AS constraint_name,
  contype        AS constraint_type,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.creator_profiles'::regclass
ORDER BY contype, conname;


-- ═══════════════════════════════════════════════════════════
-- E. INDEX AUDIT
-- ═══════════════════════════════════════════════════════════

-- E1. All indexes on creator_applications (including partial unique indexes)
SELECT
  i.relname         AS index_name,
  ix.indisunique    AS is_unique,
  ix.indisprimary   AS is_primary,
  pg_get_indexdef(ix.indexrelid) AS index_definition
FROM pg_index ix
JOIN pg_class i  ON i.oid  = ix.indexrelid
JOIN pg_class t  ON t.oid  = ix.indrelid
WHERE t.relname = 'creator_applications'
  AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY i.relname;


-- E2. All indexes on user_profiles
SELECT
  i.relname         AS index_name,
  ix.indisunique    AS is_unique,
  pg_get_indexdef(ix.indexrelid) AS index_definition
FROM pg_index ix
JOIN pg_class i  ON i.oid  = ix.indexrelid
JOIN pg_class t  ON t.oid  = ix.indrelid
WHERE t.relname = 'user_profiles'
  AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY i.relname;


-- E3. All indexes on creator_profiles
SELECT
  i.relname         AS index_name,
  ix.indisunique    AS is_unique,
  pg_get_indexdef(ix.indexrelid) AS index_definition
FROM pg_index ix
JOIN pg_class i  ON i.oid  = ix.indexrelid
JOIN pg_class t  ON t.oid  = ix.indrelid
WHERE t.relname = 'creator_profiles'
  AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY i.relname;


-- ═══════════════════════════════════════════════════════════
-- F. RLS POLICY AUDIT
-- ═══════════════════════════════════════════════════════════

-- F1. All RLS policies on the three key tables
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  IN ('creator_applications', 'user_profiles', 'creator_profiles')
ORDER BY tablename, policyname;


-- F2. Confirm RLS is enabled on these tables
SELECT
  relname        AS table_name,
  relrowsecurity AS rls_enabled,
  relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND relname IN ('creator_applications', 'user_profiles', 'creator_profiles')
ORDER BY relname;


-- ═══════════════════════════════════════════════════════════
-- G. CROSS-TABLE LINKAGE AUDIT
-- ═══════════════════════════════════════════════════════════

-- G1. creator_profiles — check how many are linked to applications vs. orphaned
SELECT
  CASE
    WHEN creator_application_id IS NOT NULL THEN 'linked to application'
    ELSE 'no application link'
  END AS link_status,
  count(*) AS count
FROM public.creator_profiles
GROUP BY link_status;


-- G2. creator_profiles — check auth_user_id population
SELECT
  CASE
    WHEN auth_user_id IS NOT NULL THEN 'has auth_user_id'
    ELSE 'no auth_user_id'
  END AS auth_status,
  count(*) AS count
FROM public.creator_profiles
GROUP BY auth_status;


-- G3. user_profiles — check creator_application_status population
--     This column was added by account-approval-workflow.sql.
--     If it exists, check how many rows have it set.
SELECT
  CASE
    WHEN creator_application_status IS NOT NULL THEN creator_application_status
    ELSE '(null)'
  END AS app_status,
  count(*) AS count
FROM public.user_profiles
GROUP BY creator_application_status
ORDER BY count DESC;


-- G4. creator_applications — check how many have auth_user_id vs. anonymous
SELECT
  CASE
    WHEN auth_user_id IS NOT NULL THEN 'linked to auth user'
    ELSE 'anonymous (no auth link)'
  END AS link_status,
  count(*) AS count
FROM public.creator_applications
GROUP BY link_status;


-- ═══════════════════════════════════════════════════════════
-- END OF DIAGNOSTICS
-- ═══════════════════════════════════════════════════════════
-- After running all of the above:
--   1. Note the duplicate emails from section A
--   2. Note whether the new columns from account-approval-workflow.sql exist (section C)
--   3. Note which indexes DO and DO NOT exist (section E)
--   4. Follow the repair plan in: docs/account-approval-repair-plan.md
-- ============================================================
