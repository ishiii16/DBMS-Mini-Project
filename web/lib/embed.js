// Query-side embedding for natural-language search.
// Uses the SAME model as etl/pipeline.py (all-MiniLM-L6-v2, mean pooling, L2-normalised, 384-d),
// so a sentence typed by the user lives in the same vector space as the song descriptions.
import { pipeline } from "@huggingface/transformers";

let extractor = globalThis._mmEmbed; // load the model once per server process (~4 s), reuse afterwards
export async function embed(text) {
  if (!extractor) extractor = globalThis._mmEmbed = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "fp32" });
  const out = await (await extractor)([text], { pooling: "mean", normalize: true });
  return `[${Array.from(out.data).join(",")}]`; // pgvector text format
}
