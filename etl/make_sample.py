"""Generate a small synthetic CSV in the exact Kaggle 'Spotify Tracks Dataset' format.
Only for testing when the real dataset.csv is not downloaded yet."""
import csv, random, string, sys
random.seed(7)
GENRES = ["pop", "rock", "jazz", "acoustic", "edm", "hip-hop", "classical", "metal", "indie", "lo-fi", "sad", "dance"]
WORDS = "love night rain fire dream heart summer blue light road home sky gold wild lonely dance moon star city ocean".split()
COLS = ["", "track_id", "artists", "album_name", "track_name", "popularity", "duration_ms", "explicit",
        "danceability", "energy", "key", "loudness", "mode", "speechiness", "acousticness",
        "instrumentalness", "liveness", "valence", "tempo", "time_signature", "track_genre"]
n = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
artists = [f"{random.choice(WORDS).title()} {random.choice(WORDS).title()}" for _ in range(150)]
out = sys.argv[2] if len(sys.argv) > 2 else "data/dataset.csv"
with open(out, "w", newline="") as f:
    w = csv.writer(f); w.writerow(COLS)
    for i in range(n):
        g = random.choice(GENRES)
        base_e = {"metal": .9, "edm": .85, "classical": .2, "acoustic": .3, "lo-fi": .3, "sad": .25}.get(g, .6)
        base_v = {"sad": .2, "metal": .3, "dance": .8, "pop": .65}.get(g, .5)
        clip = lambda x: round(min(1, max(0, x)), 3)
        tid = "".join(random.choices(string.ascii_letters + string.digits, k=22))
        w.writerow([i, tid, ";".join(random.sample(artists, random.choice([1, 1, 2]))),
                    " ".join(random.sample(WORDS, 2)).title(), " ".join(random.sample(WORDS, random.randint(1, 3))).title(),
                    random.randint(0, 100), random.randint(120000, 360000), random.random() < .1,
                    clip(random.gauss(.6, .15)), clip(random.gauss(base_e, .15)), random.randint(0, 11),
                    round(random.uniform(-20, 0), 2), random.randint(0, 1), clip(random.gauss(.08, .05)),
                    clip(random.gauss(1 - base_e, .2)), clip(random.random() ** 4), clip(random.gauss(.2, .1)),
                    clip(random.gauss(base_v, .2)), round(random.uniform(60, 180), 1), 4, g])
print(f"wrote {n} rows to {out}")
