/**
 * Self-check for the blocked-download retry rotation. Run: node scripts/check_retry_rotation.mjs
 *
 * Mirrors the argv shapes ytdlp.ts builds. What matters is the *identity*
 * result: finalize() only respawns when rotation actually changed something,
 * so returning the same array reference is how "don't retry" is signalled.
 */
import assert from "node:assert/strict";

const RETRY_IMPERSONATE_TARGET = "safari";
const YT_CLIENT_RETRY = "mweb,web";

function rotateImpersonation(argv) {
  const i = argv.indexOf("--impersonate");
  if (i === -1 || i + 1 >= argv.length) return argv;
  const next = [...argv];
  next[i + 1] = RETRY_IMPERSONATE_TARGET;
  return next;
}

function rotateYoutubeClient(argv) {
  const i = argv.indexOf("--extractor-args");
  if (i === -1 || !argv[i + 1]?.startsWith("youtube:player_client=")) return argv;
  const next = [...argv];
  next[i + 1] = `youtube:player_client=${YT_CLIENT_RETRY}`;
  return next;
}

const rotate = (argv) => rotateYoutubeClient(rotateImpersonation(argv));

// YouTube: no --impersonate, so this is the case that used to never retry.
const yt = ["-f", "b", "--extractor-args", "youtube:player_client=android_vr,web", "URL"];
assert.notEqual(rotate(yt), yt, "YouTube 403 must produce a changed argv");
assert.deepEqual(rotate(yt), [
  "-f", "b", "--extractor-args", "youtube:player_client=mweb,web", "URL",
]);

// TikTok: impersonation rotates, no YouTube args to touch.
const tk = ["-f", "b", "--impersonate", "chrome", "URL"];
assert.deepEqual(rotate(tk), ["-f", "b", "--impersonate", "safari", "URL"]);

// A site with neither: unchanged reference, so finalize fails the job instead
// of respawning an identical command.
const plain = ["-f", "b", "URL"];
assert.equal(rotate(plain), plain);

// Non-YouTube extractor args must not be rewritten.
const other = ["--extractor-args", "generic:impersonate", "URL"];
assert.equal(rotate(other), other);

console.log("ok");
