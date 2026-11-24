# MoodTune – A Semantic Music Discovery and Recommendation Engine

**DBMS Experiential Learning – Level 3 Project**
Department of Computer Science and Engineering, PES University, Electronic City Campus

| Team member | SRN |
|---|---|
| Arham Mayur Burad | PES2UG24AM025 |
| Ishika Jain | PES2UG24AM067 |

| Course | Database Management Systems |
|---|---|
| Class / Section | 5-A, AIML |
| Faculty | Dr. Nagasundari S |
| Date of submission | November 2026 |

**Stack:** Next.js 14 (frontend + API routes) · PostgreSQL 18 (SQL) · pgvector 0.8 (vector database) · Python ETL · all-MiniLM-L6-v2 embeddings

**Source code:** https://github.com/ishiii16/DBMS-Mini-Project

## 1. Problem Statement

Mainstream music recommenders rank songs mainly by genre, artist, popularity and listening history. They do not capture *how a song feels*: two songs from different genres can share the same mood, tempo and emotional character, yet a genre/artist-based system will not connect them. Listeners also cannot ask for music the way they think about it – “calm songs for a rainy evening”, “energetic songs for working out”, “sad songs about missing someone”.

MoodTune solves this by storing each song’s audio characteristics in a relational database, converting a textual description of each song (title, artists, genres, mood and a generated “feel” description) into a vector embedding, and using vector similarity search together with relational data (history, likes, dislikes, genres, moods) to recommend songs that feel similar or match a natural-language description.

## 2. Objectives

1. Design a normalised relational schema (ER → relational) for users, songs, artists, genres, moods, listening history, feedback and playlists with full integrity constraints.
2. Store song and user-taste embeddings in a vector database (pgvector) and retrieve songs by cosine similarity using HNSW indexes.
3. Provide four ways of discovering music: mood-based, song-based (“more like this”), natural-language search and personalised recommendations.
4. Implement the business logic inside the database: stored functions, triggers, views and transactions.
5. Build a role-based (listener / restricted / admin) Next.js web application that talks to the database only through an API layer, with secure authentication and no hard-coded secrets.
6. Control access at the database level with PostgreSQL roles and privileges (DCL: `CREATE ROLE`, `GRANT`, `REVOKE`, column-level privileges, role membership) and have the application obey them.
7. Demonstrate correctness with integrity tests, API tests, browser tests and a stress test.

## 3. Scope

**In scope**
- Catalogue of 20,000 unique songs loaded from the Kaggle “Spotify Tracks Dataset” (114,000 rows, cleaned and de-duplicated).
- Mood tagging on the valence × energy plane (Energetic, Calm, Tense, Sad), editable by admins.
- Vector similarity: semantic text embeddings (384-d) + audio-feature vectors (8-d).
- Listener features: sign-up/login, discovery, search, likes/dislikes, play logging, playlists, personal dashboard.
- Admin features: analytics, mood-threshold editing with re-tagging, user management, catalogue import / re-embedding, a live read-only database explorer, and a **Login/Group Roles** page to inspect and change PostgreSQL privileges.
- Three roles: **listener** (full use), **restricted** (read-only) and **admin**, each mapped to a PostgreSQL group role.

**Out of scope**
- Audio streaming (plays are logged, not streamed).
- Lyrics analysis – the dataset has no lyrics; the song’s *meaning* is represented by metadata plus a description generated from its audio features (see §9.7). Lyrics are listed as a future enhancement.
- Mobile apps and third-party (Spotify) account integration.

## 4. Functional Requirements

| ID | Requirement | Role | Implementation |
|---|---|---|---|
| FR1 | Register and log in; passwords stored as bcrypt hashes; session in an httpOnly JWT cookie | Listener, Admin | `/api/auth/signup`, `/api/auth/login`, `/api/auth/logout` |
| FR2 | Keyword search over titles, albums and artists | Listener | `/api/search` (GIN full-text + trigram) |
| FR3 | Mood-based discovery (pick a mood; each click or Shuffle gives a fresh set) | Listener | `/api/recommend?mood=` → `recommend()` |
| FR4 | Natural-language discovery (“peaceful songs for studying”) | Listener | `/api/discover?q=` → `semantic_search()` |
| FR5 | “More like this” for a song, with a mood filter and a text ↔ audio slider | Listener | `/api/similar` → `similar_songs()` |
| FR6 | Personalised recommendations from likes, dislikes, history, genres | Listener | `recommend()` + `user_profiles` |
| FR7 | Like / dislike / clear a rating; taste profile updates automatically | Listener | `/api/feedback` + trigger `feedback_taste_aiud` |
| FR8 | Log plays and view listening history | Listener | `/api/play` |
| FR9 | Create (empty, auto-filled, from results or from a single song), rename, add songs, remove songs, delete playlists | Listener | `/api/playlists`, `/api/playlists/[id]` |
| FR9b | Automatic “♥ Liked songs” playlist for every user, kept in sync with likes | Listener | triggers `users_liked_playlist_ai`, `feedback_liked_playlist_aiud` |
| FR10 | Personal dashboard: plays, likes, top genres and moods, history | Listener | `/api/dashboard` |
| FR11 | Analytics: plays by mood, top genres, plays per day, most-played songs, catalogue health | Admin | `/api/admin/analytics` |
| FR12 | Edit mood thresholds and re-tag every song atomically | Admin | `PUT /api/admin/moods` |
| FR13 | Manage users (change role, delete) | Admin | `/api/admin/users` |
| FR14 | Import catalogue / regenerate embeddings | Admin | `/api/admin/etl` |
| FR15 | Listeners cannot open admin pages or call admin APIs; the admin check reads the current role from the database, so a demotion takes effect at once | System | `middleware.js`, `guard({ admin: true })` |
| FR16 | See who is what (each user’s PostgreSQL login role and group) and what each role may do; GRANT / REVOKE a privilege on a group; test an action as a user | Admin | `/admin/roles`, `/api/admin/privileges` |
| FR17 | A **restricted** user can browse, search and get recommendations but cannot like, log plays or change playlists – enforced by asking PostgreSQL `has_table_privilege` before every write | Restricted | `requirePriv()` in `web/lib/auth.js`, group role `moodtune_restricted` |
| FR18 | Live, read-only view of every table and view with row counts | Admin | `/admin/database`, `/api/admin/db` |
| FR19 | Brute-force protection: an account locks for 15 minutes after 5 failed logins | System | `web/lib/ratelimit.js` |

## 5. ER Diagram

![ER diagram](images/er_diagram.png)

*Figure 1 – ER diagram (crow’s-foot notation). Mermaid source: `docs/images/er.mmd`.*

**Entities:** User, Song, Artist, Genre, Mood, Playlist, ListeningEvent, Feedback, SongEmbedding, UserProfile.

**Relationships**
- Song **M:N** Artist (via `song_artists`) – a song can have several artists.
- Song **M:N** Genre (via `song_genres`) – the dataset lists a track once per genre.
- Playlist **M:N** Song (via `playlist_songs`, with an ordered `position`).
- User **1:N** ListeningEvent, Song **1:N** ListeningEvent.
- User **M:N** Song through Feedback (rating −1 / +1, at most one per user and song).
- User **1:N** Playlist; Mood **1:N** Song, Playlist, ListeningEvent (optional).
- Song **1:1** SongEmbedding; User **1:1** UserProfile (weak entities that store vectors).

## 6. Relational Schema

Primary keys are underlined as `PK`, foreign keys marked `FK → table`.

- **users**(user_id PK, username UNIQUE, email UNIQUE, password_hash, role, created_at)
- **moods**(mood_id PK, name UNIQUE, valence_min, valence_max, energy_min, energy_max)
- **songs**(song_id PK, spotify_id UNIQUE, title, album_name, duration_ms, popularity, explicit, valence, energy, danceability, acousticness, instrumentalness, speechiness, liveness, tempo, mood_id FK → moods, search_tsv, description)
- **artists**(artist_id PK, name UNIQUE)
- **song_artists**(song_id FK → songs, artist_id FK → artists; PK(song_id, artist_id))
- **genres**(genre_id PK, name UNIQUE)
- **song_genres**(song_id FK → songs, genre_id FK → genres; PK(song_id, genre_id))
- **listening_events**(event_id PK, user_id FK → users, song_id FK → songs, played_at, ms_played, context_mood_id FK → moods)
- **feedback**(user_id FK → users, song_id FK → songs, rating, rated_at; PK(user_id, song_id))
- **playlists**(playlist_id PK, user_id FK → users, name, mood_id FK → moods, created_at; UNIQUE(user_id, name))
- **playlist_songs**(playlist_id FK → playlists, song_id FK → songs, position; PK(playlist_id, song_id); UNIQUE(playlist_id, position))
- **song_embeddings**(song_id PK, FK → songs, text_vec vector(384), audio_vec vector(8), model)
- **user_profiles**(user_id PK, FK → users, taste_vec vector(384), taste_audio vector(8), dislike_vec vector(384), updated_at)

**Normalisation.** Every table is in 3NF/BCNF: multi-valued attributes (artists, genres, playlist contents) are moved into junction tables; artist and genre names are stored once; mood boundaries are stored once in `moods` and referenced by id. The only derived columns are `songs.mood_id` and `songs.search_tsv`, which are maintained by a trigger so they can never drift from the source columns.

## 7. Database Choice and Justification

| Data | Nature | Store | Why |
|---|---|---|---|
| Users, roles, playlists, feedback, listening history | Structured, related, must stay consistent | PostgreSQL tables | Needs keys, foreign keys, CHECK/UNIQUE constraints, transactions, joins and aggregates (GROUP BY / HAVING). |
| Songs, artists, genres, moods, audio features | Structured with M:N relationships | PostgreSQL tables | Normalised schema; the mood trigger and full-text index work directly on these columns. |
| Song meaning / feel | Unstructured text → 384-d embedding | pgvector (`song_embeddings.text_vec`) | Similarity of meaning cannot be expressed with `=` or `LIKE`; it requires nearest-neighbour search on vectors. |
| How a song sounds | 8 numeric audio features → vector | pgvector (`audio_vec`) | Cosine similarity of the feature shape finds songs that sound alike across genres. |
| User taste | Average of liked / disliked song vectors | pgvector (`user_profiles`) | Lets the database rank songs by closeness to a user’s taste. |

**Why pgvector instead of a separate vector database (e.g. Qdrant).** The guidelines list *PostgreSQL with pgvector* as a vector database option. Keeping vectors next to the relational data means one SQL statement can combine vector search with joins and filters (mood, already-heard songs, dislikes, genre affinity) inside a stored function and a transaction. A separate vector store would require keeping two databases in sync and merging results in application code, with no transactional guarantee.

## 8. Data Dictionary

### users
| Column | Type | Constraints | Description |
|---|---|---|---|
| user_id | SERIAL | PK | Surrogate key |
| username | VARCHAR(50) | UNIQUE, NOT NULL | Display name (3–30 chars, validated in API) |
| email | VARCHAR(255) | UNIQUE, NOT NULL | Login, stored lower-case |
| password_hash | TEXT | NOT NULL | bcrypt hash (cost 10) – never plain text |
| role | VARCHAR(10) | NOT NULL, DEFAULT 'listener', CHECK IN ('listener','admin','restricted') (widened by ALTER) | Application role; mapped to PostgreSQL group role `moodtune_<role>` by trigger `users_db_role_aiud` |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Sign-up time |

### moods
| Column | Type | Constraints | Description |
|---|---|---|---|
| mood_id | SERIAL | PK | |
| name | VARCHAR(30) | UNIQUE, NOT NULL | Energetic / Calm / Tense / Sad |
| valence_min, valence_max | NUMERIC(4,3) | NOT NULL, CHECK min < max, within 0–1 | Valence range of the mood box |
| energy_min, energy_max | NUMERIC(4,3) | NOT NULL, CHECK min < max, within 0–1 | Energy range of the mood box |

### songs
| Column | Type | Constraints | Description |
|---|---|---|---|
| song_id | SERIAL | PK | |
| spotify_id | VARCHAR(30) | UNIQUE, NOT NULL | Track id from the dataset |
| title, album_name | VARCHAR(500) | NOT NULL | |
| duration_ms | INT | CHECK > 0 | |
| popularity | INT | CHECK 0–100 | Spotify popularity |
| explicit | BOOLEAN | NOT NULL, DEFAULT false | |
| valence, energy | REAL | NOT NULL, CHECK 0–1 | Happiness and intensity; drive mood tagging |
| danceability, acousticness, instrumentalness, speechiness, liveness | REAL | CHECK 0–1 | Audio features |
| tempo | REAL | CHECK ≥ 0 | Beats per minute |
| mood_id | INT | FK → moods, ON DELETE SET NULL | Set automatically by trigger `song_mood_bi` |
| search_tsv | TSVECTOR | GIN index | Full-text vector of title + album (trigger-maintained) |
| description | TEXT | added by ALTER | Generated “feel” description, part of the embedded text |

### artists / genres
| Column | Type | Constraints | Description |
|---|---|---|---|
| artist_id / genre_id | SERIAL | PK | |
| name | VARCHAR(500) / VARCHAR(100) | UNIQUE, NOT NULL | Artist names have a trigram GIN index for fuzzy search |

### song_artists / song_genres
| Column | Type | Constraints | Description |
|---|---|---|---|
| song_id | INT | PK part, FK → songs ON DELETE CASCADE | |
| artist_id / genre_id | INT | PK part, FK ON DELETE CASCADE | |

### listening_events
| Column | Type | Constraints | Description |
|---|---|---|---|
| event_id | BIGSERIAL | PK | |
| user_id | INT | NOT NULL, FK → users ON DELETE CASCADE | |
| song_id | INT | NOT NULL, FK → songs ON DELETE CASCADE | |
| played_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Indexed with user_id |
| ms_played | INT | NOT NULL, DEFAULT 0, CHECK ≥ 0 | |
| context_mood_id | INT | FK → moods ON DELETE SET NULL | Mood selected when the song was played |

### feedback
| Column | Type | Constraints | Description |
|---|---|---|---|
| user_id, song_id | INT | PK (composite), FKs ON DELETE CASCADE | One rating per user per song |
| rating | SMALLINT | NOT NULL, CHECK IN (−1, 1) | Dislike / like |
| rated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

### playlists / playlist_songs
| Column | Type | Constraints | Description |
|---|---|---|---|
| playlist_id | SERIAL | PK | |
| user_id | INT | NOT NULL, FK → users ON DELETE CASCADE | Owner |
| name | VARCHAR(100) | NOT NULL, UNIQUE(user_id, name), CHECK not blank | |
| mood_id | INT | FK → moods ON DELETE SET NULL | Optional theme |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| is_liked | BOOLEAN | NOT NULL, DEFAULT false (added by ALTER); partial UNIQUE index: one per user | Marks the automatic “♥ Liked songs” playlist |
| playlist_songs.position | INT | NOT NULL, CHECK > 0, UNIQUE(playlist_id, position) | Track order; PK(playlist_id, song_id) prevents duplicates |

### song_embeddings
| Column | Type | Constraints | Description |
|---|---|---|---|
| song_id | INT | PK, FK → songs ON DELETE CASCADE | |
| text_vec | vector(384) | NOT NULL, HNSW (cosine) | MiniLM embedding of the song’s profile text |
| audio_vec | vector(8) | NOT NULL, HNSW (cosine) | Centred audio features |
| model | VARCHAR(100) | NOT NULL | Embedding model name (all-MiniLM-L6-v2) |

### user_profiles
| Column | Type | Constraints | Description |
|---|---|---|---|
| user_id | INT | PK, FK → users ON DELETE CASCADE | |
| taste_vec | vector(384) | | Average text_vec of liked songs |
| taste_audio | vector(8) | added by ALTER | Average audio_vec of liked songs |
| dislike_vec | vector(384) | added by ALTER | Average text_vec of disliked songs |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Refreshed by trigger |

## 9. SQL and Vector Database Implementation

All SQL is in `db/` and runs in order:

| File | Contents |
|---|---|
| `01_schema.sql` | `CREATE EXTENSION`, `DROP TABLE … CASCADE`, `CREATE TABLE` ×13, PK/FK/UNIQUE/CHECK, `CREATE INDEX` ×7, seed moods |
| `02_alter.sql` | `ALTER TABLE … ADD COLUMN` (songs.description, user_profiles.taste_audio, dislike_vec), `ALTER TABLE … ADD/DROP CONSTRAINT` (incl. the 3-value role CHECK) |
| `03_features.sql` | Functions, triggers, views |
| `05_privileges.sql` | DCL: group roles, `GRANT` / `REVOKE` (incl. column-level), one login role per user kept in sync by a trigger, privilege views |
| `04_tests.sql` | Integrity, feature and privilege tests T1–T16 (run after `05`) |

### 9.1 DDL (CREATE / ALTER / DROP)

```sql
CREATE TABLE feedback (
  user_id  INT REFERENCES users(user_id) ON DELETE CASCADE,
  song_id  INT REFERENCES songs(song_id) ON DELETE CASCADE,
  rating   SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
  rated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, song_id)
);

ALTER TABLE songs ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS taste_audio vector(8);
ALTER TABLE playlists ADD CONSTRAINT playlists_name_not_blank CHECK (length(btrim(name)) > 0);

DROP TABLE IF EXISTS user_profiles, song_embeddings, playlist_songs, ... CASCADE;
```

### 9.2 Indexes

| Index | Type | Purpose |
|---|---|---|
| `idx_songs_tsv` | GIN on `search_tsv` | Full-text search on title/album |
| `idx_artists_trgm` | GIN `gin_trgm_ops` on `artists.name` | Fuzzy `ILIKE '%…%'` artist search |
| `idx_songs_mood` | B-tree on `songs.mood_id` | Mood filters and counts |
| `idx_le_user` | B-tree on `(user_id, played_at DESC)` | History, “already heard” checks, dashboard |
| `idx_le_song` | B-tree on `listening_events.song_id` | Popular-songs aggregation |
| `idx_emb_text_hnsw` | HNSW `vector_cosine_ops` on `text_vec` | Approximate nearest-neighbour semantic search |
| `idx_emb_audio_hnsw` | HNSW `vector_cosine_ops` on `audio_vec` | “Sounds like” search |
| `uq_one_liked_playlist` | Partial UNIQUE on `playlists(user_id) WHERE is_liked` | At most one “Liked songs” playlist per user |

Evidence (`EXPLAIN ANALYZE`, 20,000 songs): a top-10 semantic nearest-neighbour query uses `Index Scan using idx_emb_text_hnsw` and runs in **7.3 ms**; the full-text query for “love” uses `Bitmap Index Scan on idx_songs_tsv` and runs in **3.1 ms**.

### 9.3 Triggers

| Trigger | Event | Action |
|---|---|---|
| `song_mood_bi` | BEFORE INSERT OR UPDATE OF valence, energy, title, album_name ON songs | Sets `mood_id := classify_mood(valence, energy)` and rebuilds `search_tsv` |
| `feedback_taste_aiud` | AFTER INSERT/UPDATE/DELETE ON feedback | Calls `refresh_taste(user)` – recomputes taste, audio-taste and dislike vectors (skipped while the user row itself is being deleted) |
| `feedback_liked_playlist_aiud` | AFTER INSERT/UPDATE/DELETE ON feedback | A like appends the song to the user’s “♥ Liked songs” playlist; un-liking or switching to dislike removes it and shifts later positions down |
| `users_liked_playlist_ai` | AFTER INSERT ON users | Creates the new user’s “♥ Liked songs” playlist via `liked_playlist_id()` |
| `users_db_role_aiud` | AFTER INSERT OR DELETE OR UPDATE OF role, username ON users | Creates the user’s PostgreSQL login role `mt_<username>` and puts it in the right group role; moves it when the role changes; drops it when the user is deleted (§9.8) |

### 9.4 Stored Functions

| Function | Purpose |
|---|---|
| `classify_mood(v, e)` | Returns the mood whose valence × energy box contains the point |
| `liked_playlist_id(user)` | Returns the user’s “♥ Liked songs” playlist, creating it if missing (used by both Liked-songs triggers) |
| `retag_all_songs()` | Re-classifies every song after an admin edits thresholds; returns row count |
| `refresh_taste(user)` | Maintains `user_profiles` vectors using `AVG(vector) FILTER (WHERE …)` |
| `recommend(user, mood, n)` | Personalised ranking (see 9.7) |
| `semantic_search(query_vec, user, mood, n)` | Natural-language discovery |
| `similar_songs(seed, user, mood, n, audio_weight)` | “More like this”, blending text and audio similarity |
| `user_db_role(username)` | Name of a user’s PostgreSQL login role: `mt_` followed by the lower-cased username |
| `sync_user_db_role(user)` | Dynamic SQL (`CREATE ROLE`, `REVOKE`, `GRANT`) that keeps one login role per user in exactly one group |
| `reset_default_privileges()` | Re-applies the default `GRANT`s for all three group roles |
| `role_privileges(role)` | Privilege matrix for a role on every table/view, evaluated by `has_table_privilege` / `has_any_column_privilege` |

### 9.5 Views

| View | Purpose |
|---|---|
| `v_song_details` | Song + mood + aggregated artists and genres (`string_agg`) – used by most pages |
| `v_user_top_genres` | Plays per genre per user with `RANK() OVER (PARTITION BY user)` |
| `v_user_top_moods` | Plays per mood per user (dashboard) |
| `v_plays_by_mood_day` | Daily plays per mood (admin chart) |
| `v_popular_songs` | Most-played songs with listeners and likes (admin) |
| `v_user_db_roles` | Who is what: each user, their login role and the group roles PostgreSQL says they belong to |
| `v_role_privileges` | Every MoodTune role × every table/view with SELECT / INSERT / UPDATE / DELETE (open it in pgAdmin to show privileges) |

### 9.6 Transactions

| Operation | Where | Guarantee |
|---|---|---|
| Create playlist + insert all its songs | `POST /api/playlists` (`tx()`) | Playlist never exists half-filled |
| Add a song to a playlist | `POST /api/playlists/[id]` – `SELECT … FOR UPDATE` row lock | Concurrent adds get distinct positions |
| Remove a song and renumber positions | `DELETE /api/playlists/[id]?song=` | Positions stay contiguous, UNIQUE never violated |
| Edit mood thresholds + re-tag all songs | `PUT /api/admin/moods` | Thresholds and song tags always agree |
| Load / re-embed the catalogue | `etl/pipeline.py` | 20,000 songs, artists, genres and vectors are committed all-or-nothing |
| Sign-up / role change / delete user | trigger `users_db_role_aiud` | `CREATE ROLE`, `GRANT`, `REVOKE` and `DROP ROLE` are transactional in PostgreSQL, so a user row and its login role are created or removed together |
| “Test as this user” on the roles page | `POST /api/admin/privileges` | `SET LOCAL ROLE` + the probe statement run inside a transaction that is always rolled back |

### 9.7 Vector Database Design (guideline §8)

**What data is converted into embeddings.** For each song the ETL builds a profile text:
`"<title> by <artists>. <description> Mood: <mood>. Genre: <genres>. Album: <album>."`
Because the dataset has no lyrics, `description` is generated from the audio features – tempo (slow / mid-tempo / fast), energy (soft, gentle / intense, powerful), valence (sad, melancholic / bittersweet, nostalgic / happy, uplifting), acousticness, instrumentalness, danceability, speechiness – plus listening contexts such as “Good for relaxing, studying, a rainy evening” or “Good for working out, running”. Example: *“Fast, sad, melancholic, emotional, danceable.”* Separately, the 8 audio features form an audio vector.

**Embedding model.** `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions, mean pooling, L2-normalised). The ETL uses the Python `sentence-transformers` library; the web app embeds the user’s search sentence with the same model through `transformers.js` (`web/lib/embed.js`). Both produce identical vectors (verified to 6 decimal places), so queries and songs share one vector space.

**How vectors are stored.** In PostgreSQL with the pgvector extension: `song_embeddings(text_vec vector(384), audio_vec vector(8), model)` and `user_profiles(taste_vec, taste_audio, dislike_vec)`. Metadata (mood, genre, artist, popularity) stays in relational tables and is joined in, rather than being duplicated as vector payload. Each embedding row records the model name.

**Similarity metric.** Cosine distance (`<=>`); similarity = 1 − distance. Both vector columns have HNSW indexes with `vector_cosine_ops`. `hnsw.iterative_scan = strict_order` keeps scanning the index when a mood filter removes candidates.

**How relevant results are retrieved.**
- *Natural-language search* – `semantic_search()`: top 100 by cosine distance to the query vector (HNSW), disliked songs removed, re-ranked by 0.9 · similarity + 0.1 · popularity.
- *More like this* – `similar_songs()`: two HNSW shortlists of 400 (nearest by text and nearest by audio), merged and re-ranked by (1 − w) · text similarity + w · audio similarity, where the user sets w with a slider; already-heard and disliked songs removed.
- *Personalised recommendations* – `recommend()`: shortlist = 300 nearest to the user’s taste vector (HNSW) ∪ 150 most popular ∪ 150 random songs in the mood (exploration, so the same chart hits do not dominate); score = 0.60 · taste similarity + 0.15 · audio-taste similarity + 0.15 · genre affinity (from history) + 0.10 · popularity − 0.25 · similarity to disliked songs. Cold start (no likes): popularity + genre affinity. For variety, the 60 best-scored songs are kept and 20 of them are picked at random (`ORDER BY random()`), then shown best-first – every mood click or **Shuffle** returns a fresh but still relevant list (the function is therefore declared `VOLATILE`).

### 9.8 Roles and Privileges (DCL)

Application roles alone (a word in `users.role` checked by code) are invisible to the database. MoodTune therefore mirrors them as real PostgreSQL roles, so the **database** decides who may do what, and the same roles can be inspected in pgAdmin under *Login/Group Roles*.

**Group roles (NOLOGIN) – hold the privileges**

| Group role | For | Privileges (`reset_default_privileges()`) |
|---|---|---|
| `moodtune_admin` | Admins | `SELECT, INSERT, UPDATE, DELETE` on every table `WITH GRANT OPTION`; sequences |
| `moodtune_listener` | Listeners | `SELECT` on the catalogue (songs, artists, genres, moods, embeddings) and all views; `SELECT, INSERT, UPDATE, DELETE` on their activity tables (feedback, listening_events, playlists, playlist_songs); `SELECT, INSERT, UPDATE` on user_profiles; **column-level** `SELECT (user_id, username, role, created_at)` on users – never `email` or `password_hash` |
| `moodtune_restricted` | Read-only users | The same `SELECT` privileges as a listener and **no** `INSERT`, `UPDATE` or `DELETE` anywhere |

```sql
CREATE ROLE moodtune_listener NOLOGIN;
GRANT SELECT ON songs, artists, song_artists, genres, song_genres, moods, song_embeddings TO moodtune_listener;
GRANT SELECT, INSERT, UPDATE, DELETE ON feedback, listening_events, playlists, playlist_songs TO moodtune_listener;
GRANT SELECT (user_id, username, role, created_at) ON users TO moodtune_listener;   -- column-level privilege
GRANT SELECT ON songs, feedback, playlists /* … */ TO moodtune_restricted;            -- read-only group
```

**Login roles – one per user.** Every account has a login role `mt_<username>` (for example `mt_ishika`) that is a member of exactly one group role and therefore *inherits* its privileges. Login roles have `CONNECTION LIMIT 0`: they identify users inside PostgreSQL and can be used with `SET ROLE`, but nobody can open a database connection with them.

**Kept in sync by a trigger.** `users_db_role_aiud` (AFTER INSERT / DELETE / UPDATE OF role, username ON users) calls `sync_user_db_role()`, which uses dynamic SQL with safely quoted identifiers (`format('%I')`):

```sql
grp := CASE u.role WHEN 'admin' THEN 'moodtune_admin'
                   WHEN 'restricted' THEN 'moodtune_restricted' ELSE 'moodtune_listener' END;
EXECUTE format('CREATE ROLE %I LOGIN CONNECTION LIMIT 0', r);   -- only if missing
EXECUTE format('REVOKE %I FROM %I', other_group, r);           -- leave any other MoodTune group
EXECUTE format('GRANT %I TO %I', grp, r);                       -- join the right group
```

So a sign-up creates `mt_<username>` in `moodtune_listener`; an admin changing someone’s role moves the login role to the other group; deleting the user runs `DROP OWNED BY` and `DROP ROLE`. Because role DDL is transactional, a failed sign-up leaves no orphan role.

**How the application obeys the privileges.** Before every write (like / dislike, play logging, creating, renaming or deleting playlists, adding or removing songs) the API calls `requirePriv(user, table, privilege)`, which asks PostgreSQL:

```sql
SELECT has_table_privilege(db_role, 'public.feedback', 'INSERT') FROM v_user_db_roles WHERE user_id = $1;
```

If PostgreSQL answers *false* the request is refused with HTTP 403 and a clear message (“Your account is read-only — … you can't like or dislike songs”). Revoking a privilege on the roles page therefore takes effect in the application immediately, and moving a user to `restricted` blocks them without logging them out.

**Seeing who has what.** `v_user_db_roles` (who is what) and `v_role_privileges` (what each role may do) can be opened in pgAdmin; the admin page **Login/Group Roles** shows the same information, lets an admin `GRANT` / `REVOKE` a privilege on a group with one click (the executed SQL is logged), and can test an action as a given user. PostgreSQL privileges are additive, so a single person is restricted by moving them to a group with fewer privileges rather than by revoking from the individual.

## 10. Important Queries

**Q1 – Top genres for a user (JOIN · GROUP BY · HAVING · ORDER BY · aggregate)** – dashboard
```sql
SELECT g.name, COUNT(*)::int AS plays
FROM listening_events le
JOIN song_genres sg USING (song_id)
JOIN genres g USING (genre_id)
WHERE le.user_id = $1
GROUP BY g.name
HAVING COUNT(*) >= 3
ORDER BY plays DESC
LIMIT 5;
```

**Q2 – Keyword search (full-text + trigram, subquery with UNION)**
```sql
SELECT d.song_id, d.title, d.artists, d.mood, d.genres, d.popularity
FROM v_song_details d
WHERE d.song_id IN (
  SELECT song_id FROM songs WHERE search_tsv @@ plainto_tsquery('simple', $1)
  UNION
  SELECT sa.song_id FROM song_artists sa JOIN artists a USING (artist_id)
  WHERE a.name ILIKE '%' || $1 || '%')
ORDER BY d.popularity DESC LIMIT 50;
```

**Q3 – Natural-language vector search (inside `semantic_search`)**
```sql
WITH near AS (
  SELECT e.song_id, 1 - (e.text_vec <=> p_query) AS sim
  FROM song_embeddings e JOIN songs s ON s.song_id = e.song_id
  WHERE (p_mood IS NULL OR s.mood_id = p_mood)
  ORDER BY e.text_vec <=> p_query
  LIMIT 100)
SELECT s.song_id, s.title, m.name, n.sim
FROM near n JOIN songs s ON s.song_id = n.song_id LEFT JOIN moods m ON m.mood_id = s.mood_id
WHERE NOT EXISTS (SELECT 1 FROM feedback f
                  WHERE f.user_id = p_user AND f.song_id = s.song_id AND f.rating = -1)
ORDER BY 0.9 * n.sim + 0.1 * s.popularity / 100.0 DESC
LIMIT p_limit;
```

**Q4 – Taste profile with filtered vector aggregates (inside `refresh_taste`)**
```sql
SELECT AVG(e.text_vec)  FILTER (WHERE f.rating = 1),
       AVG(e.audio_vec) FILTER (WHERE f.rating = 1),
       AVG(e.text_vec)  FILTER (WHERE f.rating = -1)
FROM feedback f JOIN song_embeddings e USING (song_id)
WHERE f.user_id = p_user;
```

**Q5 – Genre affinity with a window function (inside `recommend`)**
```sql
SELECT sg.genre_id, COUNT(*)::REAL / MAX(COUNT(*)) OVER () AS aff
FROM hist JOIN song_genres sg ON sg.song_id = hist.song_id
GROUP BY sg.genre_id;
```

**Q6 – Most-played songs (view `v_popular_songs`, correlated subquery)**
```sql
SELECT le.song_id, d.title, d.artists, d.mood,
       COUNT(*) AS plays, COUNT(DISTINCT le.user_id) AS listeners,
       (SELECT COUNT(*) FROM feedback f WHERE f.song_id = le.song_id AND f.rating = 1) AS likes
FROM listening_events le JOIN v_song_details d USING (song_id)
GROUP BY le.song_id, d.title, d.artists, d.mood;
```

**Q7 – DML used by the application**
```sql
-- INSERT … ON CONFLICT (upsert a rating)
INSERT INTO feedback (user_id, song_id, rating) VALUES ($1, $2, $3)
ON CONFLICT (user_id, song_id) DO UPDATE SET rating = EXCLUDED.rating, rated_at = now();
-- UPDATE (rename playlist, change role, re-tag songs)
UPDATE playlists SET name = $3 WHERE playlist_id = $1 AND user_id = $2;
-- DELETE (cascades to playlist_songs)
DELETE FROM playlists WHERE playlist_id = $1 AND user_id = $2;
-- INSERT … SELECT (append at the next position)
INSERT INTO playlist_songs (playlist_id, song_id, position)
SELECT $1, $2, COALESCE(MAX(position), 0) + 1 FROM playlist_songs WHERE playlist_id = $1;
```

**Q8 – DCL and privilege inspection (roles page, `v_role_privileges`)**
```sql
-- change what a group may do (run by the roles page)
REVOKE INSERT ON playlists FROM moodtune_listener;
GRANT  INSERT ON playlists TO   moodtune_listener;
-- who is what: login role and group membership from the system catalogue
SELECT u.username, u.role, r.rolname AS db_role,
       ARRAY(SELECT g.rolname FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid
             WHERE m.member = r.oid) AS member_of
FROM users u JOIN pg_roles r ON r.rolname = 'mt_' || lower(u.username);
-- what a user may do, decided by PostgreSQL (inherited from their group)
SELECT table_name, "select", "insert", "update", "delete"
FROM v_role_privileges WHERE role = 'mt_arham';
-- prove it: act as the user (rolled back)
BEGIN; SET LOCAL ROLE mt_arham; EXPLAIN INSERT INTO feedback DEFAULT VALUES; ROLLBACK;
-- ERROR: permission denied for table feedback
```

## 11. System Architecture

![System architecture](images/architecture.png)

*Figure 2 – System architecture. Mermaid source: `docs/images/arch.mmd`.*

- **Presentation:** Next.js 14 React pages – Discover, Search, Song detail, Playlists, Dashboard, Admin.
- **API layer:** Next.js route handlers under `/api/*`. Every protected handler is wrapped in `guard()`, which checks the JWT, enforces the admin role where required (reading the *current* role from the database), and maps database errors (unique, FK, CHECK, NOT NULL, range violations, malformed JSON) to clean 4xx responses. All SQL is parameterised (`$1, $2 …`).
- **Access control (three layers):** `middleware.js` redirects anonymous users to `/login` and non-admins away from `/admin`; `guard()` protects every API; and `requirePriv()` asks PostgreSQL (`has_table_privilege`) whether the user’s login role may perform a write, so the database privileges of §9.8 are enforced in the app.
- **Abuse protection:** login attempts are rate-limited (5 failures per account, 100 per IP per 15 minutes); sign-ups are limited per network.
- **Database:** PostgreSQL 18 with pgvector 0.8.6 and pg_trgm. Business rules live in triggers, functions and views.
- **Embedding:** Python `sentence-transformers` (ETL, batch) and `transformers.js` (query time), same model.
- **Configuration:** `DATABASE_URL` and `JWT_SECRET` come only from `web/.env.local` (git-ignored); `.env.example` documents them. The Python scripts read the same file.

## 12. Application Screenshots

![Login](../screenshots/01_login.png)
*Figure 3 – Login page.*

![Sign-up](../screenshots/02_signup.png)
*Figure 4 – Sign-up: a duplicate email is rejected (UNIQUE constraint) and shown as a field-level error.*

![Discover – personalised](../screenshots/03_discover_recommended.png)
*Figure 5 – Discover: personalised recommendations with match scores.*

![Natural-language search](../screenshots/04_natural_language_search.png)
*Figure 6 – Natural-language search: “calm acoustic songs for a rainy evening”.*

![Save as playlist](../screenshots/05_save_playlist_toast.png)
*Figure 7 – Saving the search results as a playlist (one transaction).*

![Mood filter](../screenshots/06_mood_filter_calm.png)
*Figure 8 – Mood-based discovery (Calm).*

![Song detail](../screenshots/07_song_detail_similar.png)
*Figure 9 – Song detail: generated feel description, audio features and “songs that feel like this”.*

![Keyword search](../screenshots/08_keyword_search.png)
*Figure 10 – Keyword search (full-text + fuzzy artist match).*

![Playlists](../screenshots/09_playlists.png)
*Figure 11 – Playlists: rename, delete, remove songs.*

![Dashboard](../screenshots/10_dashboard.png)
*Figure 12 – Listener dashboard (GROUP BY / HAVING query, views, history).*

![Admin blocked](../screenshots/11_admin_blocked_for_listener.png)
*Figure 13 – A listener opening /admin is redirected with “That page is for admins only”.*

![Admin console](../screenshots/12_admin_console.png)
*Figure 14 – Admin console: catalogue health, analytics, most-played songs, mood thresholds, users (personal e-mail addresses masked), import.*

![Restricted user](../screenshots/13_restricted_user_readonly.png)
*Figure 15 – A restricted user (arham): “read-only” badge and banner; browsing, search and recommendations still work.*

![Like refused](../screenshots/14_restricted_like_refused.png)
*Figure 16 – The restricted user presses ♥: PostgreSQL has no INSERT privilege for `mt_arham`, so the API refuses with a clear message.*

![Login/Group Roles](../screenshots/15_login_group_roles.png)
*Figure 17 – Admin → Login/Group Roles: the three PostgreSQL group roles and their members.*

![Who is what](../screenshots/16_who_is_what.png)
*Figure 18 – Who is what: every user’s login role `mt_<username>` and the group role it belongs to (maintained by the trigger).*

![Privilege matrix](../screenshots/17_privilege_matrix.png)
*Figure 19 – What each group can do, as answered by `has_table_privilege`: ✔ granted, ◐ column-level only (users), ✕ not granted. Clicking a cell runs GRANT / REVOKE.*

![Check a user's privileges](../screenshots/18_check_user_privileges.png)
*Figure 20 – Checking a user: running `INSERT INTO feedback` as `mt_arham` returns “permission denied for table feedback”; below, the user’s effective privileges.*

![Users with three roles](../screenshots/19_admin_users_roles.png)
*Figure 21 – Admin Users table: listener / restricted / admin; changing the dropdown moves the user’s PostgreSQL role to the matching group.*

## 13. Testing Results

### 13.1 Database integrity and feature tests (`db/04_tests.sql`)

Full output: `docs/test_results.txt`.

| Test | Expectation | Result |
|---|---|---|
| T1 | Rating of 5 rejected | PASS – `feedback_rating_check` violated |
| T2 | Duplicate email rejected | PASS – `users_email_key` violated |
| T3 | Play of a non-existent song rejected | PASS – `listening_events_song_id_fkey` violated |
| T4 | Deleting a playlist cascades to its songs | PASS – 3 songs before, 0 after |
| T5 | Mood with min ≥ max rejected | PASS – `moods_check` violated |
| T6 | Trigger auto-tags a new song (v = 0.9, e = 0.9) | PASS – tagged Energetic |
| T7 | Blank playlist name rejected | PASS – `playlists_name_not_blank` violated |
| T8 | A dislike fills `dislike_vec` through the trigger | PASS – no taste yet, dislike profile set |
| T9 | `semantic_search` with a song’s own vector returns it first | PASS – similarity 1.000 |
| T10 | A new account gets a “♥ Liked songs” playlist | PASS – created by trigger |
| T11 | Like 3 songs, then dislike the first | PASS – playlist {1,2,3} → {2,3}, positions renumbered 1, 2 |
| T12 | Every user has a login role in the right group | PASS – admin → `moodtune_admin`, arham → `moodtune_restricted`, others → `moodtune_listener` |
| T13 | A listener can read `username` but not `password_hash` (column-level GRANT) | PASS – username returned; `SELECT password_hash` → permission denied for table users |
| T14 | A listener cannot change mood thresholds; an admin can | PASS – listener: permission denied for table moods; admin: plan returned |
| T15 | `REVOKE` takes effect at once; promoting a user moves their role | PASS – INSERT on playlists false after revoke; groups after promotion {moodtune_admin} (rolled back) |
| T16 | Restricted user is read-only | PASS – `mt_arham` has SELECT only on all 13 tables; `INSERT INTO feedback` → permission denied |

### 13.2 API tests (run against the production build with curl)

| # | Request | Expected | Result |
|---|---|---|---|
| A1 | Login with valid credentials | 200 + cookie | PASS |
| A2 | `GET /api/discover?q=calm acoustic songs for a rainy evening` | Calm rain songs | PASS – Paris in the Rain, Amsterdam, Passing Rain … |
| A3 | `GET /api/discover?q=sad songs about missing someone` | Sad “miss you” songs | PASS – I Miss You, Missing Peace … |
| A4 | `GET /api/discover?q=energetic songs for working out` | Energetic songs | PASS – all results tagged Energetic |
| A5 | `GET /api/discover?q=` (empty) | 400 | PASS – “Describe what you want to hear” |
| A6 | Dislike the #1 recommendation, reload | Song removed, similar songs scored lower | PASS – scores dropped by ≈0.013 |
| A7 | New user with no history | Popular songs, similarity NULL (cold start) | PASS |
| A8 | Create playlist with 4 songs, remove song 2 | Positions renumbered 1, 2, 3 | PASS |
| A9 | Rename playlist to “   ” | 400 | PASS – “Name required” |
| A10 | Rating with `songId: "abc"` | 400 | PASS |
| A11 | Malformed JSON body | 400 | PASS – “Malformed JSON body” |
| A12 | Listener calls `/api/admin/analytics` | 403 | PASS – “Admins only” |
| A13 | Admin sets role `superuser` | 400 (CHECK) | PASS – “Value out of allowed range” |
| A14 | `GET /api/similar?seed=999999` | Empty, no crash | PASS |
| A15 | Click the Calm card twice, then Shuffle (browser) | A different set of Calm songs each time | PASS |
| A16 | Sign up a new user | Login role `mt_<username>` created in `moodtune_listener`; dropped again when the user is deleted | PASS |
| A17 | Restricted user likes a song / logs a play / creates a playlist / adds to Liked songs | 403 with a read-only message | PASS – all four refused |
| A18 | Restricted user opens recommendations, search, dashboard | 200 | PASS |
| A19 | Admin switches arham to listener, then back to restricted (no re-login) | Like allowed, then refused again | PASS |
| A20 | Admin revokes INSERT on playlists from `moodtune_listener`, tests as a listener, grants it back | Denied after revoke, allowed after grant | PASS |
| A21 | Grant to `postgres`, object `users; DROP TABLE songs`, privilege `TRUNCATE` | Rejected (whitelists) | PASS – 400 for each |
| A22 | Listener calls `/api/admin/privileges` | 403 | PASS |

**Browser tests (headless Microsoft Edge, Playwright).** A 47-step end-to-end run covering sign-up validation, discovery, likes, playlists, search, dashboard, access control and the admin console passed 47/47 with no page errors; separate runs for the Login/Group Roles page (15/15) and the restricted user (9/9) also passed.

### 13.3 Stress and abuse testing (production build, 50 concurrent users)

| Test | Result |
|---|---|
| 600 mixed reads (recommend, similar, search, dashboard, moods) at 50 concurrency | 0 errors, ≈ 245 requests/s, p95 latency ≈ 313 ms |
| 300 concurrent writes (plays + likes firing the taste triggers) | 0 errors, p95 ≈ 144 ms |
| 20 simultaneous sign-ups with the same username / the same e-mail | exactly 1 succeeds, 19 get a clear 409 – UNIQUE constraints hold |
| 15 simultaneous creations of the same playlist | 1 created with all 20 songs, 14 rejected; rolled-back attempts leave no rows |
| 25 concurrent adds to one playlist | unique positions (row lock + `UNIQUE(playlist_id, position)`) |
| 30 simultaneous like/dislike flips on one song | no deadlocks or errors |
| SQL injection in search and login, forged / `alg=none` JWTs, another user’s playlist | all blocked |
| 30 parallel wrong-password logins | 5 reach bcrypt, 25 get 429; account locked 15 min; other accounts unaffected |

These figures were measured before the per-write privilege check of §9.8 was added; that check adds one small indexed lookup to each write request. The first stress run found four defects, all fixed and re-tested: duplicate playlist positions under concurrent adds (fixed with `SELECT … FOR UPDATE` and the UNIQUE constraint), malformed or wrongly-typed input causing HTTP 500 (now 400 with a clear message), unlimited password guessing (rate limiting) and – found by the browser tests – users who had rated songs could not be deleted because a trigger fired during the cascade (the trigger now skips users being deleted).

### 13.4 Performance (20,000 songs, laptop)

| Operation | Time |
|---|---|
| HNSW top-10 nearest neighbours | 7.3 ms |
| Full-text search “love” (911 matches) | 3.1 ms |
| First natural-language query (model load) | ≈ 4 s |
| Later natural-language queries (embed + search) | 36–65 ms |
| Re-embedding 20,000 songs with MiniLM (ETL) | ≈ 7 min (CPU) |

## 14. Conclusion and Future Enhancements

MoodTune shows how a relational database and a vector database complement each other. PostgreSQL enforces the structure and integrity of users, songs, playlists and feedback through keys, constraints, triggers and transactions. pgvector, inside the same database, finds songs by meaning and sound. Because both live in one engine, the ranking logic – taste similarity, audio similarity, genre affinity, popularity and dislike penalties – is written as stored functions that combine vector search with joins, aggregates and window functions. The result goes beyond CRUD: listeners can describe a feeling in plain English and get matching songs from any genre. Access control is also enforced inside the database: every user is mirrored as a PostgreSQL login role in an admin, listener or read-only group, column-level privileges hide password hashes, and the application asks PostgreSQL before every write, so a `GRANT` or `REVOKE` changes what users can do immediately.

**Future enhancements**
1. Lyrics embeddings (licensed lyrics API) for true lyrical-theme similarity.
2. More moods (romantic, nostalgic, focused) using additional features such as instrumentalness and acousticness.
3. Collaborative filtering (“listeners like you also liked”) from `listening_events`.
4. Learning the ranking weights from like/dislike feedback instead of fixed weights.
5. Audio preview playback through the Spotify Web API.
6. Partitioning `listening_events` by month and materialised views for analytics at scale.
7. Connect the web app as a least-privileged database account and run each request under the user’s own role (`SET ROLE`), plus row-level security so users can only ever read their own activity rows.

## 15. Individual Contribution

Both members worked on the database and the application, as planned in the design review.

| Member | Database work | Application work |
|---|---|---|
| Arham Mayur Burad (PES2UG24AM025) | Schema, tables and constraints (`01_schema.sql`, `02_alter.sql`); triggers and stored functions (`03_features.sql`) | Login / sign-up and API routes; admin console (analytics, mood thresholds, user management) |
| Ishika Jain (PES2UG24AM067) | Data cleaning and mood tagging (ETL); vector embeddings and similarity search; roles and privileges (`05_privileges.sql`) | Discover, search, recommendation and playlist pages; Login/Group Roles page and the restricted role; testing (database, API, browser and stress tests) and documentation |

## 16. References

1. M. Pandya, “Spotify Tracks Dataset”, Kaggle. https://www.kaggle.com/datasets/maharshipandya/-spotify-tracks-dataset
2. PostgreSQL Global Development Group, *PostgreSQL 18 Documentation* – Data Definition, Privileges, Database Roles, Triggers, Full Text Search. https://www.postgresql.org/docs/18/
3. pgvector – Open-source vector similarity search for Postgres (HNSW indexes, cosine distance, iterative index scans). https://github.com/pgvector/pgvector
4. N. Reimers and I. Gurevych, “Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks”, EMNLP 2019; model *sentence-transformers/all-MiniLM-L6-v2*. https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
5. Y. A. Malkov and D. A. Yashunin, “Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs”, IEEE TPAMI, 2020.
6. J. A. Russell, “A circumplex model of affect”, *Journal of Personality and Social Psychology*, 39(6), 1980 – basis of the valence × energy mood model.
7. Vercel, *Next.js 14 Documentation* – App Router, Route Handlers, Middleware. https://nextjs.org/docs
8. Transformers.js (Hugging Face) – running the same embedding model in Node.js. https://huggingface.co/docs/transformers.js
9. Dr. Nagasundari S, *DBMS Experiential Learning – Level 3 Project Requirements*, Department of CSE, PES University.

## Appendix A – Guideline Compliance Checklist

| # | Guideline | Where it is met |
|---|---|---|
| 1 | Unique title, real-world problem, not CRUD | MoodTune; semantic + personalised discovery (§1, §9.7) |
| 2 | 2-member team, defined responsibilities | Title page, §15 |
| 3 | SQL + Vector database | PostgreSQL + pgvector (§7) |
| 4 | ER diagram → relational schema; entities, attributes, PK, FK, relationships, constraints; vector data model | §5, §6, §8, §9.7 |
| 5 | DDL: CREATE, ALTER, DROP, PK/FK, constraints, indexes, views | `01_schema.sql`, `02_alter.sql`, `03_features.sql` (§9.1–9.5) |
| 6 | DML: INSERT, UPDATE, DELETE, SELECT; JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries | §10 Q1–Q7 |
| 7 | ≥ 4 advanced SQL concepts + 1 vector | Transactions, views, stored functions, triggers, indexing, full-text search, window functions, roles & privileges (DCL) + vector similarity search (§9) |
| 8 | Vector/semantic search explained (data, model, storage, metric, retrieval) | §9.7 |
| 9 | Next.js web interface with forms, tables, search, filters, dashboards | §12 |
| 10 | API layer; no hard-coded credentials; environment variables | `/api/*`, `.env.local`, `database_url()` in ETL (§11) |
| 11 | Authentication; ≥ 2 roles | bcrypt + JWT; three roles – listener / restricted / admin – each mirrored as a PostgreSQL group role (§4 FR1, FR15–FR17, §9.8) |
| 12 | Validation at database level; integrity | CHECK / UNIQUE / FK / NOT NULL, triggers, column-level privileges; tests T1–T16 (§13.1); concurrency tests (§13.3) |
| 13 | Security; no plain-text passwords or credentials | bcrypt hashes, parameterised SQL, httpOnly cookie, rate-limited login, database privileges enforced by the app, secrets only in env |
| 14 | Documentation contents | This document |
| 15 | Git/GitHub, individual commits, README | https://github.com/ishiii16/DBMS-Mini-Project with `README.md` (setup and run instructions); each member commits their own work |
| 16 | Demonstration items | Covered by §1–§13 and the running app |
| 17 | Originality | Own schema, ranking functions and generated-description embedding approach |
| 18 | Level 3 expectation; justified database choice | §7, §9.7 |
