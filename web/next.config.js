module.exports = {
  // separate build folder when needed (e.g. a test copy next to a running production server)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: { serverComponentsExternalPackages: ["pg", "bcryptjs", "@huggingface/transformers", "onnxruntime-node", "sharp"] },
};
