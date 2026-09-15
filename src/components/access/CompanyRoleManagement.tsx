import { useMemo, useState } from "react";
import { Archive, Copy, Edit3, Plus, Save, ShieldCheck, X } from "lucide-react";
import type { CompanyPermissionCatalogEntry, CompanyRoleSummary } from "../../lib/companyAccess.ts";
import { useCompanyAccess } from "../../context/CompanyAccessContext.tsx";
import { permissionDisplayName, permissionGroupDisplayName, permissionGroupKey, type PermissionKey } from "../../utils/accessControl.ts";
import { safeErrorMessage } from "../../utils/errorNormalization.ts";

interface CompanyRoleManagementProps {
  companyId: string;
  roles: CompanyRoleSummary[];
  catalog: CompanyPermissionCatalogEntry[];
  canManage: boolean;
  onRefresh: () => Promise<void>;
}

function groupedPermissions(catalog: CompanyPermissionCatalogEntry[]) {
  const groups = new Map<string, CompanyPermissionCatalogEntry[]>();
  for (const entry of catalog.filter((item) => item.memberAssignable)) {
    const group = permissionGroupKey(entry.permissionKey);
    groups.set(group, [...(groups.get(group) || []), entry]);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function emptyDraft() {
  return { displayName: "", description: "", permissions: [] as PermissionKey[] };
}

export function CompanyRoleManagement({ companyId, roles, catalog, canManage, onRefresh }: CompanyRoleManagementProps) {
  const companyAccess = useCompanyAccess();
  const [formOpen, setFormOpen] = useState(false);
  const [editingRoleKey, setEditingRoleKey] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const permissionGroups = useMemo(() => groupedPermissions(catalog), [catalog]);
  const visibleRoles = useMemo(() => roles.filter((role) => !role.isPlatformRole), [roles]);

  if (!canManage) return null;

  const closeForm = () => {
    setFormOpen(false);
    setEditingRoleKey(null);
    setDraft(emptyDraft());
  };

  const openCreate = (source?: CompanyRoleSummary) => {
    setFormOpen(true);
    setEditingRoleKey(null);
    const assignableKeys = new Set(catalog.filter((entry) => entry.memberAssignable).map((entry) => entry.permissionKey));
    setDraft(source ? { displayName: `${source.displayName} copy`, description: source.description || "", permissions: source.permissions.filter((permission) => assignableKeys.has(permission)) } : emptyDraft());
    setNotice(null);
  };

  const openEdit = (role: CompanyRoleSummary) => {
    if (role.isBuiltin || role.archivedAt) return;
    setFormOpen(true);
    setEditingRoleKey(role.roleKey);
    setDraft({ displayName: role.displayName, description: role.description || "", permissions: [...role.permissions] });
    setNotice(null);
  };

  const togglePermission = (permissionKey: PermissionKey) => {
    setDraft((current) => ({
      ...current,
      permissions: current.permissions.includes(permissionKey)
        ? current.permissions.filter((item) => item !== permissionKey)
        : [...current.permissions, permissionKey],
    }));
  };

  const save = async () => {
    if (!draft.displayName.trim()) return;
    setBusy(editingRoleKey ? `edit:${editingRoleKey}` : "create");
    setNotice(null);
    try {
      if (editingRoleKey) {
        await companyAccess.updateCompanyRole({ companyId, roleKey: editingRoleKey, displayName: draft.displayName, description: draft.description, permissions: draft.permissions });
        setNotice({ kind: "success", message: "Custom role updated. Assigned members now use the revised permissions." });
      } else {
        await companyAccess.createCompanyRole({ companyId, displayName: draft.displayName, description: draft.description, permissions: draft.permissions });
        setNotice({ kind: "success", message: "Custom role created and ready for assignment." });
      }
      closeForm();
      await onRefresh();
    } catch (error) {
      setNotice({ kind: "error", message: safeErrorMessage(error, "The custom role could not be saved.") });
    } finally {
      setBusy(null);
    }
  };

  const archive = async (role: CompanyRoleSummary) => {
    if (role.isBuiltin || role.archivedAt) return;
    if (!window.confirm(`Archive ${role.displayName}?\n\nMembers and pending access authorizations must be reassigned first.`)) return;
    setBusy(`archive:${role.roleKey}`);
    setNotice(null);
    try {
      await companyAccess.archiveCompanyRole(companyId, role.roleKey);
      setNotice({ kind: "success", message: `${role.displayName} was archived.` });
      await onRefresh();
    } catch (error) {
      setNotice({ kind: "error", message: safeErrorMessage(error, "The custom role could not be archived.") });
    } finally {
      setBusy(null);
    }
  };

  return <section className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/30 p-3.5" aria-labelledby="company-roles-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-indigo-700" /><h3 id="company-roles-title" className="text-xs font-black uppercase tracking-wider text-slate-800">Roles</h3></div>
        <p className="mt-1 max-w-3xl text-[10px] leading-5 text-slate-600">Starter roles are protected defaults. Company Administrators can create company-specific roles with only the operational access those roles need.</p>
      </div>
      {!editingRoleKey && <button type="button" onClick={() => openCreate()} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-2 text-[10px] font-black text-white hover:bg-indigo-700"><Plus className="h-3.5 w-3.5" />New custom role</button>}
    </div>

    {notice && <div role={notice.kind === "error" ? "alert" : "status"} className={`mt-3 rounded-lg border px-3 py-2 text-xs ${notice.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{notice.message}</div>}

    {formOpen && editingRoleKey === null && <RoleForm draft={draft} groups={permissionGroups} busy={busy === "create"} title="New custom role" onChange={setDraft} onTogglePermission={togglePermission} onSave={() => void save()} onCancel={closeForm} />}
    {formOpen && editingRoleKey !== null && <RoleForm draft={draft} groups={permissionGroups} busy={busy === `edit:${editingRoleKey}`} title="Edit custom role" onChange={setDraft} onTogglePermission={togglePermission} onSave={() => void save()} onCancel={closeForm} />}

    <div className="mt-3 space-y-2">
      {visibleRoles.map((role) => <div key={role.roleKey} className="rounded-lg border border-white bg-white px-3 py-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><p className="text-xs font-black text-slate-900">{role.displayName}</p><span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${role.isBuiltin ? "bg-slate-100 text-slate-600" : role.archivedAt ? "bg-rose-50 text-rose-700" : "bg-indigo-50 text-indigo-700"}`}>{role.isBuiltin ? "Starter role" : role.archivedAt ? "Archived" : "Custom role"}</span></div><p className="mt-0.5 text-[10px] leading-4 text-slate-500">{role.description || "No description"} · {role.permissions.length} permission{role.permissions.length === 1 ? "" : "s"} · {role.memberCount} member{role.memberCount === 1 ? "" : "s"}</p></div>
          <div className="flex flex-wrap gap-1.5">{!role.archivedAt && <button type="button" onClick={() => openCreate(role)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50"><Copy className="h-3 w-3" />Duplicate role</button>}{!role.isBuiltin && !role.archivedAt && <><button type="button" onClick={() => openEdit(role)} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2 py-1.5 text-[10px] font-bold text-indigo-800 hover:bg-indigo-50"><Edit3 className="h-3 w-3" />Edit role</button><button type="button" onClick={() => void archive(role)} disabled={Boolean(busy)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1.5 text-[10px] font-bold text-rose-800 hover:bg-rose-50 disabled:opacity-50"><Archive className="h-3 w-3" />{busy === `archive:${role.roleKey}` ? "Archiving…" : "Archive role"}</button></>}</div>
        </div>
      </div>)}
      {visibleRoles.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-xs text-slate-500">No role definitions were returned.</p>}
    </div>
  </section>;
}

function RoleForm({ draft, groups, busy, title, onChange, onTogglePermission, onSave, onCancel }: { draft: ReturnType<typeof emptyDraft>; groups: Array<[string, CompanyPermissionCatalogEntry[]]>; busy: boolean; title: string; onChange: (draft: ReturnType<typeof emptyDraft>) => void; onTogglePermission: (permissionKey: PermissionKey) => void; onSave: () => void; onCancel: () => void }) {
  return <div className="mt-3 rounded-xl border border-indigo-200 bg-white p-3" data-custom-role-form>
    <div className="flex items-center justify-between gap-2"><p className="text-xs font-black text-slate-900">{title}</p><button type="button" onClick={onCancel} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Close role editor"><X className="h-4 w-4" /></button></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-[10px] font-bold text-slate-600">Business-facing name<input value={draft.displayName} onChange={(event) => onChange({ ...draft, displayName: event.target.value })} maxLength={120} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-400" /></label><label className="text-[10px] font-bold text-slate-600">Description (optional)<input value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value })} maxLength={500} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-400" /></label></div>
    <p className="mt-3 text-[10px] leading-4 text-slate-500">Choose operational permissions. Protected company-access, company-settings, and platform capabilities are intentionally unavailable here.</p>
    <div className="mt-3 grid gap-2 lg:grid-cols-2">{groups.map(([group, entries]) => <fieldset key={group} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5"><legend className="px-1 text-[10px] font-black uppercase tracking-wider text-slate-500">{permissionGroupDisplayName(group)}</legend><div className="mt-1 space-y-1.5">{entries.map((entry) => <label key={entry.permissionKey} className="flex items-start gap-2 rounded-lg bg-white px-2.5 py-2 text-xs text-slate-700"><input type="checkbox" checked={draft.permissions.includes(entry.permissionKey)} onChange={() => onTogglePermission(entry.permissionKey)} disabled={busy} className="mt-0.5 accent-indigo-600" /><span><span className="font-bold">{permissionDisplayName(entry.permissionKey)}</span><span className="ml-1 text-[10px] text-slate-400">{entry.permissionKey}</span></span></label>)}</div></fieldset>)}</div>
    <div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" onClick={onCancel} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><X className="h-3.5 w-3.5" />Cancel</button><button type="button" onClick={onSave} disabled={busy || !draft.displayName.trim()} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-2 text-xs font-bold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" />{busy ? "Saving…" : "Save role"}</button></div>
  </div>;
}
