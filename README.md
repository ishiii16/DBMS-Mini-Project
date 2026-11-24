# MoodTune – Semantic Music Discovery & Recommendation Engine
DBMS Experiential Learning · Level 3 — Arham Mayur Burad (PES2UG24AM025), Ishika Jain (PES2UG24AM067)

PostgreSQL for structured data, **pgvector** (vector database, Option 2 of the guidelines) for semantic similarity,
Next.js for the web app + API, Python for the data pipeline.

## Folder layout
```
db/01_schema.sql     CREATE / DROP: 13 tables, PK/FK/UNIQUE/CHECK, GIN + HNSW indexes, 4 seed moods
db/02_alter.sql      ALTER TABLE: songs.description, user_profiles.taste_audio/dislike_vec, playlist-name CHECK
db/03_features.sql   triggers, stored functions recommend() / semantic_search() / similar_songs() /
                     retag_all_songs() / refresh_taste(), views
db/04_tests.sql      integrity + feature tests (T1–T16)
db/05_privileges.sql DCL: group roles moodtune_admin / moodtune_listener / moodtune_restricted (read-only), GRANT/REVOKE (incl. column-level),
                     one login role per user kept in sync by a trigger, role_privileges() / v_user_db_roles
etl/pipeline.py      Kaggle CSV -> clean -> describe -> embed -> load (single transaction); --reembed mode
etl/seed_demo.py     demo users + listening history + likes
etl/make_sample.py   synthetic CSV in Kaggle format (testing without the real file)
web/                 Next.js 14 app (pages + API routes, JWT cookie auth, role checks)
docs/                DOCUMENTATION.md (+ .docx / .pdf soft copy), ER + architecture diagrams, test results
docs/tools/          scripts that regenerate screenshots (shots.py), diagrams (render.py) and the .docx (md2docx.js)
screenshots/         application screenshots used in the documentation
```

**Project documentation:** [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md) — soft copy in
`docs/MoodTune_Documentation.docx` / `.pdf` (problem statement, ER diagram, schema, data dictionary,
queries, architecture, screenshots, test results, guideline checklist).

## Setup (in order)
1. Install Node 18+, Python 3.10+, and PostgreSQL 16+ with pgvector ≥ 0.8 (or Docker).
2. Configure secrets — nothing is hard-coded:
   ```
   cd web && cp .env.example .env.local    # set DATABASE_URL and a long random JWT_SECRET
   ```
   The Python scripts read `DATABASE_URL` from the environment or from `web/.env.local`.
3. Start the DB and create the schema
   - Docker: `POSTGRES_PASSWORD=<choose one> docker compose up -d` (01–03 and 05 auto-load; port 5432)
   - Local:  `createdb moodmusic` then
     `psql -d moodmusic -f db/01_schema.sql -f db/02_alter.sql -f db/03_features.sql -f db/05_privileges.sql`
   - (Our dev machine runs a local PostgreSQL 18 cluster on port **5433**:
     `pg_ctl -D .pgdata -o "-p 5433" -l .pgdata/server.log start`)
4. Download `dataset.csv` from Kaggle "Spotify Tracks Dataset" (maharshipandya) → `data/dataset.csv`.
5. Load data:
   ```
   pip install -r etl/requirements.txt bcrypt
   python etl/pipeline.py data/dataset.csv --limit 20000     # full load (resets plays/likes/playlists)
   python etl/seed_demo.py
   ```
   To regenerate descriptions + embeddings **without** losing user data: `python etl/pipeline.py --reembed`
6. Run the app:
   ```
   cd web && npm install && npm run dev      # http://localhost:3000
   ```
   The first natural-language search downloads/loads the MiniLM model (~4 s), later searches are fast.
7. Tests: `psql -d moodmusic -f db/04_tests.sql`

Admins can manage PostgreSQL roles & privileges at **/admin/roles** (Login/Group Roles).

Demo logins (password `password123`): admin@demo.com (admin), ishika@demo.com, arham@demo.com.

## Requirement → implementation
| Requirement | Implementation |
|---|---|
| Sign up / log in, hashed passwords | `api/auth/*`, bcrypt, httpOnly JWT cookie, login rate-limit |
| Roles (admin, listener) | `users.role` CHECK, `middleware.js` blocks `/admin`, `guard({admin:true})` on admin APIs |
| Mood → personalised recs | stored function `recommend(user, mood)`, `/` |
| Natural-language search ("calm songs for a rainy evening") | `/api/discover` embeds the sentence → `semantic_search()`, ✨ box on `/` |
| More like this / "like this but calmer" | `similar_songs(seed,user,mood,n,audio_weight)`, `/song/[id]` |
| Keyword search | `search_tsv` GIN full-text + trigram on artist, `/search` |
| Like/dislike, history | `feedback`, `listening_events` APIs, dashboard |
| Playlists (create / rename / add / remove / delete) | `api/playlists`, `api/playlists/[id]` (POST/PATCH/DELETE) |
| Taste auto-update | trigger `feedback_taste_aiud` → `refresh_taste()` |
| Default ♥ Liked songs playlist | triggers `users_liked_playlist_ai` + `feedback_liked_playlist_aiud`, partial unique index `uq_one_liked_playlist` |
| Auto mood tag | trigger `song_mood_bi` → `classify_mood()` |
| Dashboard | `v_user_top_moods`, JOIN · GROUP BY · HAVING query |
| Admin analytics | `v_plays_by_mood_day`, `v_popular_songs`, top genres |
| Admin thresholds + re-tag | `PUT /api/admin/moods` (transaction + `retag_all_songs()`) |
| Admin import + re-embed | `/api/admin/etl` runs `etl/pipeline.py` |
| Live database explorer (read-only) | `/admin/database` + `/api/admin/db`: every table and view, row counts, newest rows, refreshes every 2 s |
| Transactions | playlist create, song removal + renumber, add-to-playlist row lock, re-tag, ETL load / re-embed |
| DDL | CREATE/DROP (`01`), ALTER (`02`) |
| Security | parameterized SQL, secrets only in `.env.local`, no fallback JWT secret |

## Mood model
| Mood | Valence | Energy |
|---|---|---|
| Energetic | ≥ 0.5 | ≥ 0.5 |
| Calm | ≥ 0.5 | < 0.5 |
| Tense | < 0.5 | ≥ 0.5 |
| Sad | < 0.5 | < 0.5 |

## Vector database design (pgvector)
- **What is embedded:** the dataset has no lyrics, so the ETL writes a *description* of each song from its audio
  features (`songs.description`, e.g. "Slow, soft, gentle, low-energy, sad, melancholic, emotional, acoustic.
  Good for relaxing, studying, a rainy evening, heartbreak…"). The embedded text is
  `"<title> by <artists>. <description> Mood: <mood>. Genre: <genres>. Album: <album>."`
- **Model:** `all-MiniLM-L6-v2` (sentence-transformers, 384-d, L2-normalised). The app embeds user queries with the
  same model via transformers.js (`web/lib/embed.js`), so queries and songs share one vector space.
- **Storage:** `song_embeddings.text_vec vector(384)` and `audio_vec vector(8)` (valence, energy, danceability,
  acousticness, instrumentalness, speechiness, liveness, tempo/250 — centred). Metadata (mood, genre, artists) stays
  relational and is joined in. User taste lives in `user_profiles` (`taste_vec`, `taste_audio`, `dislike_vec`).
- **Index & metric:** HNSW indexes with `vector_cosine_ops`; cosine distance `<=>`, similarity = 1 − distance.
  `hnsw.iterative_scan` keeps scanning when a mood filter removes candidates.
- **Retrieval:**
  - `semantic_search(q)`: top-100 by cosine to the query vector, re-ranked 0.9·similarity + 0.1·popularity.
  - `similar_songs(seed)`: HNSW shortlist on text and on audio, re-ranked by (1−w)·text + w·audio.
  - `recommend(user)`: shortlist = 300 nearest to the taste vector (HNSW) ∪ 150 popular ∪ 150 random songs in the mood,
    scored 0.60·taste + 0.15·audio taste + 0.15·genre affinity + 0.10·popularity − 0.25·similarity to dislikes;
    20 are picked at random from the top 60, so each mood click / Shuffle gives a fresh but relevant list.
- **Why pgvector and not a separate vector DB:** vectors sit next to the relational data they describe, so one SQL
  query can join, filter by mood/history/feedback and rank by similarity inside a stored function and a transaction.
