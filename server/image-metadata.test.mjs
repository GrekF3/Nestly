import assert from "node:assert/strict";
import { test } from "node:test";
import { hasPrivateMetadata } from "./image-metadata.ts";

const jpeg = (marker) => Uint8Array.from([0xff, 0xd8, 0xff, marker, 0x00, 0x02, 0xff, 0xda, 0x00, 0x02, 0x00]);
const png = (kind) => Uint8Array.from([
  137,80,78,71,13,10,26,10,
  0,0,0,0,...[...kind].map((char) => char.charCodeAt(0)),0,0,0,0,
  0,0,0,0,73,69,78,68,0,0,0,0,
]);

test("rejects JPEG EXIF but accepts a metadata-free segment", () => {
  assert.equal(hasPrivateMetadata("image/jpeg", jpeg(0xe1)), true);
  assert.equal(hasPrivateMetadata("image/jpeg", jpeg(0xe0)), false);
});

test("rejects PNG text/EXIF chunks and malformed files", () => {
  assert.equal(hasPrivateMetadata("image/png", png("eXIf")), true);
  assert.equal(hasPrivateMetadata("image/png", png("tEXt")), true);
  assert.equal(hasPrivateMetadata("image/png", png("IHDR")), false);
  assert.equal(hasPrivateMetadata("image/png", new Uint8Array([137,80,78,71])), true);
});
