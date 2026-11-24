"use client";
import Link from "next/link";
import { Cover, Meter, Empty } from "./ui";
import SongActions, { useLibrary } from "./SongActions";

// Reusable song list: play, like/dislike, add to playlist (or a new one), "more like this"
export default function SongTable({ songs, moodId, showSim = true, emptyText = "No songs found.", lib: shared }) {
  const own = useLibrary(!shared); // skip fetching when the page already shares its library
  const lib = shared || own;
  if (!songs?.length) return <Empty icon="🔎">{emptyText}</Empty>;
  const cls = `song ${showSim ? "" : "nosim"}`;
  return (
    <div className="songs">
      <div className={`${cls} head`}><span className="n">#</span><span /><span>Title</span><span>Mood</span>{showSim && <span>Similarity</span>}<span /></div>
      {songs.map((s, i) => (
        <div className={cls} key={s.song_id}>
          <span className="n">{i + 1}</span>
          <Cover title={s.title} mood={s.mood} />
          <div className="t">
            <Link href={`/song/${s.song_id}`} title={s.title}>{s.title}</Link>
            <div className="a" title={s.artists}>{s.artists}</div>
          </div>
          <span className="md">{s.mood && <span className={`tag ${s.mood}`}>{s.mood}</span>}</span>
          {showSim && <Meter value={s.similarity} />}
          <SongActions song={s} lib={lib} moodId={moodId} />
        </div>))}
    </div>);
}
