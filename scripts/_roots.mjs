/**
 * _roots.mjs — the three filesystem roots, resolved in one place.
 *
 * A repo checkout collapses all three onto the checkout itself, so running from
 * source behaves exactly as before. A packaged desktop build can't: its resources
 * live inside a read-only (and code-signed) app bundle, so the Electron wrapper
 * passes COACH_DATA_ROOT / COACH_CACHE_ROOT pointing at writable locations and
 * only BUNDLE_ROOT stays inside the bundle.
 *
 *   BUNDLE_ROOT  read-only   code, templates/, starter-files/ — replaced wholesale on update
 *   DATA_ROOT    writable    courses/ — the student's work; never auto-deleted
 *   CACHE_ROOT   disposable  embedding model cache; safe to delete, regenerates
 *
 * Keeping these apart is what makes the data survive an app update, and what lets
 * a support answer be "delete the cache" without meaning "lose your progress".
 *
 * Prefixed with _ so the source-file walker in build-embeddings.mjs skips it.
 */

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const BUNDLE_ROOT   = resolve(__dirname, '..');
export const DATA_ROOT     = process.env.COACH_DATA_ROOT  || BUNDLE_ROOT;
export const CACHE_ROOT    = process.env.COACH_CACHE_ROOT || join(DATA_ROOT, '.cache');

export const COURSES_DIR   = join(DATA_ROOT, 'courses');
export const TEMPLATES_DIR = join(BUNDLE_ROOT, 'templates');
