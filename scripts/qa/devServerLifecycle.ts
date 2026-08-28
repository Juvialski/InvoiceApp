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
    server.listen(port);
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
  const cmd = isWin ? "npx.cmd" : "npx";
  const child = spawn(cmd, ["tsx", "server.ts"], {
    stdio: "ignore",
    detached: false,
    shell: isWin,
    env: { ...process.env, PORT: String(port) },
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
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      killer.on("close", () => resolve());
      killer.on("error", () => resolve());
    });
  } else {
    try {
      child.kill("SIGTERM");
      const start = Date.now();
      let exited = false;
      while (Date.now() - start < 3000) {
        try {
          process.kill(child.pid, 0);
          await new Promise((r) => setTimeout(r, 200));
        } catch {
          exited = true;
          break;
        }
      }
      if (!exited) {
        child.kill("SIGKILL");
      }
    } catch {}
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
