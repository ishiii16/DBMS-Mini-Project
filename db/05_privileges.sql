-- DCL: PostgreSQL roles & privileges for MoodTune (CREATE ROLE / GRANT / REVOKE / role membership)
-- Run after 01–03. Safe to re-run: roles are created only if missing, and the default GRANTs are re-applied.
--
--   GROUP roles (NOLOGIN)  : moodtune_admin, moodtune_listener, moodtune_restricted — hold the privileges
--   LOGIN roles            : one per MoodTune user, named mt_<username>, member of exactly one group
--                            (created / moved / dropped automatically by a trigger on users)
--
-- These roles show up in pgAdmin under  Server → Login/Group Roles.

-- ---------- 1. Group roles ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'moodtune_admin') THEN
    CREATE ROLE moodtune_admin NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'moodtune_listener') THEN
    CREATE ROLE moodtune_listener NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'moodtune_restricted') THEN
    CREATE ROLE moodtune_restricted NOLOGIN;
  END IF;
END $$;
COMMENT ON ROLE moodtune_admin    IS 'MoodTune group role: administrators (full data access, can grant)';
COMMENT ON ROLE moodtune_listener IS 'MoodTune group role: listeners (read catalogue, manage own activity, no password hashes)';
COMMENT ON ROLE moodtune_restricted IS 'MoodTune group role: restricted users (READ-ONLY: browse and search, no likes, plays or playlist changes)';

-- ---------- 2. Default privileges (also callable from the admin page: "Reset to defaults") ----------
CREATE OR REPLACE FUNCTION reset_default_privileges() RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  -- start clean
  REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM moodtune_admin, moodtune_listener, moodtune_restricted;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM moodtune_admin, moodtune_listener, moodtune_restricted;
  GRANT USAGE ON SCHEMA public TO moodtune_admin, moodtune_listener, moodtune_restricted;

  -- admin: everything, and may pass privileges on to others
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO moodtune_admin WITH GRANT OPTION;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO moodtune_admin;

  -- listener: read-only catalogue
  GRANT SELECT ON songs, artists, song_artists, genres, song_genres, moods, song_embeddings TO moodtune_listener;
  -- listener: full control of activity data (likes, plays, playlists) + own taste profile (written by triggers)
  GRANT SELECT, INSERT, UPDATE, DELETE ON feedback, listening_events, playlists, playlist_songs TO moodtune_listener;
  GRANT SELECT, INSERT, UPDATE ON user_profiles TO moodtune_listener;
  GRANT USAGE ON SEQUENCE listening_events_event_id_seq, playlists_playlist_id_seq TO moodtune_listener;
  -- listener: COLUMN-LEVEL privilege on users — can see who exists, never email or password_hash
  GRANT SELECT (user_id, username, role, created_at) ON users TO moodtune_listener;
  -- listener: every view (dashboards, song details)
  FOR v IN SELECT table_name FROM information_schema.views WHERE table_schema = 'public' LOOP
    EXECUTE format('GRANT SELECT ON %I TO moodtune_listener, moodtune_restricted', v);
  END LOOP;

  -- restricted: READ-ONLY — may look at everything a listener can, but has no INSERT / UPDATE / DELETE anywhere
  GRANT SELECT ON songs, artists, song_artists, genres, song_genres, moods, song_embeddings TO moodtune_restricted;
  GRANT SELECT ON feedback, listening_events, playlists, playlist_songs, user_profiles TO moodtune_restricted;
  GRANT SELECT (user_id, username, role, created_at) ON users TO moodtune_restricted;
END $$;
SELECT reset_default_privileges();

-- ---------- 3. One LOGIN role per MoodTune user, kept in sync by a trigger ----------
-- Login roles get CONNECTION LIMIT 0: they identify app users inside PostgreSQL (and can be used with
-- SET ROLE to check what a user may do), but nobody can open a database connection with them.
CREATE OR REPLACE FUNCTION user_db_role(p_username TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT 'mt_' || lower(p_username);
$$;

CREATE OR REPLACE FUNCTION sync_user_db_role(p_user INT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE u RECORD; r TEXT; grp TEXT; other TEXT;
BEGIN
  SELECT user_id, username, role INTO u FROM users WHERE user_id = p_user;
  IF NOT FOUND THEN RETURN; END IF;
  r   := user_db_role(u.username);
  grp := CASE u.role WHEN 'admin' THEN 'moodtune_admin' WHEN 'restricted' THEN 'moodtune_restricted' ELSE 'moodtune_listener' END;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
    EXECUTE format('CREATE ROLE %I LOGIN CONNECTION LIMIT 0', r);
  END IF;
  EXECUTE format('COMMENT ON ROLE %I IS %L', r, format('MoodTune user #%s (%s)', u.user_id, u.username));
  -- exactly one group: revoke any other MoodTune group it is in, grant the right one
  FOR other IN SELECT g.rolname FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid
               JOIN pg_roles mr ON mr.oid = m.member
               WHERE mr.rolname = r AND g.rolname LIKE 'moodtune\_%' AND g.rolname <> grp LOOP
    EXECUTE format('REVOKE %I FROM %I', other, r);
  END LOOP;
  IF NOT pg_has_role(r, grp, 'MEMBER') THEN EXECUTE format('GRANT %I TO %I', grp, r); END IF;
END $$;

CREATE OR REPLACE FUNCTION trg_users_db_role() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE r TEXT;
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.username <> OLD.username) THEN
      r := user_db_role(OLD.username);
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('DROP OWNED BY %I', r);   -- removes any privileges granted directly to this user
        EXECUTE format('DROP ROLE %I', r);
      END IF;
    END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM sync_user_db_role(NEW.user_id); END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    -- the app's DB account cannot manage roles: keep the app working, just skip the mirror role
    RAISE NOTICE 'MoodTune: could not sync database role (%): %', TG_OP, SQLERRM;
  END;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS users_db_role_aiud ON users;
CREATE TRIGGER users_db_role_aiud AFTER INSERT OR DELETE OR UPDATE OF role, username ON users
  FOR EACH ROW EXECUTE FUNCTION trg_users_db_role();

-- backfill: a login role for every existing user
SELECT sync_user_db_role(user_id) FROM users;

-- ---------- 4. Ask PostgreSQL "who is what, and what can they do?" ----------
-- Who is what: every MoodTune user, their login role and the group(s) PostgreSQL says they belong to
CREATE OR REPLACE VIEW v_user_db_roles AS
SELECT u.user_id, u.username, u.role AS app_role,
       user_db_role(u.username) AS db_role,
       (r.oid IS NOT NULL) AS db_role_exists,
       r.rolcanlogin AS can_login, r.rolconnlimit AS connection_limit,
       ARRAY(SELECT g.rolname::text FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid
             WHERE m.member = r.oid ORDER BY 1) AS member_of
FROM users u LEFT JOIN pg_roles r ON r.rolname = user_db_role(u.username);

-- What they can do: privilege matrix for every MoodTune role on every table/view, evaluated by PostgreSQL
--   'yes'  = privilege on the whole table, 'cols' = only on some columns, 'no' = none
CREATE OR REPLACE FUNCTION role_privileges(p_role TEXT)
RETURNS TABLE (object_name TEXT, object_kind TEXT, sel TEXT, ins TEXT, upd TEXT, del TEXT, grantable BOOLEAN)
LANGUAGE sql STABLE AS $$
  SELECT t.table_name::text,
         CASE t.table_type WHEN 'VIEW' THEN 'view' ELSE 'table' END,
         CASE WHEN has_table_privilege(p_role, format('public.%I', t.table_name), 'SELECT') THEN 'yes'
              WHEN has_any_column_privilege(p_role, format('public.%I', t.table_name), 'SELECT') THEN 'cols' ELSE 'no' END,
         CASE WHEN has_table_privilege(p_role, format('public.%I', t.table_name), 'INSERT') THEN 'yes'
              WHEN has_any_column_privilege(p_role, format('public.%I', t.table_name), 'INSERT') THEN 'cols' ELSE 'no' END,
         CASE WHEN has_table_privilege(p_role, format('public.%I', t.table_name), 'UPDATE') THEN 'yes'
              WHEN has_any_column_privilege(p_role, format('public.%I', t.table_name), 'UPDATE') THEN 'cols' ELSE 'no' END,
         CASE WHEN has_table_privilege(p_role, format('public.%I', t.table_name), 'DELETE') THEN 'yes' ELSE 'no' END,
         has_table_privilege(p_role, format('public.%I', t.table_name), 'SELECT WITH GRANT OPTION')
  FROM information_schema.tables t
  WHERE t.table_schema = 'public' AND t.table_type IN ('BASE TABLE', 'VIEW')
  ORDER BY (t.table_type = 'VIEW'), t.table_name;
$$;

-- Every MoodTune role (groups + users' login roles) × every table/view, as one view you can open in pgAdmin
-- (Schemas → public → Views → v_role_privileges → View/Edit Data)
CREATE OR REPLACE VIEW v_role_privileges AS
SELECT r.rolname::text AS role,
       CASE WHEN r.rolcanlogin THEN 'login role' ELSE 'group role' END AS role_type,
       ARRAY(SELECT g.rolname::text FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid
             WHERE m.member = r.oid ORDER BY 1) AS member_of,
       p.object_name AS table_name, p.object_kind,
       p.sel AS "select", p.ins AS "insert", p.upd AS "update", p.del AS "delete"
FROM pg_roles r CROSS JOIN LATERAL role_privileges(r.rolname) p
WHERE r.rolname LIKE 'moodtune\_%' OR r.rolname LIKE 'mt\_%'
ORDER BY (NOT r.rolcanlogin) DESC, r.rolname, p.object_kind, p.object_name;
