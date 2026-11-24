-- Mood-Based Music Discovery Engine : schema (PostgreSQL 16 + pgvector)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP TABLE IF EXISTS user_profiles, song_embeddings, playlist_songs, playlists,
  feedback, listening_events, song_genres, genres, song_artists, artists,
  songs, moods, users CASCADE;

CREATE TABLE users (
  user_id       SERIAL PRIMARY KEY,
  username      VARCHAR(50)  UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(10) NOT NULL DEFAULT 'listener' CHECK (role IN ('listener','admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE moods (
  mood_id     SERIAL PRIMARY KEY,
  name        VARCHAR(30) UNIQUE NOT NULL,
  valence_min NUMERIC(4,3) NOT NULL, valence_max NUMERIC(4,3) NOT NULL,
  energy_min  NUMERIC(4,3) NOT NULL, energy_max  NUMERIC(4,3) NOT NULL,
  CHECK (valence_min < valence_max), CHECK (energy_min < energy_max),
  CHECK (valence_min >= 0 AND valence_max <= 1 AND energy_min >= 0 AND energy_max <= 1)
);

CREATE TABLE songs (
  song_id      SERIAL PRIMARY KEY,
  spotify_id   VARCHAR(30) UNIQUE NOT NULL,
  title        VARCHAR(500) NOT NULL,
  album_name   VARCHAR(500) NOT NULL,
  duration_ms  INT CHECK (duration_ms > 0),
  popularity   INT CHECK (popularity BETWEEN 0 AND 100),
  explicit     BOOLEAN NOT NULL DEFAULT false,
  valence      REAL NOT NULL CHECK (valence BETWEEN 0 AND 1),
  energy       REAL NOT NULL CHECK (energy BETWEEN 0 AND 1),
  danceability REAL CHECK (danceability BETWEEN 0 AND 1),
  acousticness REAL CHECK (acousticness BETWEEN 0 AND 1),
  instrumentalness REAL CHECK (instrumentalness BETWEEN 0 AND 1),
  speechiness  REAL CHECK (speechiness BETWEEN 0 AND 1),
  liveness     REAL CHECK (liveness BETWEEN 0 AND 1),
  tempo        REAL CHECK (tempo >= 0),
  mood_id      INT REFERENCES moods(mood_id) ON DELETE SET NULL,
  search_tsv   TSVECTOR
);

CREATE TABLE artists (artist_id SERIAL PRIMARY KEY, name VARCHAR(500) UNIQUE NOT NULL);
CREATE TABLE song_artists (
  song_id   INT REFERENCES songs(song_id)   ON DELETE CASCADE,
  artist_id INT REFERENCES artists(artist_id) ON DELETE CASCADE,
  PRIMARY KEY (song_id, artist_id)
);
CREATE TABLE genres (genre_id SERIAL PRIMARY KEY, name VARCHAR(100) UNIQUE NOT NULL);
CREATE TABLE song_genres (
  song_id  INT REFERENCES songs(song_id)   ON DELETE CASCADE,
  genre_id INT REFERENCES genres(genre_id) ON DELETE CASCADE,
  PRIMARY KEY (song_id, genre_id)
);

CREATE TABLE listening_events (
  event_id        BIGSERIAL PRIMARY KEY,
  user_id         INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  song_id         INT NOT NULL REFERENCES songs(song_id) ON DELETE CASCADE,
  played_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ms_played       INT NOT NULL DEFAULT 0 CHECK (ms_played >= 0),
  context_mood_id INT REFERENCES moods(mood_id) ON DELETE SET NULL
);

CREATE TABLE feedback (
  user_id  INT REFERENCES users(user_id) ON DELETE CASCADE,
  song_id  INT REFERENCES songs(song_id) ON DELETE CASCADE,
  rating   SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
  rated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, song_id)
);

CREATE TABLE playlists (
  playlist_id SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  mood_id     INT REFERENCES moods(mood_id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
CREATE TABLE playlist_songs (
  playlist_id INT REFERENCES playlists(playlist_id) ON DELETE CASCADE,
  song_id     INT REFERENCES songs(song_id) ON DELETE CASCADE,
  position    INT NOT NULL CHECK (position > 0),
  UNIQUE (playlist_id, position),               -- no two tracks share a slot
  PRIMARY KEY (playlist_id, song_id)
);

CREATE TABLE song_embeddings (
  song_id   INT PRIMARY KEY REFERENCES songs(song_id) ON DELETE CASCADE,
  text_vec  vector(384) NOT NULL,
  audio_vec vector(8)   NOT NULL,
  model     VARCHAR(100) NOT NULL
);
CREATE TABLE user_profiles (
  user_id    INT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  taste_vec  vector(384),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_songs_mood       ON songs(mood_id);
CREATE INDEX idx_songs_tsv        ON songs USING GIN (search_tsv);
CREATE INDEX idx_artists_trgm     ON artists USING GIN (name gin_trgm_ops);
CREATE INDEX idx_le_user          ON listening_events(user_id, played_at DESC);
CREATE INDEX idx_le_song          ON listening_events(song_id);
CREATE INDEX idx_emb_text_hnsw    ON song_embeddings USING hnsw (text_vec vector_cosine_ops);
CREATE INDEX idx_emb_audio_hnsw   ON song_embeddings USING hnsw (audio_vec vector_cosine_ops);

-- Seed moods (Russell circumplex quadrants on valence x energy)
INSERT INTO moods (name, valence_min, valence_max, energy_min, energy_max) VALUES
 ('Energetic', 0.5, 1.0, 0.5, 1.0),
 ('Calm',      0.5, 1.0, 0.0, 0.5),
 ('Tense',     0.0, 0.5, 0.5, 1.0),
 ('Sad',       0.0, 0.5, 0.0, 0.5);
