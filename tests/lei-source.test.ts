import assert from "node:assert/strict";
import test from "node:test";
import { LeiLoreSource, type CommandRunner } from "../lib/lore/lei-source.ts";

test("passes a lore query to lei without a shell and requests full threads", async () => {
  let invocation: { executable: string; args: string[] } | undefined;
  const runner: CommandRunner = async (executable, args) => {
    invocation = { executable, args };
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  const source = new LeiLoreSource("https://lore.kernel.org/linux-doc/", runner, "lei-test");

  assert.deepEqual(await source.search("dfn:test"), []);
  assert.deepEqual(invocation, {
    executable: "lei-test",
    args: [
      "q", "--no-save", "--dedupe=mid", "--format=mboxrd", "-t",
      "-I", "https://lore.kernel.org/linux-doc/", "dfn:test",
    ],
  });
});

test("reports lei failures with stderr", async () => {
  const runner: CommandRunner = async () => ({ stdout: "", stderr: "remote unavailable", exitCode: 2 });
  const source = new LeiLoreSource(undefined, runner);
  await assert.rejects(source.search("dfn:test"), /remote unavailable/);
});
