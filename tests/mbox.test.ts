import assert from "node:assert/strict";
import test from "node:test";
import { decodeMimeHeader, parseMboxrd } from "../lib/lore/mbox.ts";

test("decodes MIME headers", () => {
  assert.equal(
    decodeMimeHeader("=?UTF-8?Q?[PATCH]_docs/zh=5FCN:_fix_typo?="),
    "[PATCH] docs/zh_CN: fix typo",
  );
});

test("parses mboxrd messages and decodes quoted-printable patches", () => {
  const mbox = `From nobody@example.com Sat Sep  5 10:00:00 2026
Message-ID: <patch@example.com>
Subject: =?UTF-8?Q?[PATCH]_docs/zh=5FCN:_fix_typo?=
From: Example Author <author@example.com>
Date: Sat, 5 Sep 2026 10:00:00 +0000
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: quoted-printable

diff --git a/Documentation/translations/zh_CN/a.rst b/Documentation/translations/zh_CN/a.rst
=2B=2B=2B b/Documentation/translations/zh_CN/a.rst
From nobody@example.com Sat Sep  5 10:01:00 2026
Message-ID: <reply@example.com>
Subject: Re: [PATCH] docs/zh_CN: fix typo
From: Reviewer <reviewer@example.com>
Date: Sat, 5 Sep 2026 10:01:00 +0000
In-Reply-To: <patch@example.com>
References: <patch@example.com>

Reviewed-by: Reviewer <reviewer@example.com>
`;
  const messages = parseMboxrd(mbox);

  assert.equal(messages.length, 2);
  assert.equal(messages[0].subject, "[PATCH] docs/zh_CN: fix typo");
  assert.match(messages[0].body, /^\+\+\+ b\/Documentation/m);
  assert.equal(messages[0].loreUrl, "https://lore.kernel.org/linux-doc/patch@example.com/");
  assert.equal(messages[1].inReplyTo, "<patch@example.com>");
  assert.deepEqual(messages[1].references, ["<patch@example.com>"]);
});
