import Link from "next/link";
import { LanguageBadge } from "@/components/language-badge";
import { UpstreamLights } from "@/components/upstream-lights";
import { getPatchsets } from "@/lib/data/loader";
import { furthestConfirmedStage, type UpstreamStage } from "@/lib/data/stage";
import { TRACKED_TREES } from "@/lib/git/config";

const columns: Array<{ id: UpstreamStage; title: string; branch: string }> = [
  { id: "lore", title: "On lore", branch: "Awaiting confirmed Git evidence" },
  ...TRACKED_TREES.map((tree) => ({ id: tree.id, title: tree.name, branch: tree.branch })),
];

export default async function BoardPage() {
  const patchsets = (await getPatchsets()).filter((item) => item.latestRevision);
  return (
    <>
      <section className="shell content-section">
        <div className="page-heading">
          <div><h1>Upstream board</h1><p>Each series is placed at its furthest stage confirmed by Git evidence.</p></div>
          <span className="heading-count">{patchsets.length} latest patchsets</span>
        </div>
        <div className="board-grid">
          {columns.map((column) => {
            const items = patchsets.filter((item) => furthestConfirmedStage(item) === column.id);
            return (
              <section className="board-column" key={column.title}>
                <header className="board-head">
                  <h2>{column.title}</h2>
                  <span>{column.branch} · {items.length}</span>
                </header>
                <div className="board-cards">
                  {items.map((item) => (
                    <Link className="board-card" href={`/patchsets/${item.id}`} key={item.id}>
                      <h3 className="board-card-title">{item.subject}</h3>
                      <div className="board-card-meta">
                        <LanguageBadge language={item.language} />
                        <UpstreamLights trees={item.trees} compact />
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </>
  );
}
