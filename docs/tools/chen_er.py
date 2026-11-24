"""Chen-notation ER diagrams for MoodTune -> SVG -> PNG (rendered with Edge via Playwright).
usage: python chen.py <out_dir>
"""
import math, sys, html, pathlib
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
ENT_S, ENT_F = "#6D28D9", "#F4F1FB"
REL_S, REL_F = "#BE185D", "#FDF2F8"
ATT_S, ATT_F = "#57534E", "#FFFFFF"
LINE = "#44403C"
FONT = "Arial, Helvetica, sans-serif"


class D:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.lines, self.shapes, self.labels = [], [], []
        self.pos = {}

    # ---------- shapes ----------
    def entity(self, key, x, y, label, weak=False, fs=19):
        w = max(150, len(label) * fs * 0.68 + 44); h = 56
        self.pos[key] = (x, y, "e", w, h)
        s = f'<rect x="{x-w/2}" y="{y-h/2}" width="{w}" height="{h}" fill="{ENT_F}" stroke="{ENT_S}" stroke-width="2.5"/>'
        if weak:
            s += f'<rect x="{x-w/2+5}" y="{y-h/2+5}" width="{w-10}" height="{h-10}" fill="none" stroke="{ENT_S}" stroke-width="2"/>'
        s += f'<text x="{x}" y="{y}" font-size="{fs}" font-weight="700" fill="#2E1065" text-anchor="middle" dominant-baseline="central">{html.escape(label)}</text>'
        self.shapes.append(s)

    def rel(self, key, x, y, label, ident=False, fs=15):
        hw = max(62, len(label) * fs * 0.42 + 34); hh = 40
        self.pos[key] = (x, y, "r", hw * 2, hh * 2)
        pts = lambda a, b: f"{x},{y-b} {x+a},{y} {x},{y+b} {x-a},{y}"
        s = f'<polygon points="{pts(hw, hh)}" fill="{REL_F}" stroke="{REL_S}" stroke-width="2.5"/>'
        if ident:
            s += f'<polygon points="{pts(hw-9, hh-6)}" fill="none" stroke="{REL_S}" stroke-width="2"/>'
        s += f'<text x="{x}" y="{y}" font-size="{fs}" font-weight="700" fill="#831843" text-anchor="middle" dominant-baseline="central">{html.escape(label)}</text>'
        self.shapes.append(s)

    def attr(self, owner, x, y, label, key=False, derived=False, multi=False, fs=15, parent=None):
        rx = max(48, len(label) * fs * 0.3 + 22); ry = 21
        ox, oy = (self.pos[parent][:2] if parent else self.pos[owner][:2])
        self.lines.append(f'<line x1="{ox}" y1="{oy}" x2="{x}" y2="{y}" stroke="{LINE}" stroke-width="1.6"/>')
        dash = ' stroke-dasharray="6 4"' if derived else ""
        s = f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="{ATT_F}" stroke="{ATT_S}" stroke-width="1.8"{dash}/>'
        if multi:
            s += f'<ellipse cx="{x}" cy="{y}" rx="{rx-5}" ry="{ry-4}" fill="none" stroke="{ATT_S}" stroke-width="1.4"/>'
        deco = ' text-decoration="underline"' if key else ""
        s += f'<text x="{x}" y="{y}" font-size="{fs}" fill="#1C1917" text-anchor="middle" dominant-baseline="central"{deco}>{html.escape(label)}</text>'
        self.shapes.append(s)
        k = f"{owner}.{label}"; self.pos[k] = (x, y, "a", rx * 2, ry * 2)
        return k

    # ---------- connections ----------
    def link(self, ent, rel, card, total=False, card_at=0.30):
        x1, y1 = self.pos[ent][:2]; x2, y2 = self.pos[rel][:2]
        if total:
            dx, dy = x2 - x1, y2 - y1; L = math.hypot(dx, dy) or 1; nx, ny = -dy / L * 3.2, dx / L * 3.2
            for sgn in (1, -1):
                self.lines.append(f'<line x1="{x1+nx*sgn}" y1="{y1+ny*sgn}" x2="{x2+nx*sgn}" y2="{y2+ny*sgn}" stroke="{LINE}" stroke-width="1.8"/>')
        else:
            self.lines.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{LINE}" stroke-width="2"/>')
        # cardinality label: just outside the entity box along the line
        ew, eh = self.pos[ent][3], self.pos[ent][4]
        dx, dy = x2 - x1, y2 - y1; L = math.hypot(dx, dy) or 1; ux, uy = dx / L, dy / L
        t = min((ew / 2) / abs(ux) if ux else 1e9, (eh / 2) / abs(uy) if uy else 1e9)  # distance to box edge
        px, py = x1 + ux * (t + 22), y1 + uy * (t + 22)
        nx, ny = -uy, ux
        px, py = px + nx * 13, py + ny * 13
        self.labels.append(f'<text x="{px}" y="{py}" font-size="18" font-weight="700" fill="#0F766E" text-anchor="middle" dominant-baseline="central">{card}</text>')

    def svg(self, extra=""):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}" font-family="{FONT}">'
                f'<rect width="100%" height="100%" fill="white"/>' + "".join(self.lines) + "".join(self.shapes) + "".join(self.labels) + extra + "</svg>")


def legend(x, y):
    items = [
        f'<rect x="{x}" y="{y}" width="46" height="24" fill="{ENT_F}" stroke="{ENT_S}" stroke-width="2"/><text x="{x+56}" y="{y+12}" font-size="14" dominant-baseline="central">Entity</text>',
        f'<rect x="{x+120}" y="{y}" width="46" height="24" fill="{ENT_F}" stroke="{ENT_S}" stroke-width="2"/><rect x="{x+124}" y="{y+4}" width="38" height="16" fill="none" stroke="{ENT_S}" stroke-width="1.5"/><text x="{x+176}" y="{y+12}" font-size="14" dominant-baseline="central">Weak entity</text>',
        f'<polygon points="{x+300},{y-2} {x+326},{y+12} {x+300},{y+26} {x+274},{y+12}" fill="{REL_F}" stroke="{REL_S}" stroke-width="2"/><text x="{x+336}" y="{y+12}" font-size="14" dominant-baseline="central">Relationship</text>',
        f'<ellipse cx="{x+470}" cy="{y+12}" rx="30" ry="13" fill="white" stroke="{ATT_S}" stroke-width="1.6"/><text x="{x+470}" y="{y+12}" font-size="12" text-anchor="middle" dominant-baseline="central" text-decoration="underline">key</text><text x="{x+508}" y="{y+12}" font-size="14" dominant-baseline="central">Key attribute</text>',
        f'<line x1="{x+620}" y1="{y+9}" x2="{x+660}" y2="{y+9}" stroke="{LINE}" stroke-width="1.8"/><line x1="{x+620}" y1="{y+15}" x2="{x+660}" y2="{y+15}" stroke="{LINE}" stroke-width="1.8"/><text x="{x+670}" y="{y+12}" font-size="14" dominant-baseline="central">Total participation</text>',
    ]
    return "".join(items)


# ================= 1. MAIN DIAGRAM (entities, relationships, keys) =================
d = D(1600, 930)
d.entity("USER", 230, 410, "USER")
d.entity("PROFILE", 230, 110, "USER_PROFILE", weak=True)
d.entity("PLAYLIST", 230, 735, "PLAYLIST")
d.entity("SONG", 870, 410, "SONG")
d.entity("EMB", 870, 95, "SONG_EMBEDDING", weak=True)
d.entity("ARTIST", 1395, 205, "ARTIST")
d.entity("GENRE", 1395, 590, "GENRE")
d.entity("MOOD", 870, 820, "MOOD")

d.rel("HAS_TASTE", 230, 262, "HAS_TASTE", ident=True)
d.rel("OWNS", 230, 575, "OWNS")
d.rel("RATES", 550, 262, "RATES")
d.rel("PLAYS", 550, 410, "PLAYS")
d.rel("CONTAINS", 550, 600, "CONTAINS")
d.rel("THEMED", 550, 820, "THEMED")
d.rel("EMBEDDED", 870, 250, "EMBEDDED_AS", ident=True)
d.rel("PERFORMS", 1140, 300, "PERFORMS")
d.rel("BELONGS", 1140, 510, "BELONGS_TO")
d.rel("TAGGED", 870, 625, "TAGGED")

d.link("USER", "HAS_TASTE", "1"); d.link("PROFILE", "HAS_TASTE", "1", total=True)
d.link("USER", "OWNS", "1"); d.link("PLAYLIST", "OWNS", "N", total=True)
d.link("USER", "RATES", "M"); d.link("SONG", "RATES", "N")
d.link("USER", "PLAYS", "M"); d.link("SONG", "PLAYS", "N")
d.link("PLAYLIST", "CONTAINS", "M"); d.link("SONG", "CONTAINS", "N")
d.link("PLAYLIST", "THEMED", "N"); d.link("MOOD", "THEMED", "1")
d.link("SONG", "EMBEDDED", "1"); d.link("EMB", "EMBEDDED", "1", total=True)
d.link("ARTIST", "PERFORMS", "M"); d.link("SONG", "PERFORMS", "N", total=True)
d.link("SONG", "BELONGS", "M", total=True); d.link("GENRE", "BELONGS", "N")
d.link("SONG", "TAGGED", "N"); d.link("MOOD", "TAGGED", "1")

# key + a few defining attributes
d.attr("USER", 78, 345, "user_id", key=True); d.attr("USER", 78, 475, "email"); d.attr("USER", 100, 545, "role", fs=15)
d.attr("PROFILE", 430, 70, "taste_vec")
d.attr("PLAYLIST", 85, 655, "playlist_id", key=True); d.attr("PLAYLIST", 85, 815, "name")
d.attr("SONG", 728, 302, "song_id", key=True); d.attr("SONG", 1040, 232, "title")
d.attr("SONG", 1010, 560, "valence"); d.attr("SONG", 1045, 665, "energy")
d.attr("EMB", 1110, 60, "text_vec"); d.attr("EMB", 1110, 130, "audio_vec")
d.attr("ARTIST", 1395, 95, "artist_id", key=True); d.attr("ARTIST", 1535, 290, "name")
d.attr("GENRE", 1395, 700, "genre_id", key=True); d.attr("GENRE", 1535, 500, "name")
d.attr("MOOD", 690, 890, "mood_id", key=True); d.attr("MOOD", 1060, 890, "name")
# relationship attributes
d.attr("RATES", 550, 168, "rating"); d.attr("RATES", 400, 190, "rated_at")
d.attr("PLAYS", 440, 495, "played_at"); d.attr("PLAYS", 550, 338, "ms_played")
d.attr("CONTAINS", 420, 690, "position")
main = d.svg(legend(560, 6))


# ================= 2. ATTRIBUTE DETAIL (backup) =================
def star(d, key, cx, cy, label, attrs, rx, ry, weak=False, start=-90, fs=14):
    d.entity(key, cx, cy, label, weak=weak)
    n = len(attrs)
    for i, a in enumerate(attrs):
        ang = math.radians(start + 360 * i / n)
        name, opts = (a, {}) if isinstance(a, str) else a
        d.attr(key, cx + rx * math.cos(ang), cy + ry * math.sin(ang), name, fs=fs, **opts)


# 2a: SONG with composite attribute audio_features
a = D(1600, 900)
a.entity("SONG", 560, 450, "SONG")
song_attrs = [("song_id", {"key": True}), "spotify_id", "title", "album_name", "duration_ms", "popularity", "explicit",
              "description", ("search_tsv", {"derived": True})]
for i, at in enumerate(song_attrs):
    ang = math.radians(100 + 220 * i / (len(song_attrs) - 1))
    name, opts = (at, {}) if isinstance(at, str) else at
    a.attr("SONG", 560 + 400 * math.cos(ang), 450 + 330 * math.sin(ang), name, fs=16, **opts)
comp = a.attr("SONG", 1020, 450, "audio_features", fs=16)
feats = ["valence", "energy", "danceability", "acousticness", "instrumentalness", "speechiness", "liveness", "tempo"]
for i, ft in enumerate(feats):
    ang = math.radians(-80 + 160 * i / (len(feats) - 1))
    a.attr("SONG", 1020 + 360 * math.cos(ang), 450 + 380 * math.sin(ang), ft, fs=16, parent=comp)
note = ('<text x="40" y="40" font-size="20" font-weight="700" fill="#2E1065">SONG — all attributes</text>'
        '<text x="40" y="70" font-size="15" fill="#57534E">audio_features is a composite attribute · search_tsv is derived (dashed, kept by trigger) · mood comes from the TAGGED relationship</text>')
song_svg = a.svg(note)

# 2b: user side
b = D(1600, 900)
star(b, "USER", 330, 300, "USER", [("user_id", {"key": True}), "username", "email", "password_hash", "role", "created_at"], 230, 165)
star(b, "PLAYLIST", 1230, 300, "PLAYLIST", [("playlist_id", {"key": True}), "name", "created_at"], 200, 140)
star(b, "PROFILE", 330, 700, "USER_PROFILE", [("user_id", {"key": True}), "taste_vec", "taste_audio", "dislike_vec", "updated_at"], 250, 140, weak=True)
b.rel("RATES", 760, 610, "RATES"); b.attr("RATES", 680, 720, "rating"); b.attr("RATES", 860, 720, "rated_at")
b.rel("PLAYS", 1060, 610, "PLAYS"); b.attr("PLAYS", 980, 720, "event_id", key=True); b.attr("PLAYS", 1140, 720, "played_at"); b.attr("PLAYS", 1060, 800, "ms_played")
b.rel("CONTAINS", 1360, 610, "CONTAINS"); b.attr("CONTAINS", 1360, 720, "position")
user_svg = b.svg('<text x="40" y="40" font-size="20" font-weight="700" fill="#2E1065">Users, playlists, taste profile — and relationship attributes</text>'
                 '<text x="700" y="535" font-size="15" fill="#57534E">Relationship attributes (stored on the junction / event tables)</text>')

# 2c: catalogue side
c = D(1600, 900)
star(c, "MOOD", 330, 330, "MOOD", [("mood_id", {"key": True}), "name", "valence_min", "valence_max", "energy_min", "energy_max"], 240, 170)
star(c, "ARTIST", 900, 260, "ARTIST", [("artist_id", {"key": True}), "name"], 150, 110, start=-60)
star(c, "GENRE", 1330, 260, "GENRE", [("genre_id", {"key": True}), "name"], 150, 110, start=-60)
star(c, "EMB", 900, 680, "SONG_EMBEDDING", [("song_id", {"key": True}), "text_vec", "audio_vec", "model"], 260, 130, weak=True)
cat_svg = c.svg('<text x="40" y="40" font-size="20" font-weight="700" fill="#2E1065">Moods, artists, genres, embeddings</text>'
                '<text x="560" y="860" font-size="15" fill="#57534E">SONG_EMBEDDING is weak: identified by its SONG (song_id is both its key and the owner’s key)</text>')

with sync_playwright() as pw:
    br = pw.chromium.launch(channel="msedge"); pg = br.new_page(device_scale_factor=2)
    for name, svg in [("chen_er_main", main), ("chen_er_song", song_svg), ("chen_er_users", user_svg), ("chen_er_catalogue", cat_svg)]:
        (OUT / f"{name}.svg").write_text(svg, encoding="utf8")
        pg.set_viewport_size({"width": 1600, "height": 930})
        pg.set_content(f'<html><body style="margin:0">{svg}</body></html>')
        pg.locator("svg").screenshot(path=str(OUT / f"{name}.png")); print("rendered", name)
    br.close()
