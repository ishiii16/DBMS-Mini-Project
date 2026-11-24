"""One-time data setup (slide 13): Kaggle CSV -> clean -> describe -> make vectors -> load into PostgreSQL.

Usage:
  python etl/pipeline.py data/dataset.csv [--limit 20000]   full (re)load - resets plays, likes, playlists
  python etl/pipeline.py --reembed                          regenerate descriptions + embeddings for the songs
                                                            already in the DB (keeps all user data)
Env:    DATABASE_URL (read from the environment, or from web/.env.local if not set)
"""
import argparse, hashlib, os, re, sys, time
from pathlib import Path
import numpy as np, pandas as pd, psycopg

AUDIO = ["valence", "energy", "danceability", "acousticness", "instrumentalness", "speechiness", "liveness", "tempo"]
MODEL_NAME = "all-MiniLM-L6-v2"  # must match the query-side model in web/lib/embed.js


def database_url():
    """Credentials are never hard-coded: take DATABASE_URL from the environment or web/.env.local."""
    if os.getenv("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    env_file = Path(__file__).resolve().parent.parent / "web" / ".env.local"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip()
    sys.exit("DATABASE_URL is not set (export it, or create web/.env.local from web/.env.example)")


# ---------- 1. CLEAN ----------
def clean(path, limit=None):
    df = pd.read_csv(path)
    df = df.drop(columns=[c for c in df.columns if c.startswith("Unnamed") or c == ""], errors="ignore")
    n0 = len(df)
    df = df.dropna(subset=["track_id", "track_name", "artists", "album_name", "valence", "energy"])
    # The Kaggle file repeats a track once per genre -> collect genres, keep one row per track_id
    genres = df.groupby("track_id")["track_genre"].apply(lambda s: sorted(set(s))).rename("genres")
    df = df.drop_duplicates("track_id").set_index("track_id").join(genres).reset_index()
    # Same song re-released on several albums -> keep the most popular copy
    df = df.sort_values("popularity", ascending=False).drop_duplicates(["track_name", "artists"])
    for c in AUDIO[:-1]:
        df = df[df[c].between(0, 1)]
    df = df[(df.duration_ms > 0) & (df.tempo >= 0)]
    if limit:
        df = df.head(limit)
    print(f"[clean] {n0} rows -> {len(df)} unique songs")
    return df.reset_index(drop=True)


# ---------- 2. DESCRIBE + MAKE VECTORS ----------
def mood_of(v, e):  # mirrors default rows in the moods table (DB trigger is authoritative)
    return ("Energetic" if e >= .5 else "Calm") if v >= .5 else ("Tense" if e >= .5 else "Sad")


def describe(r):
    """Turn audio features into words, so a sentence like 'calm songs for a rainy evening'
    lands near songs that actually sound that way (the dataset has no lyrics)."""
    feel = ["slow" if r.tempo < 90 else "fast" if r.tempo >= 125 else "mid-tempo"]
    if r.energy < .35:   feel += ["soft", "gentle", "low-energy"]
    elif r.energy > .75: feel += ["intense", "powerful", "high-energy"]
    if r.valence < .3:   feel += ["sad", "melancholic", "emotional"]
    elif r.valence < .5: feel += ["bittersweet", "moody", "nostalgic"]
    elif r.valence > .7: feel += ["happy", "cheerful", "uplifting"]
    else:                feel += ["warm", "positive"]
    if r.acousticness > .6:     feel.append("acoustic")
    if r.instrumentalness > .5: feel.append("instrumental with no vocals")
    if r.danceability > .7:     feel.append("danceable")
    if r.speechiness > .33:     feel.append("rap or spoken word")

    good = []
    if r.energy < .45 and (r.acousticness > .5 or r.instrumentalness > .5): good += ["relaxing", "studying", "a rainy evening"]
    if r.energy < .45 and r.valence < .4: good += ["heartbreak", "missing someone", "a lonely night"]
    if r.instrumentalness > .5 and r.energy < .6: good += ["focus", "deep work"]
    if r.energy < .3 and r.tempo < 100: good.append("sleep")
    if r.energy > .75 and r.tempo >= 115: good += ["working out", "running"]
    if r.danceability > .7 and r.valence > .6: good += ["a party", "dancing"]
    if r.valence > .6 and .5 < r.energy <= .8: good.append("a road trip")
    good = list(dict.fromkeys(good))
    return ", ".join(feel).capitalize() + "." + (f" Good for {', '.join(good)}." if good else "")


def profile_text(title, artists, album, genres, mood, description):
    return f"{title} by {artists}. {description} Mood: {mood}. Genre: {', '.join(genres)}. Album: {album}."


def hashing_embed(texts, dim=384):
    """Fallback when sentence-transformers / HF download unavailable: signed feature hashing of
    word unigrams+bigrams, L2-normalised. Captures lexical overlap only (NOT semantic)."""
    out = np.zeros((len(texts), dim), dtype=np.float32)
    for i, t in enumerate(texts):
        toks = re.findall(r"[a-z0-9\-]+", t.lower())
        for tok in toks + [a + "_" + b for a, b in zip(toks, toks[1:])]:
            h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
            out[i, h % dim] += 1 if (h >> 9) & 1 else -1
    out /= np.linalg.norm(out, axis=1, keepdims=True) + 1e-9
    return out


def embed(texts, allow_fallback=False):
    try:
        from sentence_transformers import SentenceTransformer
        m = SentenceTransformer(f"sentence-transformers/{MODEL_NAME}")
        print(f"[embed] using {MODEL_NAME}")
        return m.encode(texts, batch_size=256, show_progress_bar=True, normalize_embeddings=True), MODEL_NAME
    except Exception as ex:
        if not allow_fallback:
            sys.exit(f"[embed] sentence-transformers failed ({type(ex).__name__}: {ex}).\n"
                     "        pip install sentence-transformers, or pass --allow-fallback to use the hashing embedder\n"
                     "        (natural-language search will then NOT work).")
        print(f"[embed] sentence-transformers unavailable ({type(ex).__name__}); using hashing fallback")
        return hashing_embed(texts), "hashing-384"


def audio_vectors(df):
    a = df[AUDIO].to_numpy(dtype=np.float32).copy()
    a[:, -1] = np.clip(a[:, -1] / 250.0, 0, 1)        # tempo -> 0..1
    return a - 0.5                                     # centre so cosine reflects shape, not magnitude


vec = lambda v: "[" + ",".join(f"{x:.6f}" for x in v) + "]"
HNSW = ["CREATE INDEX idx_emb_text_hnsw ON song_embeddings USING hnsw (text_vec vector_cosine_ops)",
        "CREATE INDEX idx_emb_audio_hnsw ON song_embeddings USING hnsw (audio_vec vector_cosine_ops)"]


# ---------- 3a. FULL LOAD ----------
def load(db, df, text_vecs, audio_vecs, model):
    with psycopg.connect(db) as conn, conn.cursor() as cur:
        # user_profiles holds vectors from the old catalogue -> clear it too (TRUNCATE skips the feedback trigger)
        cur.execute("TRUNCATE songs, artists, genres, user_profiles RESTART IDENTITY CASCADE")
        with cur.copy("COPY songs (spotify_id,title,album_name,duration_ms,popularity,explicit,valence,energy,"
                      "danceability,acousticness,instrumentalness,speechiness,liveness,tempo,description) FROM STDIN") as cp:
            for r in df.itertuples():
                cp.write_row((r.track_id, r.track_name[:500], r.album_name[:500], int(r.duration_ms), int(r.popularity),
                              bool(r.explicit), r.valence, r.energy, r.danceability, r.acousticness,
                              r.instrumentalness, r.speechiness, r.liveness, r.tempo, r.description))
        # COPY fires the BEFORE INSERT trigger, which sets mood_id + search_tsv
        cur.execute("SELECT spotify_id, song_id FROM songs"); ids = dict(cur.fetchall())

        artists = sorted({a.strip() for s in df.artists for a in s.split(";") if a.strip()})
        genres = sorted({g for gs in df.genres for g in gs})
        with cur.copy("COPY artists (name) FROM STDIN") as cp:
            for a in artists: cp.write_row((a[:500],))
        with cur.copy("COPY genres (name) FROM STDIN") as cp:
            for g in genres: cp.write_row((g,))
        cur.execute("SELECT name, artist_id FROM artists"); aid = dict(cur.fetchall())
        cur.execute("SELECT name, genre_id FROM genres"); gid = dict(cur.fetchall())

        with cur.copy("COPY song_artists FROM STDIN") as cp:
            for r in df.itertuples():
                for a in {x.strip()[:500] for x in r.artists.split(";") if x.strip()}:
                    cp.write_row((ids[r.track_id], aid[a]))
        with cur.copy("COPY song_genres FROM STDIN") as cp:
            for r in df.itertuples():
                for g in r.genres: cp.write_row((ids[r.track_id], gid[g]))
        cur.execute("DROP INDEX IF EXISTS idx_emb_text_hnsw; DROP INDEX IF EXISTS idx_emb_audio_hnsw")
        with cur.copy("COPY song_embeddings (song_id,text_vec,audio_vec,model) FROM STDIN") as cp:
            for r, tv, av in zip(df.itertuples(), text_vecs, audio_vecs):
                cp.write_row((ids[r.track_id], vec(tv), vec(av), model))
        print("[load] building HNSW indexes ...")
        for s in HNSW: cur.execute(s)
        cur.execute("ANALYZE")
        conn.commit()  # whole load is ONE transaction: all-or-nothing
    print(f"[load] {len(df)} songs, {len(artists)} artists, {len(genres)} genres loaded")


# ---------- 3b. RE-EMBED IN PLACE ----------
def reembed(db, allow_fallback):
    with psycopg.connect(db) as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT s.song_id, s.title, s.album_name, s.valence, s.energy, s.danceability, s.acousticness,
                   s.instrumentalness, s.speechiness, s.liveness, s.tempo, COALESCE(m.name, '') AS mood,
                   (SELECT string_agg(a.name, ', ' ORDER BY a.name) FROM song_artists sa JOIN artists a USING (artist_id)
                     WHERE sa.song_id = s.song_id) AS artists,
                   ARRAY(SELECT g.name FROM song_genres sg JOIN genres g USING (genre_id)
                         WHERE sg.song_id = s.song_id ORDER BY g.name) AS genres
            FROM songs s LEFT JOIN moods m ON m.mood_id = s.mood_id ORDER BY s.song_id""")
        df = pd.DataFrame(cur.fetchall(), columns=[d.name for d in cur.description])
        print(f"[reembed] {len(df)} songs in the database")
        df["description"] = [describe(r) for r in df.itertuples()]
        texts = [profile_text(r.title, r.artists or "", r.album_name, r.genres, r.mood, r.description) for r in df.itertuples()]
        tv, model = embed(texts, allow_fallback)
        av = audio_vectors(df)

        cur.execute("CREATE TEMP TABLE new_emb (song_id INT PRIMARY KEY, description TEXT,"
                    " text_vec vector(384), audio_vec vector(8)) ON COMMIT DROP")
        with cur.copy("COPY new_emb FROM STDIN") as cp:
            for r, t, a in zip(df.itertuples(), tv, av):
                cp.write_row((int(r.song_id), r.description, vec(t), vec(a)))
        cur.execute("DROP INDEX IF EXISTS idx_emb_text_hnsw; DROP INDEX IF EXISTS idx_emb_audio_hnsw")
        cur.execute("UPDATE songs s SET description = n.description FROM new_emb n WHERE n.song_id = s.song_id")
        cur.execute("UPDATE song_embeddings e SET text_vec = n.text_vec, audio_vec = n.audio_vec, model = %s "
                    "FROM new_emb n WHERE n.song_id = e.song_id", (model,))
        print(f"[reembed] updated {cur.rowcount} embeddings; building HNSW indexes ...")
        for s in HNSW: cur.execute(s)
        # Taste vectors were averages of the OLD embeddings -> recompute for every user
        cur.execute("SELECT count(refresh_taste(user_id)) FROM users")
        print(f"[reembed] refreshed {cur.fetchone()[0]} user taste profiles")
        cur.execute("ANALYZE")
        conn.commit()  # one transaction: either everything is re-embedded or nothing changes


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", nargs="?")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--reembed", action="store_true", help="re-embed songs already in the DB, keep user data")
    ap.add_argument("--allow-fallback", action="store_true", help="use the hashing embedder if MiniLM is unavailable")
    a = ap.parse_args(); t = time.time(); db = database_url()
    if a.reembed:
        reembed(db, a.allow_fallback)
    else:
        if not a.csv: ap.error("csv path required (or use --reembed)")
        df = clean(a.csv, a.limit)
        df["mood"] = [mood_of(v, e) for v, e in zip(df.valence, df.energy)]
        df["description"] = [describe(r) for r in df.itertuples()]
        tv, model = embed([profile_text(r.track_name, r.artists.replace(";", ", "), r.album_name, r.genres, r.mood,
                                        r.description) for r in df.itertuples()], a.allow_fallback)
        load(db, df, tv, audio_vectors(df), model)
    print(f"done in {time.time() - t:.1f}s")
