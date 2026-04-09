"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n";

const DEPARTMENTS = ["Management", "Sales", "Marketing", "Support", "Finance", "Logistics", "RMA"];

type User = {
  id: string;
  email: string;
  name: string | null;
  department: string | null;
  slackMemberId: string | null;
  lastLoginAt: string | null;
  isAdmin: boolean;
};

export default function AdminUsersPage() {
  const { lang } = useI18n();
  const [users, setUsers] = useState<User[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [editSlackId, setEditSlackId] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createDepartment, setCreateDepartment] = useState("");
  const [createSlackId, setCreateSlackId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  async function loadUsers() {
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { users: User[] };
    setUsers(data.users);
  }

  useEffect(() => { loadUsers(); }, []);

  function openEdit(user: User) {
    setEditingUser(user);
    setEditName(user.name ?? "");
    setEditDepartment(user.department ?? "");
    setEditSlackId(user.slackMemberId ?? "");
    setStatus("");
  }

  async function saveUser() {
    if (!editingUser) return;
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingUser.id,
          name: editName.trim() || null,
          department: editDepartment || null,
          slackMemberId: editSlackId.trim() || null
        })
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setStatus(data.error ?? "Error");
        return;
      }
      setEditingUser(null);
      await loadUsers();
    } catch {
      setStatus(lang === "sv" ? "Något gick fel" : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function createUser() {
    if (!createEmail.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim() || null,
          email: createEmail.trim().toLowerCase(),
          department: createDepartment || null,
          slackMemberId: createSlackId.trim() || null
        })
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setCreateError(data.error ?? "Error");
        return;
      }
      setShowCreate(false);
      setCreateName("");
      setCreateEmail("");
      setCreateDepartment("");
      setCreateSlackId("");
      await loadUsers();
    } catch {
      setCreateError(lang === "sv" ? "Något gick fel" : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <section className="crm-card">
        <div className="crm-item-head">
          <h2>{lang === "sv" ? "Användare" : "Users"}</h2>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="crm-button" onClick={() => setShowCreate(true)}>
              + {lang === "sv" ? "Ny användare" : "New user"}
            </button>
            <Link href="/admin/research" className="crm-button crm-button-secondary" style={{ textDecoration: "none" }}>
              {lang === "sv" ? "← Research & Inställningar" : "← Research & Settings"}
            </Link>
          </div>
        </div>
        <p className="crm-subtle" style={{ marginTop: "0.45rem" }}>
          {lang === "sv"
            ? "Hantera användare, avdelningar och Slack-koppling. Sätt avdelning till 'Sales' för att visa som säljare."
            : "Manage users, departments and Slack integration. Set department to 'Sales' to show as seller."}
        </p>
      </section>

      <section className="crm-card" style={{ marginTop: "1rem" }}>
        <div className="crm-list">
          {users.length === 0 ? (
            <p className="crm-subtle">{lang === "sv" ? "Inga användare hittade." : "No users found."}</p>
          ) : (
            users.map((user) => (
              <article
                key={user.id}
                className="crm-item"
                style={{ cursor: "pointer" }}
                onClick={() => openEdit(user)}
              >
                <div className="crm-item-head">
                  <strong>{user.name || user.email}</strong>
                  <div style={{ display: "flex", gap: "0.35rem" }}>
                    {user.isAdmin && <span className="crm-badge">Admin</span>}
                    {user.department && <span className="crm-badge">{user.department}</span>}
                    {user.slackMemberId && <span className="crm-badge">Slack</span>}
                  </div>
                </div>
                <p className="crm-subtle" style={{ marginTop: "0.2rem" }}>
                  {user.email}
                  {user.lastLoginAt
                    ? ` · ${lang === "sv" ? "Senast inloggad" : "Last login"}: ${new Date(user.lastLoginAt).toLocaleDateString()}`
                    : ""}
                </p>
              </article>
            ))
          )}
        </div>
      </section>

      {editingUser ? (
        <div className="crm-modal-backdrop" onClick={() => setEditingUser(null)}>
          <article className="crm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{lang === "sv" ? "Redigera användare" : "Edit user"}</h3>
            <p className="crm-subtle" style={{ marginTop: "0.3rem" }}>{editingUser.email}</p>
            <div style={{ marginTop: "0.8rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <input
                className="crm-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={lang === "sv" ? "Namn" : "Name"}
              />
              <select
                className="crm-select"
                value={editDepartment}
                onChange={(e) => setEditDepartment(e.target.value)}
              >
                <option value="">{lang === "sv" ? "Välj avdelning" : "Select department"}</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <input
                className="crm-input"
                value={editSlackId}
                onChange={(e) => setEditSlackId(e.target.value)}
                placeholder="Slack Member ID (U...)"
              />
            </div>
            <div className="crm-row" style={{ marginTop: "0.8rem" }}>
              <button className="crm-button" disabled={saving} onClick={saveUser}>
                {saving ? (lang === "sv" ? "Sparar..." : "Saving...") : (lang === "sv" ? "Spara" : "Save")}
              </button>
              <button className="crm-button crm-button-secondary" onClick={() => setEditingUser(null)}>
                {lang === "sv" ? "Avbryt" : "Cancel"}
              </button>
            </div>
            {status ? <p style={{ color: "#c63b25", marginTop: "0.4rem", fontSize: "0.85rem" }}>{status}</p> : null}
          </article>
        </div>
      ) : null}

      {showCreate ? (
        <div className="crm-modal-backdrop" onClick={() => setShowCreate(false)}>
          <article className="crm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{lang === "sv" ? "Ny användare" : "New user"}</h3>
            <div style={{ marginTop: "0.8rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <input
                className="crm-input"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder={lang === "sv" ? "Namn" : "Name"}
              />
              <input
                className="crm-input"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder={lang === "sv" ? "E-post" : "Email"}
                type="email"
              />
              <select
                className="crm-select"
                value={createDepartment}
                onChange={(e) => setCreateDepartment(e.target.value)}
              >
                <option value="">{lang === "sv" ? "Välj avdelning" : "Select department"}</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <input
                className="crm-input"
                value={createSlackId}
                onChange={(e) => setCreateSlackId(e.target.value)}
                placeholder="Slack Member ID (U...)"
              />
            </div>
            <div className="crm-row" style={{ marginTop: "0.8rem" }}>
              <button className="crm-button" disabled={creating || !createEmail.trim()} onClick={createUser}>
                {creating ? (lang === "sv" ? "Skapar..." : "Creating...") : (lang === "sv" ? "Skapa" : "Create")}
              </button>
              <button className="crm-button crm-button-secondary" onClick={() => setShowCreate(false)}>
                {lang === "sv" ? "Avbryt" : "Cancel"}
              </button>
            </div>
            {createError ? <p style={{ color: "#c63b25", marginTop: "0.4rem", fontSize: "0.85rem" }}>{createError}</p> : null}
          </article>
        </div>
      ) : null}
    </>
  );
}
