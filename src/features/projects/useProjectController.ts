import { useCallback, useEffect, useMemo, useState } from "react";
import type { Project } from "../../types.ts";
import {
  archiveProjectInSupabase,
  readProjectsFromLocal,
  saveProjectToSupabase,
  writeProjectsToLocal,
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
  archiveProject: (project: Project) => Promise<void>;
  openProject: (project: Project) => void;
  editProject: (project: Project) => void;
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

  const archiveProject = useCallback(async (project: Project) => {
    try {
      const archived = authenticated
        ? await archiveProjectInSupabase(project.id)
        : {
            ...project,
            status: "ARCHIVED" as const,
            archivedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
      setProjects((current) => current.map((item) => item.id === archived.id ? archived : item));
      onPayrollRelevantChange();
      onSuccess(`${project.projectCode} archived. Historical allocations remain visible.`);
    } catch (error) {
      onError(error, "Could not archive project.");
    }
  }, [authenticated, onError, onPayrollRelevantChange, onSuccess]);

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
    archiveProject,
    openProject,
    editProject,
  };
}
