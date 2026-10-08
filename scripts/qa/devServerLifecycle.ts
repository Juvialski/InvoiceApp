import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";

export interface DevServerOptions {
  port?: number;
  baseUrl?: string;
  startupPath?: string;
  timeoutMs?: number;
}

export async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err: any) => {
      if (err.code === "EADDRINUSE") resolve(true);
      else resolve(false);
    });
    server.once("listening", () => {
      server.once("close", () => resolve(false)).close();
    });
    // Match the app server's IPv4 bind on Windows as well as POSIX.
    server.listen(port, "0.0.0.0");
  });
}

export async function isServerReady(baseUrl: string, path = "/workflow-map", timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

function signalPosixProcessGroup(pid: number, signal: NodeJS.Signals | 0): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error: any) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

export async function startDevServer(options: DevServerOptions = {}): Promise<ChildProcess> {
  const port = options.port ?? 3000;
  const baseUrl = options.baseUrl ?? `http://localhost:${port}`;
  const startupPath = options.startupPath ?? "/workflow-map";
  const timeoutMs = options.timeoutMs ?? 30000;

  // Safety rule: Do not silently reuse an existing server on the target port
  const portUsed = await isPortInUse(port);
  const serverResponding = await isServerReady(baseUrl, startupPath);
  if (portUsed || serverResponding) {
    throw new Error(
      `Port ${port} is already occupied before test run. To prevent testing against stale code or terminating unrelated processes, please stop the existing process on port ${port} before running visual QA.`
    );
  }

  const isWin = process.platform === "win32";
  // QA does not need HMR or an app-wide watcher (including ignored renders).
  const childEnv: NodeJS.ProcessEnv = { ...process.env, PORT: String(port), DISABLE_HMR: "true" };
  // A QA server is a standalone process, not a nested node:test worker.
  delete childEnv.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
    stdio: "ignore",
    windowsHide: true,
    // On POSIX, own a dedicated process group so cleanup can terminate the
    // server plus any Node/esbuild descendants without touching an
    // unrelated process that happens to use the same port later.
    detached: !isWin,
    shell: false,
    env: childEnv,
  });

  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    await new Promise((r) => setTimeout(r, 600));
    if (await isServerReady(baseUrl, startupPath)) {
      return child;
    }
  }

  await terminateChildServer(child, { port, baseUrl, timeoutMs: 5000 });
  throw new Error(`Timeout waiting for dev server to start at ${baseUrl} within ${timeoutMs}ms`);
}

export async function terminateChildServer(
  child: ChildProcess | null,
  options: DevServerOptions = {},
): Promise<void> {
  if (!child || !child.pid) return;

  const port = options.port ?? 3000;
  const baseUrl = options.baseUrl ?? `http://localhost:${port}`;
  const startupPath = options.startupPath ?? "/workflow-map";
  const timeoutMs = options.timeoutMs ?? 5000;

  const isWin = process.platform === "win32";

  if (isWin) {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
      killer.on("close", () => resolve());
      killer.on("error", () => resolve());
    });
  } else {
    try {
      let groupAlive = signalPosixProcessGroup(child.pid, "SIGTERM");
      const graceStart = Date.now();
      while (groupAlive && Date.now() - graceStart < 3000) {
        await new Promise((r) => setTimeout(r, 200));
        groupAlive = signalPosixProcessGroup(child.pid, 0);
      }
      if (groupAlive) {
        signalPosixProcessGroup(child.pid, "SIGKILL");
      }
    } catch {
      // The final port/server verification below is authoritative. If a
      // process-group signal unexpectedly fails, cleanup must still fail
      // closed rather than claiming success.
    }
  }

  // Bounded polling loop to guarantee port is completely released
  const releaseStart = Date.now();
  while (Date.now() - releaseStart < timeoutMs) {
    const portBusy = await isPortInUse(port);
    const serverActive = await isServerReady(baseUrl, startupPath);
    if (!portBusy && !serverActive) {
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  // If timeout expired and port/server is still busy, throw explicitly
  const finalPortBusy = await isPortInUse(port);
  const finalServerActive = await isServerReady(baseUrl, startupPath);
  if (finalPortBusy || finalServerActive) {
    throw new Error(
      `Dev server process (PID ${child.pid}) or port ${port} remained active after ${timeoutMs}ms cleanup timeout.`
    );
  }
}
