"""Create demo accounts (admin/listener) + random listening history & likes for dashboards."""
import random, psycopg, bcrypt
from pipeline import database_url  # DATABASE_URL from env or web/.env.local (no hard-coded credentials)
DB = database_url()
random.seed(1)
with psycopg.connect(DB) as c, c.cursor() as cur:
    h = lambda p: bcrypt.hashpw(p.encode(), bcrypt.gensalt(10)).decode()
    for u, e, r in [("admin", "admin@demo.com", "admin"), ("ishika", "ishika@demo.com", "listener"), ("arham", "arham@demo.com", "listener")]:
        cur.execute("INSERT INTO users (username,email,password_hash,role) VALUES (%s,%s,%s,%s) ON CONFLICT (email) DO NOTHING",
                    (u, e, h("password123"), r))
    cur.execute("SELECT user_id FROM users WHERE role='listener'"); users = [x[0] for x in cur.fetchall()]
    cur.execute("SELECT song_id, mood_id FROM songs ORDER BY popularity DESC LIMIT 500"); songs = cur.fetchall()
    for u in users:
        for sid, mid in random.sample(songs, 60):
            cur.execute("INSERT INTO listening_events (user_id,song_id,played_at,ms_played,context_mood_id) "
                        "VALUES (%s,%s, now() - (random()*30 || ' days')::interval, %s, %s)",
                        (u, sid, random.randint(30000, 240000), mid))
        for sid, _ in random.sample(songs, 12):
            cur.execute("INSERT INTO feedback (user_id,song_id,rating) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                        (u, sid, random.choice([1, 1, 1, -1])))
    c.commit()
print("demo users: admin@demo.com / ishika@demo.com / arham@demo.com  (password123)")
