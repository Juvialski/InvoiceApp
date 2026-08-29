import { useCallback, useEffect, useMemo, useState } from "react";
import type { Project } from "../../types.ts";
import {
  applyProjectLifecycleInSupabase,
  buildProjectLifecyclePreview,
  previewProjectLifecycleInSupabase,
  readProjectsFromLocal,
  saveProjectToSupabase,
  writeProjectsToLocal,
  type ProjectLifecycleAction,
  type ProjectLifecyclePreview,
} from "../../lib/projects.ts";

export interface ProjectControllerOptions {
  /** True only when a signed-in user and the Supabase client are available. */
  authenticated: boolean;
  /** Guest data may be written to browser storage, but never to Supabase. */
  persistGuestWorkspace: boolean;
  /** The project id from the canonical route, if the project workspace is open. */
  routeProjectId?: string;
  navigateToPath: (path: string) => void;
  projectPath: (projectId: string) => string;
  projectsPath: () => string;
  onPayrollRelevantChange: () => void;
  onSuccess: (message: string) => void;
  onError: (error: unknown, fallback: string) => void;
  remoteWorkspaceConfigured: boolean;
}

export interface ProjectController {
  projects: Project[];
  selectedProject: Project | null;
  projectFormSeed: Project | null;
  applyProjects: (projects: Project[]) => void;
  loadGuestProjects: () => void;
  reset: () => void;
  saveProject: (project: Project) => Promise<void>;
  previewProjectLifecycle: (project: Project) => Promise<ProjectLifecyclePreview>;
  applyProjectLifecycle: (project: Project, action: ProjectLifecycleAction, reason?: string) => Promise<void>;
  archiveProject: (project: Project) => Promise<void>;
  reactivateProject: (project: Project) => Promise<void>;
  openProject: (project: Project) => void;
  editProject: (project: Project) => void;
}

function confirmProjectLifecycle(message: string) {
  return typeof window === "undefined" || window.confirm(message);
}

export function useProjectController(options: ProjectControllerOptions): ProjectController {
  const {
    authenticated,
    persistGuestWorkspace,
    routeProjectId,
    navigateToPath,
    projectPath,
    projectsPath,
    onPayrollRelevantChange,
    onSuccess,
    onError,
    remoteWorkspaceConfigured,
  } = options;
  const [projects, setProjects] = useState<Project[]>(() => remoteWorkspaceConfigured ? [] : readProjectsFromLocal());
  const [projectFormSeed, setProjectFormSeed] = useState<Project | null>(null);
  const [guestProjectsReady, setGuestProjectsReady] = useState(!remoteWorkspaceConfigured);

  const selectedProject = useMemo(
    () => routeProjectId ? projects.find((project) => project.id === routeProjectId) || null : null,
    [projects, routeProjectId],
  );

  const applyProjects = useCallback((nextProjects: Project[]) => {
    setProjects(nextProjects);
  }, []);

  const loadGuestProjects = useCallback(() => {
    setProjects(readProjectsFromLocal());
    setGuestProjectsReady(true);
  }, []);

  const reset = useCallback(() => {
    setProjects([]);
    setProjectFormSeed(null);
  }, []);

  useEffect(() => {
    if (!persistGuestWorkspace) {
      setGuestProjectsReady(false);
      return;
    }
    loadGuestProjects();
  }, [loadGuestProjects, persistGuestWorkspace]);

  useEffect(() => {
    if (persistGuestWorkspace && guestProjectsReady) writeProjectsToLocal(projects);
  }, [guestProjectsReady, persistGuestWorkspace, projects]);

  const saveProject = useCallback(async (project: Project) => {
    try {
      const previous = projects.find((item) => item.id === project.id);
      const payrollRelevantChange = Boolean(
        previous && (previous.status !== project.status || Boolean(previous.archivedAt) !== Boolean(project.archivedAt)),
      );
      const saved = authenticated
        ? await saveProjectToSupabase(project)
        : { ...project, updatedAt: new Date().toISOString() };
      setProjects((current) => current.some((item) => item.id === saved.id)
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [saved, ...current]);
      if (payrollRelevantChange) onPayrollRelevantChange();
      setProjectFormSeed(null);
      onSuccess(`${saved.projectCode} saved.`);
    } catch (error) {
      onError(error, "Could not save project. Your draft remains available.");
    }
  }, [authenticated, onError, onPayrollRelevantChange, onSuccess, projects]);

  const previewProjectLifecycle = useCallback(async (project: Project) => {
    if (authenticated) return previewProjectLifecycleInSupabase(project.id);
    // Guest/local workspaces do not have an authoritative database preflight.
    // Keep permanent deletion unavailable while retaining the same archive and
    // reactivation vocabulary used by the production lifecycle.
    return buildProjectLifecyclePreview(project, {}, { allowDelete: false, allowLegacyReactivation: true, source: "local" });
  }, [authenticated]);

  const applyProjectLifecycle = useCallback(async (project: Project, action: ProjectLifecycleAction, reason?: string) => {
    try {
      const result = authenticated
        ? await applyProjectLifecycleInSupabase(project.id, action, reason)
        : (() => {
            const preview = buildProjectLifecyclePreview(project, {}, { allowDelete: false, allowLegacyReactivation: true, source: "local" });
            if (action === "DELETE_UNUSED") throw new Error("Permanent project deletion requires an authoritative database preflight.");
            const updatedAt = new Date().toISOString();
            const record = action === "ARCHIVE"
              ? {
                  ...project,
                  status: "ARCHIVED" as const,
                  archivedAt: project.archivedAt || updatedAt,
                  archivedFromStatus: project.status === "ARCHIVED" ? project.archivedFromStatus : project.status,
                  updatedAt,
                }
              : {
                  ...project,
                  status: project.archivedFromStatus || "ACTIVE",
                  archivedAt: undefined,
                  archivedFromStatus: undefined,
                  updatedAt,
                };
            return { entityType: "PROJECT" as const, entityId: project.id, action, deleted: false, preflight: preview, record };
          })();
      if (result.deleted) {
        setProjects((current) => current.filter((item) => item.id !== result.entityId));
      } else if (result.record) {
        setProjects((current) => current.map((item) => item.id === result.record?.id ? result.record : item));
      }
      onPayrollRelevantChange();
      setProjectFormSeed(null);
      onSuccess(action === "DELETE_UNUSED"
        ? `${project.projectCode} permanently deleted because it had no project history.`
        : action === "REACTIVATE"
          ? `${project.projectCode} reactivated.`
          : `${project.projectCode} archived. Historical records remain visible.`);
    } catch (error) {
      onError(error, "Could not complete the project lifecycle action.");
      throw error;
    }
  }, [authenticated, onError, onPayrollRelevantChange, onSuccess]);

  const archiveProject = useCallback(async (project: Project) => {
    if (!confirmProjectLifecycle("This keeps the project and its historical records but removes it from active workflows. Continue?")) return;
    try {
      await applyProjectLifecycle(project, "ARCHIVE", "Confirmed project archive");
    } catch {
      // The shared lifecycle handler already surfaced the normalized error.
    }
  }, [applyProjectLifecycle]);

  const reactivateProject = useCallback(async (project: Project) => {
    if (!confirmProjectLifecycle("Reactivate this project? It will return to active workflows, and historical records will remain unchanged.")) return;
    try {
      await applyProjectLifecycle(project, "REACTIVATE", "Confirmed project reactivation");
    } catch {
      // The shared lifecycle handler already surfaced the normalized error.
    }
  }, [applyProjectLifecycle]);

  const openProject = useCallback((project: Project) => {
    setProjectFormSeed(null);
    navigateToPath(projectPath(project.id));
  }, [navigateToPath, projectPath]);

  const editProject = useCallback((project: Project) => {
    setProjectFormSeed(project);
    navigateToPath(projectsPath());
  }, [navigateToPath, projectsPath]);

  return {
    projects,
    selectedProject,
    projectFormSeed,
    applyProjects,
    loadGuestProjects,
    reset,
    saveProject,
    previewProjectLifecycle,
    applyProjectLifecycle,
    archiveProject,
    reactivateProject,
    openProject,
    editProject,
  };
}
