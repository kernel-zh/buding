import assert from "node:assert/strict";
import test from "node:test";
import { canonicalLoreMessageUrls, loreMessageUrls } from "../lib/lore/url.ts";

test("keeps b4-readable Message-ID characters in lore links", () => {
  const messageId = "<CAMnqnYx=value_++266@mail.gmail.com>";
  assert.deepEqual(loreMessageUrls(messageId), {
    loreUrl: "https://lore.kernel.org/linux-doc/CAMnqnYx=value_++266@mail.gmail.com/",
    rawUrl: "https://lore.kernel.org/linux-doc/CAMnqnYx=value_++266@mail.gmail.com/raw",
  });
});

test("normalizes encoded legacy lore links while retaining unsafe delimiters", () => {
  assert.deepEqual(canonicalLoreMessageUrls(
    "<patch+topic@example.com>",
    "https://lore.kernel.org/linux-doc/patch%2Btopic%40example.com/",
    "https://lore.kernel.org/linux-doc/patch%2Btopic%40example.com/raw",
  ), {
    loreUrl: "https://lore.kernel.org/linux-doc/patch+topic@example.com/",
    rawUrl: "https://lore.kernel.org/linux-doc/patch+topic@example.com/raw",
  });

  assert.equal(loreMessageUrls("<unsafe/path?#@example.com>").loreUrl,
    "https://lore.kernel.org/linux-doc/unsafe%2Fpath%3F%23@example.com/");
});
