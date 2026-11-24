import { spawn } from "child_process";
import path from "path";
import { guard, json } from "@/lib/auth";
// Admin: import/clean catalog and regenerate embeddings by running the Python pipeline
export const POST = guard(async (req) => {
  const { limit } = await req.json().catch(() => ({}));
  const root = path.resolve(process.cwd(), "..");
  const csv = path.resolve(process.cwd(), process.env.CATALOG_CSV || "../data/dataset.csv");
  const args = [path.join(root, "etl/pipeline.py"), csv, ...(limit ? ["--limit", String(+limit)] : [])];
  const out = await new Promise((resolve) => {
    let log = "";
    const p = spawn(process.env.PYTHON_BIN || "python3", args, { env: process.env });
    p.stdout.on("data", (d) => (log += d)); p.stderr.on("data", (d) => (log += d));
    p.on("close", (code) => resolve({ code, log: log.slice(-4000) }));
  });
  return json(out, out.code === 0 ? 200 : 500);
}, { admin: true });
