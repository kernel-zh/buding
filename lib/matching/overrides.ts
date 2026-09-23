import type { PatchsetLifecycle, TreeId } from "../data/schema.ts";

const TREE_IDS = new Set<TreeId>(["alex", "corbet", "linus"]);

export interface MatchOverride {
  messageId: string;
  tree: TreeId;
  commit: string;
  reason: string;
}

export interface IgnoreOverride {
  messageId: string;
  reason: string;
}

export interface StateOverride {
  messageId: string;
  state: PatchsetLifecycle;
  reason: string;
  evidence?: string;
}

export interface ReconciliationOverrides {
  matches: MatchOverride[];
  ignore: IgnoreOverride[];
  states: StateOverride[];
}

function scalar(value: string, line: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`Missing override value on line ${line}`);
  if (trimmed.startsWith('"')) {
    try {
      const result = JSON.parse(trimmed) as unknown;
      if (typeof result !== "string") throw new Error("not a string");
      return result;
    } catch {
      throw new Error(`Invalid quoted override value on line ${line}`);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  return trimmed.replace(/\s+#.*$/, "").trim();
}

type Section = "matches" | "ignore" | "states";

function fields(text: string): Record<Section, Array<Record<string, string>>> {
  const result: Record<Section, Array<Record<string, string>>> = { matches: [], ignore: [], states: [] };
  let section: Section | undefined;
  let entry: Record<string, string> | undefined;

  for (const [offset, rawLine] of text.split(/\r?\n/).entries()) {
    const line = offset + 1;
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    const header = rawLine.match(/^(matches|ignore|states):\s*(\[\s*\])?\s*$/);
    if (header) {
      section = header[1] as Section;
      entry = undefined;
      continue;
    }
    if (!section) throw new Error(`Override entry before a section on line ${line}`);
    const item = rawLine.match(/^\s+-\s+([a-z_]+):\s*(.+)$/);
    if (item) {
      entry = { [item[1]]: scalar(item[2], line) };
      result[section].push(entry);
      continue;
    }
    const property = rawLine.match(/^\s+([a-z_]+):\s*(.+)$/);
    if (!property || !entry) throw new Error(`Unsupported override YAML on line ${line}`);
    if (property[1] in entry) throw new Error(`Duplicate override field ${property[1]} on line ${line}`);
    entry[property[1]] = scalar(property[2], line);
  }
  return result;
}

function messageId(value: string | undefined, context: string): string {
  if (!value || !/^<[^<>\s]+>$/.test(value)) throw new Error(`${context} requires a bracketed message_id`);
  return value;
}

function exactKeys(entry: Record<string, string>, allowed: string[], context: string): void {
  const unexpected = Object.keys(entry).filter((key) => !allowed.includes(key));
  if (unexpected.length) throw new Error(`${context} has unsupported field ${unexpected[0]}`);
}

export function parseOverrides(text: string): ReconciliationOverrides {
  const parsed = fields(text);
  const matches = parsed.matches.map((entry, index) => {
    const context = `matches[${index}]`;
    exactKeys(entry, ["message_id", "tree", "commit", "reason"], context);
    if (!TREE_IDS.has(entry.tree as TreeId)) throw new Error(`${context} has unknown tree ${entry.tree ?? ""}`);
    if (!/^[0-9a-f]{7,40}$/i.test(entry.commit ?? "")) throw new Error(`${context} requires a Git commit SHA`);
    if (!entry.reason) throw new Error(`${context} requires a reason`);
    return {
      messageId: messageId(entry.message_id, context),
      tree: entry.tree as TreeId,
      commit: entry.commit.toLocaleLowerCase(),
      reason: entry.reason,
    };
  });
  const ignore = parsed.ignore.map((entry, index) => {
    const context = `ignore[${index}]`;
    exactKeys(entry, ["message_id", "reason"], context);
    if (!entry.reason) throw new Error(`${context} requires a reason`);
    return { messageId: messageId(entry.message_id, context), reason: entry.reason };
  });
  const states = parsed.states.map((entry, index) => {
    const context = `states[${index}]`;
    exactKeys(entry, ["message_id", "state", "reason", "evidence"], context);
    if (!(["active", "withdrawn", "invalid"] as string[]).includes(entry.state ?? "")) {
      throw new Error(`${context} has unknown state ${entry.state ?? ""}`);
    }
    if (!entry.reason) throw new Error(`${context} requires a reason`);
    return {
      messageId: messageId(entry.message_id, context),
      state: entry.state as PatchsetLifecycle,
      reason: entry.reason,
      ...(entry.evidence ? { evidence: entry.evidence } : {}),
    };
  });

  const matchKeys = new Set<string>();
  for (const match of matches) {
    const key = `${match.messageId}\0${match.tree}`;
    if (matchKeys.has(key)) throw new Error(`Duplicate match override for ${match.messageId} in ${match.tree}`);
    matchKeys.add(key);
  }
  const ignored = new Set<string>();
  for (const item of ignore) {
    if (ignored.has(item.messageId)) throw new Error(`Duplicate ignore override for ${item.messageId}`);
    ignored.add(item.messageId);
  }
  const conflicting = matches.find((match) => ignored.has(match.messageId));
  if (conflicting) throw new Error(`Patch ${conflicting.messageId} cannot be both matched and ignored`);
  const stateMessages = new Set<string>();
  for (const state of states) {
    if (stateMessages.has(state.messageId)) throw new Error(`Duplicate state override for ${state.messageId}`);
    if (ignored.has(state.messageId)) throw new Error(`Patch ${state.messageId} cannot be both state-overridden and ignored`);
    stateMessages.add(state.messageId);
  }
  return { matches, ignore, states };
}
