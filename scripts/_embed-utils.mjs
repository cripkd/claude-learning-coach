/**
 * _embed-utils.mjs — shared embedding utilities for build-embeddings.mjs and retrieve.mjs.
 *
 * Both scripts must use identical pipeline options (pooling: 'mean', normalize: true)
 * so that stored vectors and query vectors are cosine-comparable.
 *
 * Prefixed with _ so the source-file walker in build-embeddings.mjs skips this file.
 */

import { join } from 'node:path';
import { CACHE_ROOT } from './_roots.mjs';

export const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';
// Derived data: safe to delete, regenerates on next run. Lives outside DATA_ROOT
// in a packaged build so clearing it never touches the student's courses.
export const CACHE_DIR     = join(CACHE_ROOT, 'transformers');

export async function tryImportTransformers() {
  try { return await import('@huggingface/transformers'); }
  catch { return null; }
}

export async function initPipeline(transformers, modelName) {
  const { pipeline, env } = transformers;
  env.cacheDir = CACHE_DIR;
  const embedder = await pipeline('feature-extraction', modelName, { device: 'cpu' });
  env.allowRemoteModels = false; // offline after first load
  return embedder;
}

// Handles @huggingface/transformers v2 and v3 output shapes after mean pooling
export function extractVector(output) {
  if (output?.data instanceof Float32Array) return Array.from(output.data);
  if (Array.isArray(output?.data))          return output.data;
  if (typeof output?.tolist === 'function') {
    const list = output.tolist();
    return Array.isArray(list[0]) ? list[0] : list;
  }
  if (output?.[0]?.data) return Array.from(output[0].data);
  throw new Error('cannot extract vector from pipeline output — unexpected shape');
}

// embedText uses the identical pooling+normalize as build-embeddings.mjs
// so stored vectors and query vectors are cosine-comparable via dot product.
export async function embedText(embedder, text) {
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return extractVector(output);
}
