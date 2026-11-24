-- Integrity tests from slide 14. Each block must raise an error (caught & reported).
\set ON_ERROR_STOP off
\echo '--- T1: rating of 5 must be rejected'
INSERT INTO feedback (user_id, song_id, rating) VALUES ((SELECT min(user_id) FROM users), (SELECT min(song_id) FROM songs), 5);
\echo '--- T2: duplicate email must be rejected'
INSERT INTO users (username, email, password_hash) VALUES ('dup1','dup@test.com','x');
INSERT INTO users (username, email, password_hash) VALUES ('dup2','dup@test.com','x');
DELETE FROM users WHERE email = 'dup@test.com';
\echo '--- T3: play pointing to a non-existent song must be rejected (FK)'
INSERT INTO listening_events (user_id, song_id) VALUES ((SELECT min(user_id) FROM users), -999);
\echo '--- T4: deleting a playlist cascades to playlist_songs'
BEGIN;
INSERT INTO playlists (user_id, name) VALUES ((SELECT min(user_id) FROM users), '__cascade_test') ;
INSERT INTO playlist_songs SELECT currval('playlists_playlist_id_seq'), song_id, row_number() OVER () FROM songs LIMIT 3;
SELECT COUNT(*) AS songs_before FROM playlist_songs WHERE playlist_id = currval('playlists_playlist_id_seq');
DELETE FROM playlists WHERE name = '__cascade_test';
SELECT COUNT(*) AS songs_after FROM playlist_songs WHERE playlist_id = currval('playlists_playlist_id_seq');
ROLLBACK;
\echo '--- T5: invalid mood thresholds (min >= max) must be rejected'
INSERT INTO moods (name, valence_min, valence_max, energy_min, energy_max) VALUES ('Bad', 0.8, 0.2, 0, 1);
\echo '--- T6: mood trigger auto-tags a new song'
BEGIN;
INSERT INTO songs (spotify_id, title, album_name, valence, energy) VALUES ('__t6','Test','Test',0.9,0.9);
SELECT s.title, m.name AS auto_mood FROM songs s JOIN moods m USING (mood_id) WHERE spotify_id='__t6';
ROLLBACK;
\echo '--- T7: blank playlist name must be rejected (CHECK added with ALTER TABLE)'
INSERT INTO playlists (user_id, name) VALUES ((SELECT min(user_id) FROM users), '   ');
\echo '--- T8: a dislike fills dislike_vec via trigger feedback_taste_aiud -> refresh_taste()'
BEGIN;
INSERT INTO users (username, email, password_hash) VALUES ('__t8', '__t8@test.com', 'x');
INSERT INTO feedback (user_id, song_id, rating) VALUES (currval('users_user_id_seq'), (SELECT min(song_id) FROM songs), -1);
SELECT taste_vec IS NULL AS no_likes_yet, dislike_vec IS NOT NULL AS dislike_profile_set
FROM user_profiles WHERE user_id = currval('users_user_id_seq');
ROLLBACK;
\echo '--- T9: semantic_search with a song''s own vector returns that song first (similarity ~1)'
SELECT song_id, title, round(similarity::numeric, 3) AS similarity
FROM semantic_search((SELECT text_vec FROM song_embeddings WHERE song_id = (SELECT min(song_id) FROM songs)), NULL, NULL, 3);
\echo '--- T10: a new account automatically gets a "Liked songs" playlist (trigger users_liked_playlist_ai)'
BEGIN;
INSERT INTO users (username, email, password_hash) VALUES ('__t10', '__t10@test.com', 'x');
SELECT name, is_liked FROM playlists WHERE user_id = currval('users_user_id_seq');
ROLLBACK;
\echo '--- T11: like adds to Liked songs, dislike removes it and positions stay 1..n (trigger feedback_liked_playlist_aiud)'
BEGIN;
INSERT INTO users (username, email, password_hash) VALUES ('__t11', '__t11@test.com', 'x');
INSERT INTO feedback (user_id, song_id, rating)
SELECT currval('users_user_id_seq'), song_id, 1 FROM songs ORDER BY song_id LIMIT 3;
SELECT 'after 3 likes' AS step, array_agg(ps.song_id ORDER BY ps.position) AS songs, array_agg(ps.position ORDER BY ps.position) AS positions
FROM playlist_songs ps JOIN playlists p USING (playlist_id) WHERE p.user_id = currval('users_user_id_seq') AND p.is_liked;
UPDATE feedback SET rating = -1 WHERE user_id = currval('users_user_id_seq') AND song_id = (SELECT min(song_id) FROM songs);
SELECT 'after disliking the 1st' AS step, array_agg(ps.song_id ORDER BY ps.position) AS songs, array_agg(ps.position ORDER BY ps.position) AS positions
FROM playlist_songs ps JOIN playlists p USING (playlist_id) WHERE p.user_id = currval('users_user_id_seq') AND p.is_liked;
ROLLBACK;

-- ---------- DCL: roles & privileges (needs db/05_privileges.sql) ----------
\echo '--- T12: every MoodTune user has a login role in the right group (who is what)'
SELECT username, app_role, db_role, member_of FROM v_user_db_roles ORDER BY user_id;
\echo '--- T13: a listener may read usernames but NOT password hashes (column-level GRANT) -> must raise permission denied'
BEGIN;
SET LOCAL ROLE mt_ishika;
SELECT username FROM users ORDER BY user_id LIMIT 1;
SELECT password_hash FROM users LIMIT 1;
ROLLBACK;
\echo '--- T14: a listener may not change mood thresholds; an admin may (EXPLAIN only checks permissions)'
BEGIN; SET LOCAL ROLE mt_ishika; EXPLAIN UPDATE moods SET name = name; ROLLBACK;
BEGIN; SET LOCAL ROLE mt_admin;  EXPLAIN UPDATE moods SET name = name; ROLLBACK;
\echo '--- T15: REVOKE takes effect immediately; promoting a user moves their login role to moodtune_admin'
BEGIN;
REVOKE INSERT ON playlists FROM moodtune_listener;
SELECT has_table_privilege('mt_ishika', 'playlists', 'INSERT') AS ishika_can_insert_after_revoke;
UPDATE users SET role = 'admin' WHERE username = 'ishika';
SELECT member_of AS ishika_groups_after_promotion FROM v_user_db_roles WHERE username = 'ishika';
ROLLBACK;
\echo '--- T16: restricted (read-only) user: arham may SELECT but has no INSERT/UPDATE/DELETE anywhere'
SELECT table_name, "select", "insert", "update", "delete" FROM v_role_privileges WHERE role = 'mt_arham' AND object_kind = 'table';
BEGIN; SET LOCAL ROLE mt_arham; EXPLAIN INSERT INTO feedback (user_id, song_id, rating) VALUES (3, 1, 1); ROLLBACK;
