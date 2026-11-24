-- MoodTune database tour: what is stored where, and why.
-- Run:  psql "<DATABASE_URL from web/.env.local>" -P pager=off -f docs/db_tour.sql
\pset pager off
\pset null '(none)'

\echo
\echo '================ 1. ONE DATABASE, TWO KINDS OF DATA ================'
\echo 'PostgreSQL database "moodmusic". Extensions: vector = pgvector (vector DB), pg_trgm = fuzzy search'
SELECT current_database() AS database, split_part(version(), ' on ', 1) AS server;
SELECT extname AS extension, extversion AS version FROM pg_extension ORDER BY 1;

\echo
\echo '================ 2. RELATIONAL (SQL) TABLES - exact facts ================'
\echo 'Why SQL: must be unique, consistent and countable -> keys, constraints, joins, transactions'
SELECT 'users' AS table_name, count(*) AS rows, 'accounts + role (listener/admin)' AS holds FROM users
UNION ALL SELECT 'songs', count(*), 'title, album, audio features, mood' FROM songs
UNION ALL SELECT 'artists', count(*), 'artist names (stored once)' FROM artists
UNION ALL SELECT 'song_artists', count(*), 'M:N song <-> artist' FROM song_artists
UNION ALL SELECT 'genres', count(*), 'genre names' FROM genres
UNION ALL SELECT 'song_genres', count(*), 'M:N song <-> genre' FROM song_genres
UNION ALL SELECT 'moods', count(*), 'valence x energy boxes' FROM moods
UNION ALL SELECT 'listening_events', count(*), 'who played what, when' FROM listening_events
UNION ALL SELECT 'feedback', count(*), 'likes (+1) / dislikes (-1)' FROM feedback
UNION ALL SELECT 'playlists', count(*), 'user playlists' FROM playlists
UNION ALL SELECT 'playlist_songs', count(*), 'ordered songs in playlists' FROM playlist_songs;

\echo
\echo '================ 3. VECTOR (pgvector) TABLES - meaning and similarity ================'
\echo 'Why vectors: "which songs feel like this?" cannot be answered with WHERE/LIKE - it needs nearest-neighbour search'
SELECT 'song_embeddings' AS table_name, count(*) AS rows,
       'text_vec vector(' || max(vector_dims(text_vec)) || ') + audio_vec vector(' || max(vector_dims(audio_vec)) || ')' AS vectors,
       max(model) AS model
FROM song_embeddings
UNION ALL
SELECT 'user_profiles', count(*), 'taste_vec(384), taste_audio(8), dislike_vec(384)', 'kept up to date by a trigger'
FROM user_profiles;

\echo
\echo '---- One song: its SQL row (facts) and its vector (meaning) ----'
SELECT s.song_id, s.title, d.artists, d.mood, round(s.valence::numeric, 2) AS valence, round(s.energy::numeric, 2) AS energy, s.description
FROM songs s JOIN v_song_details d USING (song_id) WHERE s.song_id = 1;
SELECT song_id, vector_dims(text_vec) AS dimensions,
       left(text_vec::text, 70) || ' ...' AS first_numbers_of_the_384
FROM song_embeddings WHERE song_id = 1;

\echo
\echo '================ 4. VECTOR SEARCH IN ACTION ================'
\echo 'Songs closest in meaning to song 1 (cosine distance <=>, HNSW index):'
SELECT s.title, d.artists, d.mood, round((1 - (e.text_vec <=> q.v))::numeric, 3) AS similarity
FROM song_embeddings e
JOIN songs s USING (song_id)
JOIN v_song_details d USING (song_id),
     (SELECT text_vec AS v FROM song_embeddings WHERE song_id = 1) q
WHERE e.song_id <> 1
ORDER BY e.text_vec <=> q.v
LIMIT 5;

\echo 'Proof the HNSW index is used:'
EXPLAIN (COSTS OFF)
SELECT song_id FROM song_embeddings
ORDER BY text_vec <=> (SELECT text_vec FROM song_embeddings WHERE song_id = 1) LIMIT 10;

\echo
\echo '================ 5. SQL + VECTORS TOGETHER (stored function) ================'
\echo 'recommend(user, mood): vector similarity + joins + filters in ONE query. Calm picks for ishika:'
SELECT title, artists, mood, round(similarity::numeric, 3) AS score
FROM recommend((SELECT user_id FROM users WHERE email = 'ishika@demo.com'), 2, 5);

\echo
\echo '================ 6. LOGIC STORED IN THE DATABASE ================'
SELECT p.proname AS function, pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('classify_mood', 'retag_all_songs', 'refresh_taste', 'recommend', 'semantic_search', 'similar_songs')
ORDER BY 1;
SELECT tgname AS trigger, tgrelid::regclass AS on_table
FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1;
SELECT viewname AS view FROM pg_views WHERE schemaname = 'public' ORDER BY 1;

\echo
\echo '================ 7. INDEXES ================'
SELECT indexname AS index, tablename AS on_table,
       CASE WHEN indexdef ILIKE '%hnsw%' THEN 'HNSW (vector)'
            WHEN indexdef ILIKE '%gin_trgm%' THEN 'GIN trigram'
            WHEN indexdef ILIKE '%gin%' THEN 'GIN full-text'
            ELSE 'B-tree' END AS type
FROM pg_indexes
WHERE schemaname = 'public' AND indexname LIKE 'idx_%'
ORDER BY 1;

\echo
\echo '================ 8. CONSTRAINTS (validation in the database) ================'
SELECT conrelid::regclass AS on_table, conname AS constraint_name,
       CASE contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'f' THEN 'FOREIGN KEY' WHEN 'u' THEN 'UNIQUE' WHEN 'c' THEN 'CHECK' END AS type
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace AND contype IN ('c', 'u')
ORDER BY 1, 2;

\echo
\echo 'Tour finished. You are now in an interactive psql prompt - try:  \dt   \d songs   \d song_embeddings'
