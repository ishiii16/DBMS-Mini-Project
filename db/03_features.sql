-- Triggers, stored functions, views

-- 1. Mood tagging: pick the mood box containing (valence, energy). Upper bound inclusive only at 1.0.
CREATE OR REPLACE FUNCTION classify_mood(v REAL, e REAL) RETURNS INT
LANGUAGE sql STABLE AS $$
  SELECT mood_id FROM moods
  WHERE v >= valence_min AND (v < valence_max OR (valence_max = 1 AND v <= 1))
    AND e >= energy_min  AND (e < energy_max  OR (energy_max  = 1 AND e <= 1))
  ORDER BY mood_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION trg_song_mood() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.mood_id := classify_mood(NEW.valence, NEW.energy);
  NEW.search_tsv := to_tsvector('simple', coalesce(NEW.title,'') || ' ' || coalesce(NEW.album_name,''));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS song_mood_bi ON songs;
CREATE TRIGGER song_mood_bi BEFORE INSERT OR UPDATE OF valence, energy, title, album_name
  ON songs FOR EACH ROW EXECUTE FUNCTION trg_song_mood();

-- Re-tag every song after an admin edits thresholds
CREATE OR REPLACE FUNCTION retag_all_songs() RETURNS INT LANGUAGE plpgsql AS $$
DECLARE n INT;
BEGIN
  UPDATE songs SET mood_id = classify_mood(valence, energy);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- 2. Taste profile, refreshed on every feedback change:
--    taste_vec   = average text_vec  of liked songs   (what the user likes songs to be ABOUT / feel like)
--    taste_audio = average audio_vec of liked songs   (how the user likes songs to SOUND)
--    dislike_vec = average text_vec  of disliked songs (used as a penalty)
CREATE OR REPLACE FUNCTION refresh_taste(p_user INT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v vector(384); a vector(8); d vector(384);
BEGIN
  SELECT AVG(e.text_vec)  FILTER (WHERE f.rating = 1),
         AVG(e.audio_vec) FILTER (WHERE f.rating = 1),
         AVG(e.text_vec)  FILTER (WHERE f.rating = -1)
  INTO v, a, d
  FROM feedback f JOIN song_embeddings e USING (song_id)
  WHERE f.user_id = p_user;
  INSERT INTO user_profiles (user_id, taste_vec, taste_audio, dislike_vec, updated_at)
  VALUES (p_user, v, a, d, now())
  ON CONFLICT (user_id) DO UPDATE SET taste_vec = EXCLUDED.taste_vec, taste_audio = EXCLUDED.taste_audio,
                                      dislike_vec = EXCLUDED.dislike_vec, updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION trg_feedback_taste() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE uid INT := COALESCE(NEW.user_id, OLD.user_id);
BEGIN
  -- Skip when the feedback row is being removed by ON DELETE CASCADE from users:
  -- the user is already gone, so writing a profile would violate the FK and abort the delete.
  IF EXISTS (SELECT 1 FROM users WHERE user_id = uid) THEN
    PERFORM refresh_taste(uid);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS feedback_taste_aiud ON feedback;
CREATE TRIGGER feedback_taste_aiud AFTER INSERT OR UPDATE OR DELETE ON feedback
  FOR EACH ROW EXECUTE FUNCTION trg_feedback_taste();

-- 3. recommend(user, mood): personalised ranking that blends
--      semantic taste (text_vec vs taste_vec)          0.60
--      audio taste    (audio_vec vs taste_audio)        0.15
--      genre affinity (share of user's plays + likes)   0.15
--      popularity                                       0.10
--      minus a penalty for resembling disliked songs    0.25
--    Candidates = 300 nearest to the taste vector (HNSW) + 150 popular + 150 random songs in the mood
--    (exploration, so the catalogue is not dominated by the same chart hits).
--    Variety: the top 3 x p_limit by score are kept and p_limit of them are picked at random, then shown
--    best-first - so every request returns a fresh but still relevant list. Hence the function is VOLATILE.
--    Mood filter; songs already heard or rated are skipped.
--    Cold start (no likes): popularity + genre affinity from listening history; similarity is NULL.
CREATE OR REPLACE FUNCTION recommend(p_user INT, p_mood INT DEFAULT NULL, p_limit INT DEFAULT 20)
RETURNS TABLE (song_id INT, title VARCHAR, artists TEXT, mood VARCHAR, similarity REAL)
LANGUAGE plpgsql VOLATILE
-- pgvector >= 0.8: keep scanning the HNSW index until enough rows pass the mood filter
-- (otherwise only ef_search=40 candidates are returned and a rare mood can yield 0 rows)
SET hnsw.iterative_scan = strict_order
AS $$
#variable_conflict use_column
DECLARE t vector(384); ta vector(8); td vector(384);
BEGIN
  SELECT p.taste_vec, p.taste_audio, p.dislike_vec INTO t, ta, td FROM user_profiles p WHERE p.user_id = p_user;
  RETURN QUERY
  WITH hist AS (            -- everything the user played or liked
    SELECT le.song_id FROM listening_events le WHERE le.user_id = p_user
    UNION ALL
    SELECT f.song_id FROM feedback f WHERE f.user_id = p_user AND f.rating = 1
  ),
  gpref AS (                -- genre affinity in 0..1, relative to the user's top genre
    SELECT sg.genre_id, COUNT(*)::REAL / MAX(COUNT(*)) OVER () AS aff
    FROM hist JOIN song_genres sg ON sg.song_id = hist.song_id
    GROUP BY sg.genre_id
  ),
  shortlist AS (            -- ANN shortlist near the taste vector (HNSW) + popular + random songs in the mood
    (SELECT e.song_id FROM song_embeddings e JOIN songs s ON s.song_id = e.song_id
      WHERE t IS NOT NULL AND (p_mood IS NULL OR s.mood_id = p_mood)
      ORDER BY e.text_vec <=> t LIMIT 300)
    UNION
    (SELECT s.song_id FROM songs s
      WHERE p_mood IS NULL OR s.mood_id = p_mood
      ORDER BY s.popularity DESC LIMIT 150)
    UNION
    (SELECT s.song_id FROM songs s
      WHERE (p_mood IS NULL OR s.mood_id = p_mood) AND s.popularity >= 40
      ORDER BY random() LIMIT 150)
  ),
  scored AS (
    SELECT s.song_id, s.title, s.mood_id,
           CASE WHEN t IS NULL
             THEN 0.6 * s.popularity / 100.0 + 0.4 * ga.aff
             ELSE 0.60 * (1 - (e.text_vec <=> t))
                + 0.15 * CASE WHEN ta IS NULL THEN 0.5 ELSE (2 - (e.audio_vec <=> ta)) / 2 END
                + 0.15 * ga.aff
                + 0.10 * s.popularity / 100.0
                - 0.25 * CASE WHEN td IS NULL THEN 0 ELSE GREATEST(0, 1 - (e.text_vec <=> td)) END
           END AS score
    FROM shortlist sl
    JOIN songs s ON s.song_id = sl.song_id
    JOIN song_embeddings e ON e.song_id = s.song_id
    CROSS JOIN LATERAL (SELECT COALESCE(MAX(g.aff), 0) AS aff
                        FROM song_genres sg JOIN gpref g ON g.genre_id = sg.genre_id
                        WHERE sg.song_id = s.song_id) ga
    WHERE NOT EXISTS (SELECT 1 FROM listening_events le WHERE le.user_id = p_user AND le.song_id = s.song_id)
      AND NOT EXISTS (SELECT 1 FROM feedback f WHERE f.user_id = p_user AND f.song_id = s.song_id)
  ),
  top AS (SELECT * FROM scored ORDER BY score DESC LIMIT p_limit * 3),   -- best candidates
  pick AS (SELECT * FROM top ORDER BY random() LIMIT p_limit)            -- fresh selection each call
  SELECT sc.song_id, sc.title,
         (SELECT string_agg(a.name, ', ') FROM song_artists sa JOIN artists a USING (artist_id) WHERE sa.song_id = sc.song_id),
         m.name,
         CASE WHEN t IS NULL THEN NULL ELSE sc.score::REAL END
  FROM pick sc LEFT JOIN moods m ON m.mood_id = sc.mood_id
  ORDER BY sc.score DESC;
END $$;

-- 3b. semantic_search(query_vec): natural-language discovery ("peaceful songs for studying").
--     The query text is embedded by the app with the SAME model as the songs, then matched by cosine
--     distance on the HNSW index. Top 100 are re-ranked with a small popularity boost; disliked songs hidden.
CREATE OR REPLACE FUNCTION semantic_search(p_query vector(384), p_user INT DEFAULT NULL,
                                           p_mood INT DEFAULT NULL, p_limit INT DEFAULT 20)
RETURNS TABLE (song_id INT, title VARCHAR, artists TEXT, mood VARCHAR, similarity REAL)
LANGUAGE sql STABLE
SET hnsw.iterative_scan = strict_order
AS $$
  WITH near AS (
    SELECT e.song_id, 1 - (e.text_vec <=> p_query) AS sim
    FROM song_embeddings e JOIN songs s ON s.song_id = e.song_id
    WHERE (p_mood IS NULL OR s.mood_id = p_mood)
    ORDER BY e.text_vec <=> p_query
    LIMIT 100
  )
  SELECT s.song_id, s.title,
         (SELECT string_agg(a.name, ', ') FROM song_artists sa JOIN artists a USING (artist_id) WHERE sa.song_id = s.song_id),
         m.name, n.sim::REAL
  FROM near n
  JOIN songs s ON s.song_id = n.song_id
  LEFT JOIN moods m ON m.mood_id = s.mood_id
  WHERE p_user IS NULL OR NOT EXISTS
        (SELECT 1 FROM feedback f WHERE f.user_id = p_user AND f.song_id = s.song_id AND f.rating = -1)
  ORDER BY 0.9 * n.sim + 0.1 * s.popularity / 100.0 DESC
  LIMIT p_limit;
$$;

-- 4. similar_songs(seed): "more like this" blending text and audio similarity
CREATE OR REPLACE FUNCTION similar_songs(p_seed INT, p_user INT DEFAULT NULL, p_mood INT DEFAULT NULL,
                                         p_limit INT DEFAULT 20, p_audio_weight REAL DEFAULT 0.5)
RETURNS TABLE (song_id INT, title VARCHAR, artists TEXT, mood VARCHAR, similarity REAL)
LANGUAGE sql STABLE AS $$
  WITH seed AS (SELECT text_vec, audio_vec FROM song_embeddings WHERE song_id = p_seed),
  cand AS (   -- ANN shortlist via HNSW, then exact re-rank
    SELECT e.song_id, e.text_vec, e.audio_vec
    FROM song_embeddings e, seed
    WHERE e.song_id <> p_seed
    ORDER BY e.text_vec <=> seed.text_vec
    LIMIT 400
  ),
  cand2 AS (
    SELECT e.song_id, e.text_vec, e.audio_vec
    FROM song_embeddings e, seed
    WHERE e.song_id <> p_seed
    ORDER BY e.audio_vec <=> seed.audio_vec
    LIMIT 400
  ),
  pool AS (SELECT * FROM cand UNION SELECT * FROM cand2)
  SELECT s.song_id, s.title,
         (SELECT string_agg(a.name, ', ') FROM song_artists sa JOIN artists a USING (artist_id) WHERE sa.song_id = s.song_id),
         m.name,
         ((1 - p_audio_weight) * (1 - (p.text_vec <=> seed.text_vec))
          + p_audio_weight * (1 - (p.audio_vec <=> seed.audio_vec)))::REAL AS sim
  FROM pool p CROSS JOIN seed
  JOIN songs s ON s.song_id = p.song_id
  LEFT JOIN moods m ON m.mood_id = s.mood_id
  WHERE (p_mood IS NULL OR s.mood_id = p_mood)
    AND (p_user IS NULL OR NOT EXISTS
         (SELECT 1 FROM listening_events le WHERE le.user_id = p_user AND le.song_id = s.song_id))
    AND (p_user IS NULL OR NOT EXISTS
         (SELECT 1 FROM feedback f WHERE f.user_id = p_user AND f.song_id = s.song_id AND f.rating = -1))
  ORDER BY sim DESC
  LIMIT p_limit;
$$;

-- 5. Views for dashboards
CREATE OR REPLACE VIEW v_user_top_genres AS
SELECT le.user_id, g.name AS genre, COUNT(*) AS plays,
       RANK() OVER (PARTITION BY le.user_id ORDER BY COUNT(*) DESC) AS rnk
FROM listening_events le
JOIN song_genres sg USING (song_id) JOIN genres g USING (genre_id)
GROUP BY le.user_id, g.name;

CREATE OR REPLACE VIEW v_user_top_moods AS
SELECT le.user_id, m.name AS mood, COUNT(*) AS plays
FROM listening_events le JOIN songs s USING (song_id) JOIN moods m ON m.mood_id = s.mood_id
GROUP BY le.user_id, m.name;

CREATE OR REPLACE VIEW v_plays_by_mood_day AS
SELECT date_trunc('day', le.played_at)::date AS day, m.name AS mood, COUNT(*) AS plays
FROM listening_events le JOIN songs s USING (song_id) LEFT JOIN moods m ON m.mood_id = s.mood_id
GROUP BY 1, 2;

CREATE OR REPLACE VIEW v_song_details AS
SELECT s.song_id, s.title, s.album_name, s.popularity, s.valence, s.energy, s.danceability, s.tempo,
       m.name AS mood,
       (SELECT string_agg(a.name, ', ') FROM song_artists sa JOIN artists a USING (artist_id) WHERE sa.song_id = s.song_id) AS artists,
       (SELECT string_agg(g.name, ', ') FROM song_genres sg JOIN genres g USING (genre_id) WHERE sg.song_id = s.song_id) AS genres,
       s.acousticness, s.instrumentalness, s.description
FROM songs s LEFT JOIN moods m ON m.mood_id = s.mood_id;

-- Most-played songs across all users (admin analytics): JOIN + GROUP BY + aggregates + correlated subquery
CREATE OR REPLACE VIEW v_popular_songs AS
SELECT le.song_id, d.title, d.artists, d.mood,
       COUNT(*)                   AS plays,
       COUNT(DISTINCT le.user_id) AS listeners,
       (SELECT COUNT(*) FROM feedback f WHERE f.song_id = le.song_id AND f.rating = 1) AS likes
FROM listening_events le JOIN v_song_details d USING (song_id)
GROUP BY le.song_id, d.title, d.artists, d.mood;

-- 6. Default "Liked songs" playlist, kept in sync by triggers
--    users     AFTER INSERT          -> every new account gets its own "♥ Liked songs" playlist
--    feedback  AFTER INSERT/UPDATE/DELETE -> like adds the song, un-like / dislike removes it
CREATE OR REPLACE FUNCTION liked_playlist_id(p_user INT) RETURNS INT LANGUAGE plpgsql AS $$
DECLARE pid INT;
BEGIN
  SELECT playlist_id INTO pid FROM playlists WHERE user_id = p_user AND is_liked;
  IF pid IS NULL THEN
    INSERT INTO playlists (user_id, name, is_liked) VALUES (p_user, '♥ Liked songs', true)
    ON CONFLICT DO NOTHING RETURNING playlist_id INTO pid;
  END IF;
  RETURN pid;   -- NULL only if the user already owns a normal playlist called '♥ Liked songs'
END $$;

CREATE OR REPLACE FUNCTION trg_user_liked_playlist() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM liked_playlist_id(NEW.user_id);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS users_liked_playlist_ai ON users;
CREATE TRIGGER users_liked_playlist_ai AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION trg_user_liked_playlist();

CREATE OR REPLACE FUNCTION trg_feedback_liked_playlist() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE uid INT := COALESCE(NEW.user_id, OLD.user_id); pid INT; gone INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = uid) THEN RETURN NULL; END IF;  -- user being deleted
  -- liked now -> append to the end of the Liked playlist (no duplicates)
  IF TG_OP <> 'DELETE' AND NEW.rating = 1 THEN
    pid := liked_playlist_id(uid);
    IF pid IS NOT NULL THEN
      INSERT INTO playlist_songs (playlist_id, song_id, position)
      SELECT pid, NEW.song_id, COALESCE(MAX(position), 0) + 1 FROM playlist_songs WHERE playlist_id = pid
      ON CONFLICT (playlist_id, song_id) DO NOTHING;
    END IF;
  END IF;
  -- was liked, not any more (un-like, or changed to dislike) -> remove and close the gap
  IF TG_OP <> 'INSERT' AND OLD.rating = 1 AND (TG_OP = 'DELETE' OR NEW.rating <> 1) THEN
    SELECT playlist_id INTO pid FROM playlists WHERE user_id = uid AND is_liked;
    DELETE FROM playlist_songs WHERE playlist_id = pid AND song_id = OLD.song_id RETURNING position INTO gone;
    IF gone IS NOT NULL THEN   -- two-step shift keeps UNIQUE(playlist_id, position) and CHECK(position > 0) valid
      UPDATE playlist_songs SET position = position + 1000000 WHERE playlist_id = pid AND position > gone;
      UPDATE playlist_songs SET position = position - 1000001 WHERE playlist_id = pid AND position > 1000000;
    END IF;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS feedback_liked_playlist_aiud ON feedback;
CREATE TRIGGER feedback_liked_playlist_aiud AFTER INSERT OR UPDATE OR DELETE ON feedback
  FOR EACH ROW EXECUTE FUNCTION trg_feedback_liked_playlist();

-- One-time backfill (safe to re-run): a Liked playlist for every existing user, filled with current likes
SELECT liked_playlist_id(user_id) FROM users;
INSERT INTO playlist_songs (playlist_id, song_id, position)
SELECT p.playlist_id, f.song_id,
       COALESCE((SELECT MAX(position) FROM playlist_songs x WHERE x.playlist_id = p.playlist_id), 0)
         + ROW_NUMBER() OVER (PARTITION BY p.playlist_id ORDER BY f.rated_at, f.song_id)
FROM feedback f JOIN playlists p ON p.user_id = f.user_id AND p.is_liked
WHERE f.rating = 1
  AND NOT EXISTS (SELECT 1 FROM playlist_songs ps WHERE ps.playlist_id = p.playlist_id AND ps.song_id = f.song_id);
