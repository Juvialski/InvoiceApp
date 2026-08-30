import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DemoLandingPage } from "./DemoLandingPage.tsx";
import { DemoWorkspace } from "./DemoWorkspace.tsx";
import { DemoWorkspaceProvider, useDemoWorkspace } from "./DemoWorkspaceProvider.tsx";
import { DEMO_ROOT_PATH, demoPathForTab, parseDemoLocation } from "./demoRouting.ts";

function DemoRootContent() {
  const { setTourOpen } = useDemoWorkspace();
  const [navigationRevision, setNavigationRevision] = useState(0);
  const location = useMemo(() => parseDemoLocation(window.location.pathname, window.location.search), [navigationRevision]);

  useEffect(() => {
    const handlePopState = () => setNavigationRevision((value) => value + 1);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((path: string, replace = false) => {
    if (!(path === DEMO_ROOT_PATH || path.startsWith(`${DEMO_ROOT_PATH}/`))) {
      throw new Error("Demo navigation cannot leave the isolated /demo route namespace.");
    }
    window.history[replace ? "replaceState" : "pushState"]({}, "", path);
    setNavigationRevision((value) => value + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (location.kind === "landing") {
    return (
      <DemoLandingPage
        onLaunch={() => navigate(demoPathForTab("dashboard"))}
        onStartTour={() => { setTourOpen(true); navigate(demoPathForTab("dashboard")); }}
      />
    );
  }

  return <DemoWorkspace location={location} onNavigate={navigate} />;
}

export default function DemoRoot() {
  return <DemoWorkspaceProvider><DemoRootContent /></DemoWorkspaceProvider>;
}
