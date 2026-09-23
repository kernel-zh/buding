"use client";

import { useEffect, useRef, useState } from "react";

interface Identity { actor: string; role: string }

export function ApiKeyMenu() {
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [identity, setIdentity] = useState<Identity>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/session").then(async (response) => response.ok ? response.json() as Promise<Identity> : undefined)
      .then((current) => setIdentity(current));
  }, []);

  useEffect(() => {
    if (!open) return;

    function closeWhenOutside(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false);
    }

    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  async function authenticate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage(undefined);
    const response = await fetch("/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey }) });
    const result = await response.json() as { error?: string; actor?: string; role?: string };
    setBusy(false);
    if (!response.ok) return setMessage(result.error ?? "Could not verify API key.");
    setApiKey(""); setIdentity({ actor: result.actor ?? "Maintainer", role: result.role ?? "operator" }); setMessage("API Key saved in this browser.");
  }

  async function forget() {
    setBusy(true);
    await fetch("/api/auth/session", { method: "DELETE" });
    setIdentity(undefined); setMessage("API Key session removed from this browser."); setBusy(false);
  }

  return (
    <div className="api-key-menu" ref={menuRef}>
      <button className={`nav-link ${identity ? "active" : ""}`} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="dialog">
        {identity ? "API Key ✓" : "API Key"}
      </button>
      {open && <div className="api-key-popover" role="dialog" aria-label="API Key authentication">
        {identity ? <><p>Authenticated as <strong>{identity.actor}</strong>.</p><button className="control-button" type="button" onClick={() => void forget()} disabled={busy}>Forget this browser</button></> : (
          <form onSubmit={authenticate}><label htmlFor="global-api-key">API Key</label><input id="global-api-key" type="password" autoComplete="current-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} required /><button className="control-button" disabled={busy}>{busy ? "Checking…" : "Confirm"}</button></form>
        )}
        {message && <p className="api-key-message" role="status">{message}</p>}
      </div>}
    </div>
  );
}
