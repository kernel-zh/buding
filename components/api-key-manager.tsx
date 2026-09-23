"use client";

import { useEffect, useState } from "react";

interface ManagedKey { key_id: string; label: string; role: "admin" | "operator"; created_at: string; expires_at: string | null; revoked_at: string | null; last_used_at: string | null }

async function json(response: Response): Promise<{ keys?: ManagedKey[]; apiKey?: string; error?: string }> {
  const body = await response.text();
  if (!body) return {};
  try { return JSON.parse(body) as { keys?: ManagedKey[]; apiKey?: string; error?: string }; } catch { return { error: "Unexpected server response." }; }
}

function date(value: string | null): string {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

export function ApiKeyManager() {
  const [keys, setKeys] = useState<ManagedKey[]>([]);
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<ManagedKey["role"]>("operator");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [newKey, setNewKey] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busyAction, setBusyAction] = useState<string>();
  const [editing, setEditing] = useState<ManagedKey>();
  const [editLabel, setEditLabel] = useState("");
  const [editRole, setEditRole] = useState<ManagedKey["role"]>("operator");
  const [editExpiration, setEditExpiration] = useState<"keep" | "never" | "days">("keep");
  const [editExpiresInDays, setEditExpiresInDays] = useState("");

  async function load() {
    const response = await fetch("/api/admin/api-keys");
    const result = await json(response);
    if (!response.ok) return setMessage(result.error ?? "Could not load API keys.");
    setKeys(result.keys ?? []);
  }

  useEffect(() => {
    let current = true;
    void fetch("/api/admin/api-keys").then(async (response) => ({ response, result: await json(response) }))
      .then(({ response, result }) => {
        if (!current) return;
        if (!response.ok) setMessage(result.error ?? "Could not load API keys.");
        else setKeys(result.keys ?? []);
      });
    return () => { current = false; };
  }, []);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusyAction("create"); setMessage(undefined); setNewKey(undefined);
    const response = await fetch("/api/admin/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, role, expiresInDays }) });
    const result = await json(response);
    setBusyAction(undefined);
    if (!response.ok) return setMessage(result.error ?? "Could not create API key.");
    setNewKey(result.apiKey); setLabel(""); setExpiresInDays(""); await load();
  }

  async function revoke(keyId: string) {
    if (!window.confirm(`Revoke ${keyId}? It cannot be used again.`)) return;
    setBusyAction(`revoke:${keyId}`); setMessage(undefined);
    const response = await fetch("/api/admin/api-keys", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyId }) });
    setBusyAction(undefined);
    if (!response.ok) return setMessage("Could not revoke API key.");
    await load();
  }

  async function remove(keyId: string) {
    if (!window.confirm(`Permanently delete the revoked record ${keyId}? This cannot be undone.`)) return;
    setBusyAction(`delete:${keyId}`); setMessage(undefined);
    const response = await fetch("/api/admin/api-keys", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyId, deleteRecord: true }) });
    setBusyAction(undefined);
    if (!response.ok) return setMessage("Could not delete API key record.");
    await load();
  }

  function beginEdit(key: ManagedKey) {
    setEditing(key); setEditLabel(key.label); setEditRole(key.role);
    setEditExpiration("keep"); setEditExpiresInDays("");
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setBusyAction("edit"); setMessage(undefined);
    const expiresInDays = editExpiration === "keep" ? undefined : editExpiration === "never" ? null : editExpiresInDays;
    const response = await fetch("/api/admin/api-keys", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyId: editing.key_id, label: editLabel, role: editRole, expiresInDays }) });
    const result = await json(response);
    setBusyAction(undefined);
    if (!response.ok) return setMessage(result.error ?? "Could not update API key.");
    setEditing(undefined); await load();
  }

  return <section className="section admin-key-manager">
    <h2>Create API Key</h2>
    <form className="status-form" onSubmit={create}>
      <label>Name<input value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder="Alice laptop" required /></label>
      <label>Role<select value={role} onChange={(event) => setRole(event.target.value as ManagedKey["role"])}><option value="operator">Operator</option><option value="admin">Admin</option></select></label>
      <label>Expires in days <input type="number" min="1" max="3650" value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)} placeholder="Never" /></label>
      <button className="control-button" disabled={busyAction !== undefined}>{busyAction === "create" ? "Creating…" : "Create key"}</button>
    </form>
    {newKey && <div className="new-api-key"><strong>Copy this API Key now. It cannot be displayed again.</strong><code>{newKey}</code></div>}
    {message && <p className="section-help" role="status">{message}</p>}

    {editing && <section className="key-editor"><h2>Edit {editing.label}</h2><form className="status-form" onSubmit={saveEdit}>
      <label>Name<input value={editLabel} maxLength={120} onChange={(event) => setEditLabel(event.target.value)} required /></label>
      <label>Role<select value={editRole} onChange={(event) => setEditRole(event.target.value as ManagedKey["role"])}><option value="operator">Operator</option><option value="admin">Admin</option></select></label>
      <label>Expiration<select value={editExpiration} onChange={(event) => setEditExpiration(event.target.value as "keep" | "never" | "days")}><option value="keep">Keep current value</option><option value="never">Never expires</option><option value="days">Set days from now</option></select></label>
      {editExpiration === "days" && <label>Expires in days <input type="number" min="1" max="3650" value={editExpiresInDays} onChange={(event) => setEditExpiresInDays(event.target.value)} required /></label>}
      <button className="control-button" disabled={busyAction !== undefined}>{busyAction === "edit" ? "Saving…" : "Save changes"}</button><button className="control-button" type="button" disabled={busyAction !== undefined} onClick={() => setEditing(undefined)}>Cancel</button>
    </form></section>}

    <h2>API Keys</h2>
    <div className="table-shell"><table className="patch-table"><thead><tr><th>Name</th><th>Key ID</th><th>Role</th><th>Created</th><th>Last used</th><th>Expires</th><th>State</th><th /></tr></thead><tbody>
      {keys.map((key) => <tr key={key.key_id}><td>{key.label}</td><td><code>{key.key_id}</code></td><td>{key.role}</td><td>{date(key.created_at)}</td><td>{date(key.last_used_at)}</td><td>{date(key.expires_at)}</td><td>{key.revoked_at ? "Revoked" : "Active"}</td><td>{key.revoked_at ? <button className="control-button" type="button" disabled={busyAction !== undefined} onClick={() => void remove(key.key_id)}>{busyAction === `delete:${key.key_id}` ? "Deleting…" : "Delete record"}</button> : <span className="key-actions"><button className="control-button" type="button" disabled={busyAction !== undefined} onClick={() => beginEdit(key)}>Edit</button><button className="control-button" type="button" disabled={busyAction !== undefined} onClick={() => void revoke(key.key_id)}>{busyAction === `revoke:${key.key_id}` ? "Revoking…" : "Revoke"}</button></span>}</td></tr>)}
    </tbody></table></div>
  </section>;
}
