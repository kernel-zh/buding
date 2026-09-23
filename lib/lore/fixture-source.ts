import { readFile } from "node:fs/promises";
import path from "node:path";
import { deduplicateMessages } from "./parser.ts";
import type { FixtureDataset, LoreMessage, LoreSource } from "./types";

export class FixtureLoreSource implements LoreSource {
  private readonly fixtureDirectory: string;

  constructor(fixtureDirectory: string) {
    this.fixtureDirectory = fixtureDirectory;
  }

  async loadDataset(): Promise<FixtureDataset> {
    const file = await readFile(path.join(this.fixtureDirectory, "messages.json"), "utf8");
    const dataset = JSON.parse(file) as FixtureDataset;
    if (!Array.isArray(dataset.messages)) throw new Error("Fixture messages.json must contain a messages array");
    return { ...dataset, messages: deduplicateMessages(dataset.messages) };
  }

  async search(query: string): Promise<LoreMessage[]> {
    const { messages } = await this.loadDataset();
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return messages;
    return messages.filter((message) => `${message.subject}\n${message.body}`.toLocaleLowerCase().includes(needle));
  }
}
