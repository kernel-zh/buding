import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GitRepository } from "../lib/git/repository.ts";
import { checkedGit, runCommand } from "../lib/git/runner.ts";

async function git(cwd: string, args: string[]): Promise<void> {
  await checkedGit(runCommand, args, { cwd });
}

test("indexes relevant commits and computes stable patch IDs from a bare cache", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "buding-git-repository-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const cache = path.join(root, "cache", "alex.git");
  await mkdir(path.join(source, "Documentation", "translations", "zh_CN"), { recursive: true });
  await git(root, ["init", "--initial-branch=master", source]);
  await git(source, ["config", "user.name", "Test Author"]);
  await git(source, ["config", "user.email", "author@example.com"]);
  await writeFile(path.join(source, "Documentation", "translations", "zh_CN", "test.rst"), "第一版\n");
  await git(source, ["add", "."]);
  await git(source, ["commit", "-m", "docs/zh_CN: add test translation"]);
  await writeFile(path.join(source, "unrelated.txt"), "not documentation\n");
  await git(source, ["add", "."]);
  await git(source, ["commit", "-m", "chore: unrelated change"]);

  const repository = new GitRepository(cache, {
    id: "alex",
    name: "Fixture",
    repository: source,
    branch: "master",
  });
  const head = await repository.fetch("2020-01-01T00:00:00Z");
  const ids = await repository.relevantCommitIds(head, "2020-01-01T00:00:00Z");
  const commits = await repository.readCommits(ids);

  assert.equal(ids.length, 1);
  assert.equal(commits[0].subject, "docs/zh_CN: add test translation");
  assert.match(commits[0].commit, /^[0-9a-f]{40}$/);
  assert.match(commits[0].patchId ?? "", /^[0-9a-f]{40}$/);
  assert.deepEqual(commits[0].changedFiles, ["Documentation/translations/zh_CN/test.rst"]);
});
