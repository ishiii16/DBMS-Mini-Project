// MoodTune – final presentation deck (pptxgenjs, structured: theme + layouts + sections)
const pptxgen = require("pptxgenjs");
const React = require("react");
const RDS = require("react-dom/server");
const sharp = require("sharp");
const path = require("path");
const Lu = require("react-icons/lu");

const SKILL = process.argv[2];               // pptx skill dir (for apply_theme.js)
const OUT = process.argv[3];                 // output .pptx
const P = "C:/Users/ASUS/Downloads/DBMS/miniproject/mood-music";
const { applyTheme } = require(path.join(SKILL, "scripts/apply_theme.js"));

const THEME = {
  name: "MoodTune",
  headFontFace: "Arial",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1F1B2E", lt1: "FFFFFF", dk2: "16121F", lt2: "F4F1FB",
    accent1: "7C3AED", accent2: "DB2777", accent3: "0D9488", accent4: "D97706", accent5: "9333EA", accent6: "2563EB",
    hlink: "7C3AED", folHlink: "6D28D9",
  },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = "MoodTune – Semantic Music Discovery";
pres.author = "Arham Mayur Burad, Ishika Jain";
const C = pres.SchemeColor;
const W = 13.333, M = 0.6;

// ---------- layouts ----------
const footer = { text: "MoodTune · DBMS Level 3", options: { x: M, y: 7.0, w: 6, h: 0.3, fontSize: 10, color: C.text1, transparency: 50, margin: 0 } };
pres.defineSlideMaster({
  title: "TITLE_DARK", background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: M, y: 2.35, w: 11.5, h: 1.3, fontSize: 60, bold: true, color: C.background1, valign: "bottom", align: "left", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: M, y: 3.8, w: 10.5, h: 0.9, fontSize: 22, color: C.background2, valign: "top", margin: 0 }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "SECTION_DARK", background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: M, y: 2.9, w: 11.5, h: 1.0, fontSize: 44, bold: true, color: C.background1, align: "left", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: M, y: 4.0, w: 11.5, h: 0.8, fontSize: 18, color: C.background2, margin: 0 }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "CONTENT", background: { color: C.background1 },
  objects: [
    { placeholder: { options: { name: "kicker", type: "body", x: M, y: 0.42, w: 9, h: 0.3, fontSize: 12, bold: true, color: C.accent1, charSpacing: 2, margin: 0 }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: M, y: 0.72, w: 12.1, h: 0.85, fontSize: 32, bold: true, color: C.text1, valign: "top", align: "left", margin: 0 }, text: "" } },
    { text: footer },
  ],
  slideNumber: { x: 12.1, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: C.text1, align: "right" },
});

// ---------- helpers ----------
async function icon(name, hex, size = 256) {
  const Comp = Lu[name];
  if (!Comp) throw new Error("missing icon " + name);
  const svg = RDS.renderToStaticMarkup(React.createElement(Comp, { color: "#" + hex, size, strokeWidth: 2 }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}
async function img(file, cropH) {
  let s = sharp(file);
  const meta = await s.metadata();
  if (cropH && meta.height > cropH) s = s.extract({ left: 0, top: 0, width: meta.width, height: cropH });
  const buf = await s.png().toBuffer();
  const m2 = await sharp(buf).metadata();
  return { data: "image/png;base64," + buf.toString("base64"), ratio: m2.width / m2.height };
}
function fit(im, x, y, maxW, maxH, center = true) {
  let w = maxW, h = w / im.ratio;
  if (h > maxH) { h = maxH; w = h * im.ratio; }
  return { x: center ? x + (maxW - w) / 2 : x, y, w, h };
}
let n = 0;
function content(section, kicker, title) {
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: section });
  s.addText(kicker, { placeholder: "kicker" });
  s.addText(title, { placeholder: "title" });
  return s;
}
const txt = (s, t, o) => s.addText(t, { isTextBox: true, margin: 0, color: C.text1, fontSize: 16, valign: "top", ...o });
const muted = { color: C.text1, transparency: 40 };
function card(s, x, y, w, h, name) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: C.background2 }, line: { type: "none" }, objectName: name });
}
async function iconDot(s, x, y, name, d = 0.62, fillC = C.accent1) {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fillC }, line: { type: "none" }, objectName: "icon-bg-" + name });
  s.addImage({ data: await icon(name, "FFFFFF"), x: x + d * 0.22, y: y + d * 0.22, w: d * 0.56, h: d * 0.56, altText: name });
}
function table(s, rows, o) {
  const head = rows[0].map((t) => ({ text: t, options: { bold: true, color: C.text1, fill: { color: C.background2 } } }));
  const body = rows.slice(1).map((r) => r.map((t) => ({ text: t })));
  s.addTable([head, ...body], { fontFace: "Calibri", fontSize: 14, color: C.text1, border: { type: "solid", pt: 0.75, color: "DDD8EA" },
    margin: [0.06, 0.1, 0.06, 0.1], valign: "middle", autoPage: false, ...o });
}
function code(s, lines, x, y, w, h) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: C.background2 }, line: { type: "none" }, objectName: "code-bg" });
  s.addText(lines.join("\n"), { isTextBox: true, x: x + 0.25, y: y + 0.2, w: w - 0.5, h: h - 0.4, fontFace: "Courier New", fontSize: 13, color: C.text1, valign: "top", margin: 0, paraSpaceAfter: 0 });
}

(async () => {
  const shots = (f) => path.join(P, "screenshots", f);

  // ================= MAIN =================
  pres.addSection({ title: "Introduction" });
  let s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "Introduction" });
  s.addText("MoodTune", { placeholder: "title" });
  s.addText("Find songs by how they feel — not just by genre", { placeholder: "body" });
  s.addImage({ data: await icon("LuHeadphones", HEX.accent1), x: M, y: 1.15, w: 0.9, h: 0.9, altText: "Sound wave" });
  txt(s, [
    { text: "Arham Mayur Burad", options: { bold: true, breakLine: true } }, { text: "PES2UG24AM025", options: { breakLine: true } },
  ], { x: M, y: 5.55, w: 3.5, h: 0.7, color: C.background1, fontSize: 15 });
  txt(s, [
    { text: "Ishika Jain", options: { bold: true, breakLine: true } }, { text: "PES2UG24AM067", options: { breakLine: true } },
  ], { x: 4.3, y: 5.55, w: 3.5, h: 0.7, color: C.background1, fontSize: 15 });
  txt(s, "DBMS Experiential Learning · Level 3 · PES University", { x: M, y: 6.6, w: 8, h: 0.35, color: C.background2, fontSize: 13 });
  txt(s, "PostgreSQL  ·  pgvector  ·  Next.js", { x: 8.2, y: 6.6, w: 4.5, h: 0.35, color: C.background2, fontSize: 13, align: "right" });
  s.addNotes("One line: MoodTune recommends music by how a song feels — its mood, sound and meaning — instead of only genre or popularity. Structured data lives in PostgreSQL, the 'feel' of every song is stored as a vector with pgvector, and users use it through a Next.js web app with two roles (listener, admin).");

  // 2 Problem
  s = content("Introduction", "01 · PROBLEM", "Recommenders match genre, not feeling");
  const colW = 5.8;
  card(s, M, 1.9, colW, 4.6, "today-card"); card(s, M + colW + 0.5, 1.9, colW, 4.6, "moodtune-card");
  await iconDot(s, M + 0.4, 2.25, "LuListMusic", 0.62, C.text1);
  await iconDot(s, M + colW + 0.9, 2.25, "LuSparkles", 0.62, C.accent1);
  txt(s, "Today", { x: M + 1.25, y: 2.35, w: 4, h: 0.45, fontSize: 22, bold: true });
  txt(s, "MoodTune", { x: M + colW + 1.75, y: 2.35, w: 4, h: 0.45, fontSize: 22, bold: true, color: C.accent1 });
  const bl = (arr) => arr.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < arr.length - 1 } }));
  txt(s, bl(["Ranks by genre, artist and popularity", "The same hits keep coming back", "You can’t ask for “calm songs for a rainy evening”"]),
    { x: M + 0.4, y: 3.25, w: colW - 0.8, h: 3, fontSize: 18, paraSpaceAfter: 14 });
  txt(s, bl(["Finds songs that feel alike — across genres", "Describe a feeling in plain English", "Learns from your likes and dislikes"]),
    { x: M + colW + 0.9, y: 3.25, w: colW - 0.8, h: 3, fontSize: 18, paraSpaceAfter: 14 });
  s.addNotes("Two songs from different genres can feel the same — slow, nostalgic, low-energy — but a genre/artist recommender won't connect them. Users also think in feelings ('songs for studying'), which keyword search can't match. That is a similarity problem, which is what vector databases are for. This is why the project is not a CRUD app.");

  // 3 Objectives & scope
  s = content("Introduction", "02 · OBJECTIVES & SCOPE", "What we set out to build");
  const obj = [
    ["LuDatabase", "Design", "Normalised schema with integrity enforced in the database"],
    ["LuBrain", "Understand", "Store each song’s meaning as a vector and search by similarity"],
    ["LuCompass", "Discover", "Mood, “more like this”, plain-English search, personal picks"],
    ["LuShieldCheck", "Deliver", "Secure Next.js app with listener and admin roles"],
  ];
  for (let i = 0; i < 4; i++) {
    const x = M + i * 3.07;
    card(s, x, 1.9, 2.85, 3.0, "obj-" + i);
    await iconDot(s, x + 0.3, 2.2, obj[i][0]);
    txt(s, obj[i][1], { x: x + 0.3, y: 3.05, w: 2.3, h: 0.45, fontSize: 20, bold: true });
    txt(s, obj[i][2], { x: x + 0.3, y: 3.55, w: 2.35, h: 1.3, fontSize: 15 });
  }
  txt(s, [{ text: "In scope  ", options: { bold: true, color: C.accent1 } }, { text: "20,000 songs, 4 moods, semantic + audio similarity, playlists, feedback, analytics, admin tools" }],
    { x: M, y: 5.3, w: 12, h: 0.4, fontSize: 15 });
  txt(s, [{ text: "Out of scope  ", options: { bold: true, color: C.accent2 } }, { text: "audio streaming, lyrics (not in the dataset), mobile app, Spotify account sync" }],
    { x: M, y: 5.8, w: 12, h: 0.4, fontSize: 15 });
  s.addNotes("Scope is deliberately focused on the database design and retrieval. Lyrics are out of scope because the Kaggle dataset has none and lyrics are copyrighted — instead we generate a description of each song from its audio features (explained later).\nDataset: Kaggle 'Spotify Tracks Dataset' (maharshipandya) — 114,000 rows, cleaned to 20,000 unique songs (a track appears once per genre, re-releases removed).");

  // 4 Four ways
  pres.addSection({ title: "The product" });
  s = content("The product", "03 · FEATURES", "Four ways to discover music");
  const ways = [
    ["LuSmile", "Pick a mood", "Energetic, Calm, Tense or Sad — ranked for you", "recommend(user, mood)"],
    ["LuDisc3", "More like this", "Songs that feel like a song you love", "similar_songs(seed)"],
    ["LuMessageSquare", "Describe a feeling", "“calm acoustic songs for a rainy evening”", "semantic_search(query)"],
    ["LuHeart", "Made for you", "Learns from likes, dislikes and history", "user_profiles + trigger"],
  ];
  for (let i = 0; i < 4; i++) {
    const x = M + (i % 2) * 6.15, y = 1.9 + Math.floor(i / 2) * 2.45;
    card(s, x, y, 5.95, 2.2, "way-" + i);
    await iconDot(s, x + 0.35, y + 0.4, ways[i][0], 0.7);
    txt(s, ways[i][1], { x: x + 1.35, y: y + 0.38, w: 4.4, h: 0.45, fontSize: 21, bold: true });
    txt(s, ways[i][2], { x: x + 1.35, y: y + 0.88, w: 4.4, h: 0.7, fontSize: 16 });
    txt(s, ways[i][3], { x: x + 1.35, y: y + 1.6, w: 4.4, h: 0.35, fontSize: 13, fontFace: "Courier New", color: C.accent1 });
  }
  s.addNotes("Each discovery mode maps to one stored function in PostgreSQL. Plus: keyword search (full-text), playlists (create, rename, add, remove, delete), listening history, a personal dashboard, and an admin console (analytics, mood thresholds, users, catalogue import).\nEvery mood click or the Shuffle button returns a fresh set: the function keeps the 60 best-scored songs and picks 20 at random.");

  // 5 Demo screenshot
  s = content("The product", "04 · DEMO", "Describe a feeling, get matching songs");
  let im = await img(shots("04_natural_language_search.png"));
  let f = fit(im, M, 1.75, 8.3, 5.1, false);
  s.addImage({ data: im.data, ...f, altText: "Natural-language search results", rounding: false });
  const dx = M + f.w + 0.45;
  txt(s, "You type", { x: dx, y: 1.95, w: 3.6, h: 0.35, fontSize: 13, bold: true, color: C.accent1 });
  txt(s, "“calm acoustic songs for a rainy evening”", { x: dx, y: 2.3, w: 3.6, h: 0.9, fontSize: 18, italic: true });
  txt(s, "MoodTune finds", { x: dx, y: 3.4, w: 3.6, h: 0.35, fontSize: 13, bold: true, color: C.accent1 });
  txt(s, bl(["Paris in the Rain", "Amsterdam", "Passing Rain", "To the Rain"]), { x: dx, y: 3.75, w: 3.6, h: 1.6, fontSize: 16, paraSpaceAfter: 4 });
  txt(s, "No keyword rules — matched by meaning", { x: dx, y: 5.6, w: 3.6, h: 0.7, fontSize: 14, ...muted });
  s.addNotes("Live demo path: log in as ishika@demo.com / password123 → type a feeling in the ✨ box → click a mood card twice to show fresh picks → open a song's 'Similar' page and move the text/audio slider → like a song and show recommendations change → log in as admin@demo.com to show the admin console.\nHow it works: the sentence is turned into a 384-number vector by the same model used for songs, then PostgreSQL finds the songs with the closest vectors (cosine similarity) using the HNSW index.");

  // 6 Architecture
  pres.addSection({ title: "Database design" });
  s = content("Database design", "05 · ARCHITECTURE", "Three layers, one database");
  im = await img(path.join(P, "docs/images/architecture.png"));
  f = fit(im, M, 1.7, 7.0, 5.15, false);
  s.addImage({ data: im.data, ...f, altText: "System architecture diagram" });
  const ax = M + f.w + 0.5;
  const layers = [["Next.js pages", "What the user sees"], ["API routes /api/*", "Login check, validation, transactions"], ["PostgreSQL + pgvector", "Tables, vectors, triggers, functions"]];
  for (let i = 0; i < 3; i++) {
    txt(s, layers[i][0], { x: ax, y: 2.0 + i * 1.35, w: 12.7 - ax, h: 0.4, fontSize: 19, bold: true });
    txt(s, layers[i][1], { x: ax, y: 2.42 + i * 1.35, w: 12.7 - ax, h: 0.5, fontSize: 15, ...muted });
  }
  txt(s, "Python ETL loads the catalogue and embeddings once, in one transaction", { x: ax, y: 6.05, w: 12.7 - ax, h: 0.6, fontSize: 14, color: C.accent1 });
  s.addNotes("The browser never talks to the database directly — guideline 10. All SQL is parameterised ($1, $2) in the API layer. DATABASE_URL and JWT_SECRET come only from web/.env.local (not committed). The ETL (etl/pipeline.py) cleans the Kaggle CSV, writes descriptions, embeds them with all-MiniLM-L6-v2 and bulk-loads with COPY inside a single transaction. The web app embeds search sentences with the same model through transformers.js.");

  // 7 Database choice
  s = content("Database design", "06 · DATABASE CHOICE", "Each kind of data goes where it fits");
  table(s, [
    ["Data", "What it is like", "Stored in", "Why"],
    ["Users, roles, playlists", "Must be unique and correct", "SQL tables", "Keys, constraints, transactions"],
    ["Songs, artists, genres", "Linked many-to-many", "SQL tables", "JOINs and normalisation"],
    ["Plays, likes, dislikes", "Many dated rows", "SQL tables", "Easy to count and group"],
    ["What a song feels like", "384 numbers (embedding)", "pgvector", "Find the nearest songs"],
    ["How a song sounds", "8 audio features", "pgvector", "“Sounds like” search"],
    ["A user’s taste", "Average of liked songs", "pgvector", "Personal ranking"],
  ], { x: M, y: 1.85, w: 12.1, colW: [3.0, 3.3, 2.0, 3.8], fontSize: 16, rowH: 0.55 });
  txt(s, "Rule of thumb: exact facts → SQL.  Similarity → vectors.", { x: M, y: 6.1, w: 12, h: 0.45, fontSize: 18, bold: true, color: C.accent1 });
  s.addNotes("Guideline 18 asks to justify the choice by the nature of the data. SQL is for facts that must be exact and consistent (who liked what, when). 'Which songs feel like this one?' cannot be answered with WHERE or LIKE — it needs nearest-neighbour search over vectors. We chose Option 2 of the guidelines: SQL + Vector database (PostgreSQL + pgvector).");

  // 8 Why pgvector
  s = content("Database design", "07 · WHY PGVECTOR", "Why vectors live inside PostgreSQL");
  const why = [
    ["LuMerge", "One query", "Vector search + JOINs + mood filter + skip heard songs, together in a stored function"],
    ["LuLock", "One transaction", "Songs, artists and vectors load all-or-nothing; taste vectors update with each like"],
    ["LuGauge", "Fast enough", "HNSW index: nearest 10 of 20,000 songs in 7 ms"],
  ];
  for (let i = 0; i < 3; i++) {
    const x = M + i * 4.1;
    card(s, x, 1.9, 3.85, 3.3, "why-" + i);
    await iconDot(s, x + 0.35, 2.2, why[i][0]);
    txt(s, why[i][1], { x: x + 0.35, y: 3.05, w: 3.2, h: 0.45, fontSize: 21, bold: true });
    txt(s, why[i][2], { x: x + 0.35, y: 3.6, w: 3.2, h: 1.5, fontSize: 15 });
  }
  txt(s, [{ text: "Why not Qdrant / Pinecone?  ", options: { bold: true } },
    { text: "a second database to keep in sync, results merged in app code, no shared transaction. pgvector is listed in the guidelines as a vector database." }],
    { x: M, y: 5.6, w: 12.1, h: 0.8, fontSize: 15 });
  s.addNotes("If asked 'is pgvector really a vector database?': yes — the guidelines list 'PostgreSQL with pgvector' explicitly under Option 2. It adds a vector column type, distance operators (<=> cosine, <-> L2, <#> inner product) and ANN indexes (HNSW, IVFFlat).\nWhy not MongoDB? Our data is highly relational (users–songs–playlists–feedback); a document store would duplicate data and lose FK integrity.\nTrade-off we accept: a dedicated vector DB scales further (hundreds of millions of vectors); 20,000 songs is far below where that matters.");

  // 9 ER diagram
  s = content("Database design", "08 · ER DIAGRAM", "ER diagram (Chen notation)");
  im = await img(path.join(P, "docs/images/chen_er_main.png"));
  f = fit(im, M, 1.45, 12.1, 5.55);
  s.addImage({ data: im.data, ...f, altText: "ER diagram of the MoodTune database" });
  s.addNotes("How to read it (Chen): rectangles = entities, double rectangles = weak entities (USER_PROFILE, SONG_EMBEDDING exist only for their owner), diamonds = relationships, double diamond = identifying relationship, ovals = attributes (underlined = key), double lines = total participation (every playlist must have an owner; every embedding belongs to a song), 1 / N / M = cardinality.\nM:N relationships become junction tables: RATES -> feedback (rating, rated_at), PLAYS -> listening_events (played_at, ms_played; it has its own event_id because the same user can play the same song many times), CONTAINS -> playlist_songs (position), PERFORMS -> song_artists, BELONGS_TO -> song_genres. 1:N relationships become foreign keys: OWNS -> playlists.user_id, TAGGED -> songs.mood_id, THEMED -> playlists.mood_id. Full attribute lists are in the backup slides.\nTables: \nM:N — Song–Artist (song_artists), Song–Genre (song_genres), Playlist–Song (playlist_songs, with position), User–Song via Feedback (rating −1/+1, one per user per song).\n1:N — User→ListeningEvent, User→Playlist, Mood→Song.\n1:1 — Song→SongEmbedding, User→UserProfile (they hold the vectors).\nAll FKs use ON DELETE CASCADE except mood references (ON DELETE SET NULL). Full diagram source: docs/images/er.mmd.");

  // 10 Schema groups
  s = content("Database design", "09 · RELATIONAL SCHEMA", "Three groups of tables, all in 3NF");
  const groups = [
    ["LuLibrary", "Catalogue", ["songs", "artists", "song_artists", "genres", "song_genres", "moods"]],
    ["LuUsers", "Users & activity", ["users", "listening_events", "feedback", "playlists", "playlist_songs"]],
    ["LuBoxes", "Vectors", ["song_embeddings", "user_profiles"]],
  ];
  for (let i = 0; i < 3; i++) {
    const x = M + i * 4.1;
    card(s, x, 1.9, 3.85, 4.3, "group-" + i);
    await iconDot(s, x + 0.35, 2.2, groups[i][0], 0.62, i === 2 ? C.accent2 : C.accent1);
    txt(s, groups[i][1], { x: x + 1.15, y: 2.3, w: 2.6, h: 0.45, fontSize: 20, bold: true });
    txt(s, groups[i][2].join("\n"), { x: x + 0.35, y: 3.15, w: 3.3, h: 2.9, fontSize: 16, fontFace: "Courier New", paraSpaceAfter: 6 });
    if (i === 2) txt(s, "384-d meaning + 8-d sound per song; taste, sound and dislike vectors per user", { x: x + 0.35, y: 4.15, w: 3.2, h: 1.2, fontSize: 14, ...muted });
  }
  txt(s, "Multi-valued data (artists, genres, playlist songs) lives in junction tables — no repeated names, no lists in a column.",
    { x: M, y: 6.4, w: 12.1, h: 0.45, fontSize: 14, ...muted });
  s.addNotes("Normalisation: every non-key attribute depends on the key, the whole key and nothing but the key. Artist and genre names are stored once; mood boundaries are stored once in moods. The only derived columns, songs.mood_id and songs.search_tsv, are maintained by a trigger so they can never drift. Full column list with types and constraints is in the backup slides and in docs/DOCUMENTATION.md §8.");

  // 11 Integrity
  s = content("Database design", "10 · INTEGRITY", "Rules live in the database, not just the app");
  const rules = [
    ["Primary & foreign keys", "every table; ON DELETE CASCADE / SET NULL"],
    ["UNIQUE", "email, username, (user, playlist name), (playlist, position)"],
    ["CHECK", "rating ∈ {−1, 1}, valence & energy 0–1, mood min < max"],
    ["NOT NULL + DEFAULT", "role = ‘listener’, timestamps = now()"],
    ["Added with ALTER", "playlist name can’t be blank"],
    ["Triggers", "mood tag, taste profile and Liked songs playlist always up to date"],
  ];
  for (let i = 0; i < rules.length; i++) {
    const x = M + (i % 2) * 6.15, y = 1.9 + Math.floor(i / 2) * 1.5;
    card(s, x, y, 5.95, 1.25, "rule-" + i);
    s.addImage({ data: await icon("LuCheckCircle2", HEX.accent1), x: x + 0.3, y: y + 0.38, w: 0.45, h: 0.45, altText: "check" });
    txt(s, rules[i][0], { x: x + 0.95, y: y + 0.2, w: 4.8, h: 0.4, fontSize: 18, bold: true });
    txt(s, rules[i][1], { x: x + 0.95, y: y + 0.62, w: 4.8, h: 0.5, fontSize: 15, ...muted });
  }
  s.addNotes("Guideline 12: validation at the database level. Even if someone bypasses the web app, PostgreSQL rejects bad data — tests T1–T9 prove it (rating 5 rejected, duplicate email rejected, FK to a missing song rejected, mood with min ≥ max rejected, blank playlist name rejected).\nThe API also validates (username pattern, email format, password 8–72 chars) and maps DB errors to clean messages: 23505 → 409 'Already exists', 23503 → 400, 23514 → 400.");

  // 12 Mood model
  s = content("Database design", "11 · MOOD MODEL", "Every song lands in one of four moods");
  const q = [["Tense", "low happiness · high energy", "7,161", C.accent5], ["Energetic", "high happiness · high energy", "6,904", C.accent4],
             ["Sad", "low happiness · low energy", "4,610", C.accent6], ["Calm", "high happiness · low energy", "1,325", C.accent3]];
  const qx = M + 0.5, qy = 1.85, qw = 3.1, qh = 2.3;
  for (let i = 0; i < 4; i++) {
    const x = qx + (i % 2) * (qw + 0.15), y = qy + Math.floor(i / 2) * (qh + 0.15);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: qw, h: qh, rectRadius: 0.1, fill: { color: q[i][3] }, line: { type: "none" }, objectName: "mood-" + q[i][0] });
    txt(s, q[i][0], { x: x + 0.25, y: y + 0.25, w: qw - 0.5, h: 0.45, fontSize: 22, bold: true, color: C.background1 });
    txt(s, q[i][1], { x: x + 0.25, y: y + 0.75, w: qw - 0.5, h: 0.6, fontSize: 14, color: C.background1 });
    txt(s, q[i][2] + " songs", { x: x + 0.25, y: y + qh - 0.6, w: qw - 0.5, h: 0.4, fontSize: 16, bold: true, color: C.background1 });
  }
  txt(s, "↑ energy", { x: M - 0.1, y: 1.85, w: 0.55, h: 0.9, fontSize: 12, ...muted, rotate: 0 });
  txt(s, "happiness (valence) →", { x: qx, y: qy + 2 * qh + 0.35, w: 6.35, h: 0.3, fontSize: 12, align: "center", ...muted });
  const mx = 7.75;
  txt(s, "Automatic", { x: mx, y: 2.0, w: 5, h: 0.4, fontSize: 20, bold: true });
  txt(s, "Trigger song_mood_bi tags each new or edited song from its valence and energy", { x: mx, y: 2.45, w: 5, h: 0.9, fontSize: 16 });
  txt(s, "Editable", { x: mx, y: 3.65, w: 5, h: 0.4, fontSize: 20, bold: true });
  txt(s, "Box limits live in the moods table. Admin changes them → retag_all_songs() re-tags 20,000 songs in one transaction", { x: mx, y: 4.1, w: 5, h: 1.2, fontSize: 16 });
  s.addNotes("Mood model = Russell's circumplex: valence (happiness 0–1) × energy (0–1), split at 0.5. Example: valence 0.9, energy 0.9 → Energetic (test T6).\nclassify_mood(v, e) picks the mood row whose box contains the point. Thresholds are data, not code — CHECK constraints stop an admin from saving min ≥ max.");

  // 13 Vector pipeline
  pres.addSection({ title: "Vector search" });
  s = content("Vector search", "12 · EMBEDDINGS", "How a song becomes a vector");
  const steps = [
    ["LuSlidersHorizontal", "Audio features", "tempo, energy, valence, acousticness …"],
    ["LuPenLine", "Feel description", "“Slow, soft, sad, acoustic. Good for a rainy evening.”"],
    ["LuBrain", "MiniLM model", "all-MiniLM-L6-v2 → 384 numbers"],
    ["LuDatabase", "pgvector", "vector(384) column + HNSW index"],
  ];
  for (let i = 0; i < 4; i++) {
    const x = M + i * 3.1;
    card(s, x, 2.0, 2.75, 3.0, "step-" + i);
    await iconDot(s, x + 0.3, 2.3, steps[i][0]);
    txt(s, steps[i][1], { x: x + 0.3, y: 3.15, w: 2.2, h: 0.45, fontSize: 18, bold: true });
    txt(s, steps[i][2], { x: x + 0.3, y: 3.65, w: 2.25, h: 1.25, fontSize: 14 });
    if (i < 3) s.addImage({ data: await icon("LuArrowRight", HEX.accent1), x: x + 2.8, y: 3.3, w: 0.28, h: 0.28, altText: "then" });
  }
  txt(s, [{ text: "Embedded text  ", options: { bold: true, color: C.accent1 } },
    { text: "title · artists · feel description · mood · genres · album", options: { fontFace: "Courier New", fontSize: 14 } }],
    { x: M, y: 5.45, w: 12.1, h: 0.4, fontSize: 15 });
  txt(s, "The dataset has no lyrics, so the “meaning” of a song is described from how it sounds.", { x: M, y: 5.95, w: 12.1, h: 0.4, fontSize: 15, ...muted });
  s.addNotes("Guideline 8 asks five questions — this slide answers the first three:\n1. What is embedded: a profile text per song — '<title> by <artists>. <description> Mood: <mood>. Genre: <genres>. Album: <album>.' The description is generated from audio features (e.g. energy < 0.35 → 'soft, gentle, low-energy'; valence < 0.3 → 'sad, melancholic'; acousticness > 0.6 → 'acoustic'; plus contexts like 'Good for studying, a rainy evening').\n2. Model: sentence-transformers all-MiniLM-L6-v2, 384 dimensions, mean pooling, L2-normalised. Same model in Python (ETL) and in the app (transformers.js) — verified identical to 6 decimals.\n3. Storage: song_embeddings.text_vec vector(384) and audio_vec vector(8) (8 audio features, tempo/250, centred). User taste: user_profiles.taste_vec / taste_audio / dislike_vec.\nRe-embedding 20,000 songs takes ~7 minutes on CPU (python etl/pipeline.py --reembed, keeps user data).");

  // 14 Retrieval
  s = content("Vector search", "13 · RETRIEVAL", "Closest vectors win");
  txt(s, [{ text: "similarity = 1 − cosine distance", options: { bold: true } }, { text: "     operator  <=>   ·   HNSW index", options: { ...muted } }],
    { x: M, y: 1.75, w: 12.1, h: 0.45, fontSize: 18 });
  const ret = [
    ["Describe a feeling", "semantic_search()", "top 100 by similarity to your sentence → 90% similarity + 10% popularity"],
    ["More like this", "similar_songs()", "(1 − w) · text similarity + w · audio similarity   (w = slider)"],
    ["Made for you", "recommend()", "0.60 taste + 0.15 sound + 0.15 genre + 0.10 popularity − 0.25 dislikes"],
  ];
  for (let i = 0; i < 3; i++) {
    const y = 2.5 + i * 1.3;
    card(s, M, y, 12.1, 1.1, "ret-" + i);
    txt(s, ret[i][0], { x: M + 0.35, y: y + 0.18, w: 3.3, h: 0.4, fontSize: 19, bold: true });
    txt(s, ret[i][1], { x: M + 0.35, y: y + 0.6, w: 3.3, h: 0.35, fontSize: 13, fontFace: "Courier New", color: C.accent1 });
    txt(s, ret[i][2], { x: M + 3.9, y: y + 0.3, w: 7.9, h: 0.6, fontSize: 16, valign: "middle" });
  }
  txt(s, "Heard and disliked songs are filtered out in SQL. Each mood click returns a fresh 20 from the best 60.", { x: M, y: 6.45, w: 12.1, h: 0.4, fontSize: 14, ...muted });
  s.addNotes("Guideline 8, questions 4 and 5:\n4. Metric: cosine distance (<=>); similarity = 1 − distance. Vectors are normalised, so cosine is the natural choice. HNSW indexes use vector_cosine_ops. hnsw.iterative_scan = strict_order keeps scanning when the mood filter removes candidates.\n5. Retrieval: an HNSW shortlist, then exact re-ranking in SQL with JOINs and filters.\nrecommend() details: shortlist = 300 nearest to the taste vector + 150 most popular + 150 random songs in the mood (exploration); score as on the slide; keep top 60, pick 20 at random, show best-first. Cold start (no likes yet): popularity + genre affinity from history.\nTaste vectors are maintained by trigger feedback_taste_aiud → refresh_taste(), using AVG(vector) FILTER (WHERE rating = 1).");

  // 15 Advanced features
  pres.addSection({ title: "Implementation" });
  s = content("Implementation", "14 · ADVANCED FEATURES", "Eight advanced database features in use");
  const adv = [
    ["LuArrowLeftRight", "Transactions", "playlist + songs, re-tag, ETL load"],
    ["LuZap", "Triggers", "mood, taste, Liked songs"],
    ["LuCode", "Stored functions", "recommend, semantic_search …"],
    ["LuEye", "Views", "song details, top moods, popular songs"],
    ["LuGauge", "Indexes", "HNSW, GIN, trigram, B-tree"],
    ["LuSearch", "Full-text search", "tsvector + GIN on title/album"],
    ["LuBarChart3", "Window functions", "RANK(), MAX() OVER ()"],
    ["LuSparkles", "Vector search", "cosine similarity on pgvector"],
  ];
  for (let i = 0; i < 8; i++) {
    const x = M + (i % 4) * 3.07, y = 1.85 + Math.floor(i / 4) * 2.4;
    card(s, x, y, 2.85, 2.15, "adv-" + i);
    await iconDot(s, x + 0.3, y + 0.3, adv[i][0], 0.55, i === 7 ? C.accent2 : C.accent1);
    txt(s, adv[i][1], { x: x + 0.3, y: y + 1.0, w: 2.4, h: 0.4, fontSize: 17, bold: true });
    txt(s, adv[i][2], { x: x + 0.3, y: y + 1.42, w: 2.4, h: 0.65, fontSize: 13, ...muted });
  }
  txt(s, "Guideline asks for 4 SQL + 1 vector — we use 7 + 1", { x: M, y: 6.6, w: 12, h: 0.35, fontSize: 14, bold: true, color: C.accent1 });
  s.addNotes("Transactions: create playlist + insert all songs; add song with SELECT … FOR UPDATE row lock; remove song + renumber positions; admin threshold edit + retag_all_songs(); full ETL load; re-embed.\nTriggers: song_mood_bi (BEFORE INSERT/UPDATE on songs), feedback_taste_aiud (AFTER INSERT/UPDATE/DELETE on feedback).\nFunctions: classify_mood, retag_all_songs, refresh_taste, recommend, semantic_search, similar_songs.\nViews: v_song_details, v_user_top_genres (RANK), v_user_top_moods, v_plays_by_mood_day, v_popular_songs.\nDDL coverage: CREATE (01_schema.sql), ALTER (02_alter.sql), DROP (01_schema.sql). Details in backup slides.");

  // Triggers
  s = content("Implementation", "15 · TRIGGERS", "Four triggers keep the data right automatically");
  const trg = [
    ["LuMusic", "song_mood_bi", "BEFORE INSERT / UPDATE on songs", "Sets the song’s mood from valence + energy, and its full-text search column"],
    ["LuBrain", "feedback_taste_aiud", "AFTER INSERT / UPDATE / DELETE on feedback", "Recomputes the user’s taste vectors → recommendations change instantly"],
    ["LuHeart", "feedback_liked_playlist_aiud", "AFTER INSERT / UPDATE / DELETE on feedback", "♥ adds the song to “Liked songs”; un-like or dislike removes it and renumbers"],
    ["LuUserPlus", "users_liked_playlist_ai", "AFTER INSERT on users", "Every new account gets its own “♥ Liked songs” playlist"],
  ];
  for (let i = 0; i < 4; i++) {
    const x = M + (i % 2) * 6.15, y = 1.75 + Math.floor(i / 2) * 2.45;
    card(s, x, y, 5.95, 2.2, "trigger-" + i);
    await iconDot(s, x + 0.35, y + 0.35, trg[i][0], 0.62, i % 2 ? C.accent2 : C.accent1);
    txt(s, trg[i][1], { x: x + 1.2, y: y + 0.3, w: 4.6, h: 0.4, fontSize: 17, bold: true, fontFace: "Courier New" });
    txt(s, trg[i][2], { x: x + 1.2, y: y + 0.72, w: 4.6, h: 0.35, fontSize: 13, ...muted });
    txt(s, trg[i][3], { x: x + 1.2, y: y + 1.2, w: 4.55, h: 0.85, fontSize: 15 });
  }
  txt(s, "They fire whoever changes the data — the app, the ETL, or someone typing SQL", { x: M, y: 6.72, w: 12.1, h: 0.3, fontSize: 14, ...muted });
  s.addNotes("All four triggers are in db/03_features.sql, all FOR EACH ROW.\n1) song_mood_bi — BEFORE INSERT OR UPDATE OF valence, energy, title, album_name ON songs -> trg_song_mood() sets NEW.mood_id := classify_mood(NEW.valence, NEW.energy) and rebuilds NEW.search_tsv. Tagged all 20,000 songs during the bulk load. Test T6.\n2) feedback_taste_aiud — AFTER INSERT/UPDATE/DELETE ON feedback -> refresh_taste(user): taste_vec, taste_audio, dislike_vec via AVG(vector) FILTER. Test T8.\n3) feedback_liked_playlist_aiud — AFTER INSERT/UPDATE/DELETE ON feedback -> like (rating 1) appends the song to the user's '♥ Liked songs' playlist (INSERT … ON CONFLICT DO NOTHING); un-like or switching to dislike deletes it and shifts later positions down so they stay 1..n. Test T11.\n4) users_liked_playlist_ai — AFTER INSERT ON users -> liked_playlist_id(user) creates the playlist. A partial unique index (uq_one_liked_playlist ON playlists(user_id) WHERE is_liked) guarantees at most one per user. Test T10.\nThe feedback triggers skip work when the user row is being deleted (cascade), so deleting a user never fails.\nBEFORE vs AFTER: BEFORE can change the row being written (NEW.mood_id); AFTER runs once the row is saved and changes other tables.\nLive demo: Admin -> Database explorer -> playlist_songs; press ♥ as ishika in another window and a row appears.");

  // 16 Key queries
  s = content("Implementation", "16 · KEY QUERIES", "One SQL query, one vector query");
  txt(s, "Top genres for a user (dashboard)", { x: M, y: 1.75, w: 5.9, h: 0.4, fontSize: 16, bold: true });
  code(s, ["SELECT g.name, COUNT(*) AS plays", "FROM listening_events le", "JOIN song_genres sg USING (song_id)", "JOIN genres g USING (genre_id)", "WHERE le.user_id = $1", "GROUP BY g.name", "HAVING COUNT(*) >= 3", "ORDER BY plays DESC", "LIMIT 5;"], M, 2.2, 5.9, 3.95);
  txt(s, "Songs closest to a sentence", { x: M + 6.2, y: 1.75, w: 5.9, h: 0.4, fontSize: 16, bold: true });
  code(s, ["SELECT s.title,", "       1 - (e.text_vec <=> $1) AS sim", "FROM song_embeddings e", "JOIN songs s USING (song_id)", "WHERE s.mood_id = $2", "ORDER BY e.text_vec <=> $1", "LIMIT 20;", "", "-- uses idx_emb_text_hnsw"], M + 6.2, 2.2, 5.9, 3.95);
  txt(s, "JOIN · GROUP BY · HAVING · ORDER BY · aggregates — and vector distance in the same SQL", { x: M, y: 6.4, w: 12.1, h: 0.4, fontSize: 14, ...muted });
  s.addNotes("Other important queries (backup slides / documentation §10): keyword search with a UNION subquery over full-text and trigram artist match; taste profile with AVG(vector) FILTER; genre affinity with COUNT / MAX(COUNT) OVER (); most-played songs with a correlated subquery; INSERT … ON CONFLICT upsert for ratings; INSERT … SELECT MAX(position)+1 to append to a playlist.\nDML in the app: INSERT (signup, play, feedback, playlists), UPDATE (rename playlist, change role, thresholds, re-tag), DELETE (playlist, song from playlist, user, clear rating), SELECT everywhere.");

  // 17 Security & roles
  s = content("Implementation", "17 · SECURITY & ROLES", "Two roles, secrets out of the code");
  const roles = [["LuUser", "Listener", ["Discover, search, rate, play", "Playlists and own dashboard"]],
                 ["LuSettings", "Admin", ["Analytics and most-played songs", "Mood thresholds, users, catalogue import"]]];
  for (let i = 0; i < 2; i++) {
    const y = 1.9 + i * 2.35;
    card(s, M, y, 5.6, 2.1, "role-" + i);
    await iconDot(s, M + 0.35, y + 0.35, roles[i][0], 0.62, i ? C.accent2 : C.accent1);
    txt(s, roles[i][1], { x: M + 1.2, y: y + 0.42, w: 4, h: 0.45, fontSize: 20, bold: true });
    txt(s, bl(roles[i][2]), { x: M + 1.2, y: y + 0.95, w: 4.2, h: 1.0, fontSize: 15, paraSpaceAfter: 4 });
  }
  const sec = ["Passwords stored as bcrypt hashes", "Login session in an httpOnly signed cookie (JWT)", "Admin pages and APIs blocked for listeners", "Every query parameterised — no SQL injection",
    "Database URL and secret only in .env.local", "Login rate-limited against password guessing"];
  for (let i = 0; i < sec.length; i++) {
    const y = 1.95 + i * 0.75;
    s.addImage({ data: await icon("LuShieldCheck", HEX.accent1), x: 6.85, y: y + 0.03, w: 0.38, h: 0.38, altText: "secure" });
    txt(s, sec[i], { x: 7.45, y, w: 5.3, h: 0.5, fontSize: 16, valign: "middle" });
  }
  s.addNotes("Guidelines 10, 11, 13. Auth: bcrypt (cost 10), JWT signed with JWT_SECRET (HS256, 7 days) in an httpOnly SameSite=Lax cookie. middleware.js redirects anonymous users to /login and listeners away from /admin; every admin API is wrapped in guard({ admin: true }) → 403 'Admins only'. There is no hard-coded fallback secret — the app refuses to sign tokens without JWT_SECRET. Login is rate-limited: 5 failed attempts per account / 100 per IP per 15 minutes. Role is enforced by a CHECK constraint (listener | admin).");

  // 18 Screens
  pres.addSection({ title: "Results" });
  s = content("Results", "18 · THE APP", "What users see");
  const grid = [["03_discover_recommended.png", "Personal recommendations"], ["07_song_detail_similar.png", "Songs that feel like this"],
                ["09_playlists.png", "Playlists"], ["12_admin_console.png", "Admin console"]];
  for (let i = 0; i < 4; i++) {
    const gw = 5.4, gh = 2.35, x = M + 0.45 + (i % 2) * (gw + 0.4), y = 1.7 + Math.floor(i / 2) * (gh + 0.55);
    const gi = await img(shots(grid[i][0]), 840);
    const gf = fit(gi, x, y, gw, gh);
    s.addImage({ data: gi.data, ...gf, altText: grid[i][1] });
    txt(s, grid[i][1], { x, y: y + gh + 0.07, w: gw, h: 0.35, fontSize: 13, align: "center", ...muted });
  }
  s.addNotes("All 12 screenshots are in the screenshots/ folder and in the documentation §12: login, sign-up validation, discover, natural-language search, save as playlist, mood filter, song detail, keyword search, playlists, dashboard, admin blocked for listener, admin console. Best to show these live.");

  // 19 Testing
  s = content("Results", "19 · TESTING", "Tested in the database and through the API");
  const stats = [["11 / 11", "database integrity and trigger tests pass"], ["15 / 15", "API and browser tests pass"], ["7 ms", "nearest 10 of 20,000 songs (HNSW)"], ["3 ms", "full-text search for “love”"]];
  for (let i = 0; i < 4; i++) {
    const x = M + i * 3.07;
    txt(s, stats[i][0], { x, y: 2.0, w: 2.9, h: 1.1, fontSize: 54, bold: true, color: i < 2 ? C.accent1 : C.accent2, fontFace: "Arial" });
    txt(s, stats[i][1], { x, y: 3.15, w: 2.7, h: 0.8, fontSize: 16 });
  }
  txt(s, bl(["Bad rating, duplicate email, missing song, bad mood range, blank playlist name — all rejected by the database",
    "Cascade delete, auto mood tag, taste and Liked-songs triggers, and vector search verified",
    "Listener blocked from admin APIs (403); bad input gets clean 400 errors"]), { x: M, y: 4.45, w: 12.1, h: 2.0, fontSize: 16, paraSpaceAfter: 10 });
  s.addNotes("DB tests are in db/04_tests.sql (output saved in docs/test_results.txt): T1 rating 5 rejected · T2 duplicate email · T3 FK to missing song · T4 playlist delete cascades (3 → 0) · T5 mood min ≥ max · T6 trigger tags Energetic · T7 blank playlist name (ALTER CHECK) · T8 dislike fills dislike_vec · T9 semantic_search returns the song itself first (similarity 1.000).\nPerformance from EXPLAIN ANALYZE: Index Scan using idx_emb_text_hnsw 7.3 ms; Bitmap Index Scan on idx_songs_tsv 3.1 ms. Natural-language search: ~4 s first time (model loads), then 36–65 ms.");

  // 20 Guideline compliance
  s = content("Results", "20 · GUIDELINES", "Every requirement, mapped");
  const gl = [["SQL + vector database", "PostgreSQL + pgvector"], ["ER → relational schema", "13 tables, 3NF"], ["CREATE · ALTER · DROP", "01_schema, 02_alter"],
    ["INSERT · UPDATE · DELETE · SELECT", "API routes"], ["JOIN, GROUP BY, HAVING, subqueries", "dashboard, search, views"], ["4 advanced SQL + 1 vector", "7 + 1"],
    ["Embeddings explained", "data, model, storage, metric, retrieval"], ["Next.js + API layer", "pages + /api/*"], ["Env vars, no hard-coded secrets", ".env.local"],
    ["Auth, ≥ 2 roles", "listener, admin"], ["DB-level validation", "CHECK, UNIQUE, FK, triggers"], ["Documentation · README · Git", "docs/, README.md"]];
  for (let i = 0; i < gl.length; i++) {
    const col = Math.floor(i / 6), r = i % 6, x = M + col * 6.15, y = 1.8 + r * 0.82;
    s.addImage({ data: await icon("LuCheckCircle2", HEX.accent3), x, y: y + 0.08, w: 0.38, h: 0.38, altText: "met" });
    txt(s, gl[i][0], { x: x + 0.55, y, w: 5.4, h: 0.35, fontSize: 16, bold: true });
    txt(s, gl[i][1], { x: x + 0.55, y: y + 0.36, w: 5.4, h: 0.32, fontSize: 13, ...muted });
  }
  s.addNotes("Full 18-point checklist is Appendix A of docs/DOCUMENTATION.md. Git: the project is its own repository (branch main) with .gitignore for node_modules, the database folder, .env.local and the Kaggle CSV; each member commits their own work.");

  // 21 Conclusion
  s = content("Results", "21 · CONCLUSION", "SQL keeps it correct, vectors make it smart");
  txt(s, "PostgreSQL enforces who, what and when. pgvector, in the same database, finds what feels alike — so one stored function can combine both.",
    { x: M, y: 1.9, w: 5.6, h: 2.2, fontSize: 20 });
  txt(s, "Next steps", { x: 7.0, y: 1.9, w: 5.7, h: 0.45, fontSize: 20, bold: true, color: C.accent1 });
  const next = [["LuFileText", "Lyrics embeddings for true lyrical themes"], ["LuSmilePlus", "More moods: romantic, nostalgic, focused"], ["LuUsers", "“Listeners like you also liked”"],
                ["LuTrendingUp", "Learn ranking weights from feedback"], ["LuPlayCircle", "Audio previews via Spotify"]];
  for (let i = 0; i < next.length; i++) {
    const y = 2.55 + i * 0.75;
    s.addImage({ data: await icon(next[i][0], HEX.accent1), x: 7.0, y: y + 0.04, w: 0.38, h: 0.38, altText: next[i][1] });
    txt(s, next[i][1], { x: 7.6, y, w: 5.2, h: 0.5, fontSize: 16, valign: "middle" });
  }
  s.addNotes("Takeaway: the database is not just storage here — the recommendation logic itself (vector search + joins + aggregates + window functions) runs inside PostgreSQL as stored functions, triggered and transactional.\nFuture: licensed lyrics API; extra moods using instrumentalness/acousticness; collaborative filtering from listening_events; learning the weights from like/dislike data; partitioning listening_events by month and materialised views for analytics at scale.");

  // 22 Thanks
  s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "Results" });
  s.addText("Thank you", { placeholder: "title" });
  s.addText("Questions?", { placeholder: "body" });
  s.addImage({ data: await icon("LuHeadphones", HEX.accent1), x: M, y: 1.15, w: 0.9, h: 0.9, altText: "Sound wave" });
  txt(s, "Demo: ishika@demo.com · admin@demo.com  (password123)", { x: M, y: 6.55, w: 9, h: 0.35, color: C.background2, fontSize: 13 });
  s.addNotes("Backup slides follow for detailed questions: data dictionary, triggers & functions, transactions, indexes with EXPLAIN evidence, recommendation scoring, test tables, normalisation, contributions, how to run.");

  // ================= BACKUP =================
  pres.addSection({ title: "Backup (Q&A)" });
  s = pres.addSlide({ masterName: "SECTION_DARK", sectionTitle: "Backup (Q&A)" });
  s.addText("Backup", { placeholder: "title" });
  s.addText("Details for questions — schema, functions, indexes, tests", { placeholder: "body" });

  s = content("Backup (Q&A)", "BACKUP · SQL CHOICE", "Why PostgreSQL, not MySQL");
  table(s, [
    ["Need in MoodTune", "PostgreSQL 18", "MySQL 8.0 (installed here)"],
    ["Vector column + nearest-neighbour index", "pgvector: vector(384), HNSW", "No vector type or vector index"],
    ["Full-text search", "tsvector + GIN index", "FULLTEXT index (InnoDB)"],
    ["Fuzzy artist search", "pg_trgm trigram GIN index", "No trigram index"],
    ["Functions that return ranked tables", "PL/pgSQL RETURNS TABLE", "Procedures, no table-valued functions"],
    ["Averages of vectors, FILTER", "AVG(vector) FILTER (WHERE …)", "Not available"],
    ["Guideline", "MySQL or PostgreSQL — either is allowed", ""],
  ], { x: M, y: 1.8, w: 12.1, colW: [4.2, 4.1, 3.8], fontSize: 15, rowH: 0.55 });
  txt(s, "MySQL runs on this laptop for our lab work only — MoodTune keeps nothing in it.", { x: M, y: 6.0, w: 12.1, h: 0.45, fontSize: 16, bold: true, color: C.accent1 });
  s.addNotes("The deciding reason is pgvector: our core feature is vector similarity search, and keeping vectors in the same database as the relational data lets one stored function join, filter and rank by similarity in one transaction. MySQL 8.0 has no vector column type and no ANN index (MySQL 9 added a VECTOR type, but the community edition still has no vector index). Everything — tables and vectors — is in the PostgreSQL database 'moodmusic'.");

  for (const [file, title, note] of [
    ["chen_er_song.png", "SONG — all attributes (Chen)", "audio_features is a composite attribute (8 sub-attributes); search_tsv is derived — computed by the song_mood_bi trigger from title and album, so it is drawn dashed. mood is not an attribute of SONG: it comes from the TAGGED relationship (foreign key mood_id)."],
    ["chen_er_users.png", "Users, playlists, relationship attributes (Chen)", "USER_PROFILE is a weak entity (identified by its USER). Relationship attributes: RATES(rating, rated_at) -> feedback; PLAYS(event_id, played_at, ms_played) -> listening_events; CONTAINS(position) -> playlist_songs. password_hash stores a bcrypt hash, never the password."],
    ["chen_er_catalogue.png", "Moods, artists, genres, embeddings (Chen)", "MOOD stores its own box limits, so admins can change thresholds as data. SONG_EMBEDDING is weak: song_id is both its key and the owning song's key (1:1 identifying relationship EMBEDDED_AS)."],
  ]) {
    s = content("Backup (Q&A)", "BACKUP · ER DETAIL", title);
    const ci = await img(path.join(P, "docs/images", file));
    s.addImage({ data: ci.data, ...fit(ci, M, 1.6, 12.1, 5.3), altText: title });
    s.addNotes(note);
  }
  s = content("Backup (Q&A)", "BACKUP · ER DETAIL", "Same model as tables (crow’s foot, every column)");
  const ri = await img(path.join(P, "docs/images/er_diagram.png"));
  s.addImage({ data: ri.data, ...fit(ri, M, 1.6, 12.1, 5.3), altText: "Relational ER diagram with all columns" });
  s.addNotes("The Chen model after mapping to tables: each M:N relationship became a junction table (song_artists, song_genres, playlist_songs, feedback), PLAYS became listening_events, 1:N relationships became foreign keys. 13 tables in total.");

  s = content("Backup (Q&A)", "BACKUP · DATA DICTIONARY", "users, songs, moods");
  table(s, [
    ["Table", "Key columns", "Constraints"],
    ["users", "user_id, username, email, password_hash, role, created_at", "PK; UNIQUE username, email; role CHECK IN (listener, admin)"],
    ["moods", "mood_id, name, valence_min/max, energy_min/max", "UNIQUE name; CHECK min < max, all within 0–1"],
    ["songs", "song_id, spotify_id, title, album_name, duration_ms, popularity, explicit", "UNIQUE spotify_id; duration > 0; popularity 0–100"],
    ["songs (audio)", "valence, energy, danceability, acousticness, instrumentalness, speechiness, liveness, tempo", "NOT NULL valence, energy; all CHECK 0–1; tempo ≥ 0"],
    ["songs (derived)", "mood_id, search_tsv, description", "FK → moods SET NULL; tsvector GIN; description via ALTER"],
    ["artists / genres", "artist_id / genre_id, name", "UNIQUE name; trigram GIN on artist name"],
  ], { x: M, y: 1.8, w: 12.1, colW: [2.0, 5.6, 4.5], fontSize: 13 });

  s = content("Backup (Q&A)", "BACKUP · DATA DICTIONARY", "Activity and vector tables");
  table(s, [
    ["Table", "Key columns", "Constraints"],
    ["song_artists / song_genres", "song_id, artist_id / genre_id", "Composite PK; FKs ON DELETE CASCADE"],
    ["listening_events", "event_id, user_id, song_id, played_at, ms_played, context_mood_id", "FKs; ms_played ≥ 0; index (user_id, played_at DESC)"],
    ["feedback", "user_id, song_id, rating, rated_at", "PK (user_id, song_id); rating CHECK IN (−1, 1)"],
    ["playlists", "playlist_id, user_id, name, mood_id, created_at", "UNIQUE (user_id, name); name not blank (ALTER)"],
    ["playlist_songs", "playlist_id, song_id, position", "PK (playlist_id, song_id); UNIQUE (playlist_id, position); position > 0"],
    ["song_embeddings", "song_id, text_vec vector(384), audio_vec vector(8), model", "PK/FK → songs; HNSW cosine indexes"],
    ["user_profiles", "user_id, taste_vec(384), taste_audio(8), dislike_vec(384)", "PK/FK → users; maintained by trigger"],
  ], { x: M, y: 1.8, w: 12.1, colW: [2.6, 5.2, 4.3], fontSize: 13 });

  s = content("Backup (Q&A)", "BACKUP · LOGIC IN THE DATABASE", "Triggers, functions and views");
  table(s, [
    ["Object", "Type", "What it does"],
    ["song_mood_bi", "Trigger (BEFORE INSERT/UPDATE)", "Sets mood_id from valence/energy, rebuilds search_tsv"],
    ["feedback_taste_aiud", "Trigger (AFTER I/U/D)", "Calls refresh_taste() → taste, sound and dislike vectors"],
    ["feedback_liked_playlist_aiud · users_liked_playlist_ai", "Triggers (AFTER)", "Keep each user’s “♥ Liked songs” playlist in sync"],
    ["classify_mood · retag_all_songs", "Functions", "Find the mood box · re-tag every song after a threshold edit"],
    ["recommend", "Function", "Personal ranking (taste, sound, genre, popularity, dislikes)"],
    ["semantic_search · similar_songs", "Functions", "Sentence search · “more like this” (text + audio blend)"],
    ["v_song_details · v_popular_songs", "Views", "Song + artists + genres · most-played with listeners and likes"],
    ["v_user_top_genres · v_user_top_moods · v_plays_by_mood_day", "Views", "RANK() per user · dashboard · admin daily chart"],
  ], { x: M, y: 1.8, w: 12.1, colW: [4.2, 3.0, 4.9], fontSize: 13 });

  s = content("Backup (Q&A)", "BACKUP · TRANSACTIONS", "Where all-or-nothing matters");
  table(s, [
    ["Operation", "How", "Guarantee"],
    ["Create playlist with songs", "BEGIN … INSERT playlist, INSERT songs … COMMIT", "Never a half-filled playlist"],
    ["Add song to playlist", "SELECT … FOR UPDATE on the playlist row", "Concurrent adds get distinct positions"],
    ["Remove song from playlist", "DELETE, then renumber positions", "Positions stay 1…n, UNIQUE never broken"],
    ["Edit mood thresholds", "UPDATE moods + retag_all_songs()", "Thresholds and song tags always agree"],
    ["Load / re-embed catalogue", "TRUNCATE, COPY, rebuild HNSW, COMMIT", "20,000 songs and vectors all-or-nothing"],
  ], { x: M, y: 1.8, w: 12.1, colW: [3.2, 5.0, 3.9], fontSize: 14 });
  txt(s, "Any error → ROLLBACK (helper tx() in web/lib/db.js)", { x: M, y: 5.6, w: 12.1, h: 0.4, fontSize: 15, ...muted });

  s = content("Backup (Q&A)", "BACKUP · INDEXES", "Indexes, with proof they are used");
  table(s, [
    ["Index", "Type", "Used for"],
    ["idx_emb_text_hnsw", "HNSW (cosine) on text_vec", "Sentence search, taste ranking"],
    ["idx_emb_audio_hnsw", "HNSW (cosine) on audio_vec", "“Sounds like” shortlist"],
    ["idx_songs_tsv", "GIN on search_tsv", "Full-text search"],
    ["idx_artists_trgm", "GIN trigram on artists.name", "Fuzzy artist search (ILIKE)"],
    ["idx_le_user · idx_le_song", "B-tree", "History, dashboard, popular songs"],
    ["idx_songs_mood", "B-tree", "Mood filter and counts"],
  ], { x: M, y: 1.8, w: 7.3, colW: [2.5, 2.6, 2.2], fontSize: 13 });
  code(s, ["EXPLAIN ANALYZE … ORDER BY", "  text_vec <=> q LIMIT 10", "", "Index Scan using", "  idx_emb_text_hnsw", "Execution Time: 7.3 ms", "", "Bitmap Index Scan on", "  idx_songs_tsv", "Execution Time: 3.1 ms"], 8.3, 1.8, 4.4, 4.6);

  s = content("Backup (Q&A)", "BACKUP · RECOMMENDATION", "How recommend() ranks songs");
  const rs = [["1  Shortlist", "300 nearest to your taste (HNSW) + 150 popular + 150 random in the mood"],
              ["2  Filter", "Drop songs you already played or rated"],
              ["3  Score", "0.60 taste + 0.15 sound + 0.15 genre affinity + 0.10 popularity − 0.25 like-your-dislikes"],
              ["4  Variety", "Keep best 60, pick 20 at random, show best first"],
              ["New user", "No likes yet → popularity + genres from listening history"]];
  for (let i = 0; i < rs.length; i++) {
    const y = 1.85 + i * 0.95;
    card(s, M, y, 12.1, 0.8, "rec-" + i);
    txt(s, rs[i][0], { x: M + 0.3, y: y + 0.2, w: 2.3, h: 0.4, fontSize: 17, bold: true, color: i === 4 ? C.accent2 : C.accent1 });
    txt(s, rs[i][1], { x: M + 2.7, y: y + 0.2, w: 9.2, h: 0.45, fontSize: 16 });
  }
  s.addNotes("Taste vector = AVG(text_vec) of liked songs; sound taste = AVG(audio_vec) of liked songs; dislike vector = AVG(text_vec) of disliked songs — all updated by a trigger on every like/dislike. Genre affinity = plays+likes per genre ÷ the user's top genre count (window function MAX(COUNT(*)) OVER ()). Verified: disliking the top recommendation lowered similar songs' scores by about 0.013.");

  s = content("Backup (Q&A)", "BACKUP · DATABASE TESTS", "db/04_tests.sql — all pass");
  table(s, [
    ["Test", "What we try", "Result"],
    ["T1", "Insert a rating of 5", "Rejected — feedback_rating_check"],
    ["T2", "Two users with the same email", "Rejected — users_email_key"],
    ["T3", "Play of song −999", "Rejected — foreign key"],
    ["T4", "Delete a playlist with 3 songs", "Cascade: 3 → 0"],
    ["T5", "Mood with min 0.8, max 0.2", "Rejected — moods_check"],
    ["T6", "Insert song with valence 0.9, energy 0.9", "Trigger tags it Energetic"],
    ["T7", "Playlist named “   ”", "Rejected — playlists_name_not_blank"],
    ["T8", "A new user dislikes a song", "dislike_vec filled by trigger"],
    ["T9", "Search with a song’s own vector", "That song first, similarity 1.000"],
    ["T10", "Create a new account", "“♥ Liked songs” playlist created by trigger"],
    ["T11", "Like 3 songs, then dislike the first", "Playlist {1,2,3} → {2,3}, positions 1, 2"],
  ], { x: M, y: 1.7, w: 12.1, colW: [0.9, 5.4, 5.8], fontSize: 12, rowH: 0.4 });

  s = content("Backup (Q&A)", "BACKUP · API TESTS", "Through the running app");
  table(s, [
    ["Request", "Expected", "Result"],
    ["Search “sad songs about missing someone”", "Sad “miss you” songs", "I Miss You, Missing Peace …"],
    ["Search with empty text", "400", "“Describe what you want to hear”"],
    ["Dislike the top recommendation", "Similar songs drop", "Scores fall ≈ 0.013"],
    ["New user with no history", "Popular songs (cold start)", "Pass"],
    ["Remove song 2 of 4 from a playlist", "Positions 1, 2, 3", "Pass"],
    ["Listener calls admin analytics", "403", "“Admins only”"],
    ["Admin sets role “superuser”", "400 (CHECK)", "“Value out of allowed range”"],
    ["Malformed JSON / songId “abc”", "400", "Pass"],
    ["Click Calm twice, then Shuffle", "Different songs each time", "Pass"],
  ], { x: M, y: 1.75, w: 12.1, colW: [5.0, 3.4, 3.7], fontSize: 13, rowH: 0.44 });

  s = content("Backup (Q&A)", "BACKUP · NORMALISATION", "Relationships and normal form");
  table(s, [
    ["Relationship", "Cardinality", "Implemented by"],
    ["Song – Artist", "M : N", "song_artists (composite PK)"],
    ["Song – Genre", "M : N", "song_genres (composite PK)"],
    ["Playlist – Song", "M : N, ordered", "playlist_songs + position"],
    ["User – Song (rating)", "M : N, one per pair", "feedback PK (user_id, song_id)"],
    ["User – Listening event · Playlist", "1 : N", "FK user_id, ON DELETE CASCADE"],
    ["Mood – Song", "1 : N, optional", "FK mood_id, ON DELETE SET NULL"],
    ["Song – Embedding · User – Profile", "1 : 1", "PK = FK"],
  ], { x: M, y: 1.8, w: 12.1, colW: [4.4, 3.0, 4.7], fontSize: 14 });
  txt(s, "3NF / BCNF: no repeating groups, no partial or transitive dependencies; derived columns kept by trigger.", { x: M, y: 6.0, w: 12.1, h: 0.45, fontSize: 15, ...muted });

  s = content("Backup (Q&A)", "BACKUP · TEAM", "Individual contribution");
  for (let i = 0; i < 2; i++) {
    const x = M + i * 6.15;
    card(s, x, 1.9, 5.95, 4.3, "member-" + i);
    await iconDot(s, x + 0.35, 2.2, "LuUser", 0.62, i ? C.accent2 : C.accent1);
    txt(s, i ? "Ishika Jain" : "Arham Mayur Burad", { x: x + 1.2, y: 2.25, w: 4.5, h: 0.4, fontSize: 20, bold: true });
    txt(s, i ? "PES2UG24AM067" : "PES2UG24AM025", { x: x + 1.2, y: 2.65, w: 4.5, h: 0.35, fontSize: 14, ...muted });
    txt(s, [{ text: "Database: ", options: { bold: true } }, { text: "[fill in]", options: { breakLine: true } }, { text: "Application: ", options: { bold: true } }, { text: "[fill in]" }],
      { x: x + 0.35, y: 3.5, w: 5.2, h: 2.3, fontSize: 16, paraSpaceAfter: 10 });
  }
  s.addNotes("Fill in before presenting — guideline 2 requires each member to contribute to both database and application work.");

  s = content("Backup (Q&A)", "BACKUP · HOW TO RUN", "Run it from scratch");
  code(s, [
    "# 1. database (PostgreSQL 16+ with pgvector)",
    "psql -d moodmusic -f db/01_schema.sql -f db/02_alter.sql -f db/03_features.sql",
    "",
    "# 2. secrets",
    "cp web/.env.example web/.env.local     # DATABASE_URL, JWT_SECRET",
    "",
    "# 3. data + embeddings",
    "python etl/pipeline.py data/dataset.csv --limit 20000",
    "python etl/seed_demo.py",
    "",
    "# 4. app                                   → http://localhost:3000",
    "cd web && npm install && npm run build && npm run start",
    "",
    "# 5. tests",
    "psql -d moodmusic -f db/04_tests.sql",
  ], M, 1.8, 12.1, 4.9);

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
