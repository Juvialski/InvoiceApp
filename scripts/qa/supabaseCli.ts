import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SupabaseCliInvocation {
  executable: string;
  args: string[];
}

/**
 * Use the pinned setup-cli binary in protected CI when requested. Local
 * Windows development keeps the existing npx.cmd/ComSpec fallback because a
 * standalone Supabase binary is not assumed to exist on the operator PATH.
 */
export function supabaseCliInvocation(args: readonly string[]): SupabaseCliInvocation {
  const configuredBinary = String(process.env.SUPABASE_CLI_BIN || "").trim();
  if (configuredBinary) return { executable: configuredBinary, args: [...args] };

  const cliArgs = ["supabase", ...args];
  if (process.platform === "win32") {
    return {
      executable: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "npx.cmd", ...cliArgs],
    };
  }
  return { executable: "npx", args: cliArgs };
}

export function runSupabaseCliSync(args: readonly string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const invocation = supabaseCliInvocation(args);
  execFileSync(invocation.executable, invocation.args, { cwd: options.cwd, env: options.env, stdio: "inherit" });
}

export async function runSupabaseCli(args: readonly string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const invocation = supabaseCliInvocation(args);
  return execFileAsync(invocation.executable, invocation.args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
}
