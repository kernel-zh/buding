import type { TreeId } from "../data/schema";

export interface MailboxAddress {
  name: string;
  email: string;
}

export interface LoreMessage {
  messageId: string;
  subject: string;
  from: MailboxAddress;
  date: string;
  inReplyTo?: string;
  references: string[];
  body: string;
  loreUrl: string;
  rawUrl: string;
  patchId?: string;
}

export interface ParsedSubject {
  isPatch: boolean;
  isReply: boolean;
  rfc: boolean;
  revision: number;
  index: number | null;
  total: number | null;
  baseSubject: string;
}

export interface FixtureTreeMatch {
  state: "confirmed" | "candidate" | "previously-present";
  commit?: string;
}

export interface LoreDataset {
  messages: LoreMessage[];
  matches?: Record<string, Partial<Record<TreeId, FixtureTreeMatch>>>;
}

export type FixtureDataset = LoreDataset;

export interface LoreThread {
  rootMessageId: string;
  messages: LoreMessage[];
}

export interface LoreSource {
  search(query: string): Promise<LoreMessage[]>;
}
