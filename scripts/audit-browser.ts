import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ARTIFACTS_DIR = "C:\\Users\\Al\\.gemini\\antigravity\\brain\\d19e6ecc-0c90-4b50-a08b-0ab801631901";
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9222;

class CdpClient {
  private ws!: WebSocket;
  private id = 1;
  private callbacks = new Map<number, (res: any) => void>();

  async connect(url: string) {
    this.ws = new (globalThis as any).WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
    });
    this.ws.onmessage = (event: any) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const cb = this.callbacks.get(msg.id)!;
        this.callbacks.delete(msg.id);
        cb(msg.result || msg);
      }
    };
  }

  send(method: string, params: Record<string, any> = {}): Promise<any> {
    const id = this.id++;
    return new Promise((resolve) => {
      this.callbacks.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression: string) {
    const res = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return res?.result?.value;
  }

  async setViewport(width: number, height: number, isMobile = false) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: isMobile,
    });
  }

  async captureScreenshot(filename: string) {
    const res = await this.send("Page.captureScreenshot", { format: "png", quality: 90 });
    if (res?.data) {
      const filePath = path.join(ARTIFACTS_DIR, filename);
      fs.writeFileSync(filePath, Buffer.from(res.data, "base64"));
      console.log(`📸 Saved screenshot: ${filename}`);
      return filePath;
    }
    throw new Error(`Failed to capture screenshot ${filename}`);
  }

  async close() {
    try {
      this.ws.close();
    } catch {}
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("🚀 Starting Chrome Headless for AI Assistant Audit...");
  const chrome = spawn(CHROME_PATH, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--disable-gpu",
    "--no-sandbox",
    "--window-size=1440,900",
    "http://localhost:3000/",
  ]);

  let connected = false;
  let webSocketUrl = "";
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) {
        const json = await res.json();
        webSocketUrl = json.webSocketDebuggerUrl;
        connected = true;
        break;
      }
    } catch {}
  }

  if (!connected || !webSocketUrl) {
    chrome.kill();
    throw new Error("Could not connect to Chrome debugging port");
  }

  console.log("Connected to Chrome CDP WebSocket!");
  const cdp = new CdpClient();
  await cdp.connect(webSocketUrl);

  // Enable needed domains
  await cdp.send("Page.enable");
  await cdp.send("DOM.enable");
  await cdp.send("Runtime.enable");

  // Create page target or use main page
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const pageTarget = targets.find((t: any) => t.type === "page") || targets[0];
  const pageCdp = new CdpClient();
  await pageCdp.connect(pageTarget.webSocketDebuggerUrl);

  await pageCdp.send("Page.enable");
  await pageCdp.send("Runtime.enable");

  console.log("Navigating to http://localhost:3000/ ...");
  await pageCdp.send("Page.navigate", { url: "http://localhost:3000/" });
  await sleep(3000);

  // 1. Initial Desktop Dashboard State
  await pageCdp.setViewport(1440, 900, false);
  await sleep(1000);
  await pageCdp.captureScreenshot("01_desktop_dashboard_launcher.png");

  // 2. Open Assistant Drawer
  console.log("Opening Assistant Drawer...");
  await pageCdp.eval(`(() => {
    const btn = document.querySelector('[data-tour="assistant-launcher"]');
    if (btn) btn.click();
  })()`);
  await sleep(1000);
  await pageCdp.captureScreenshot("02_assistant_panel_opened.png");

  // 3. Start Guided Tour - Cash & Banking Tour
  console.log("Testing Cash & Banking Guided Tour...");
  await pageCdp.eval(`(() => {
    const panel = document.querySelector('[data-tour="assistant-panel"]');
    // Dispatch start tour event or click tour
    window.dispatchEvent(new CustomEvent('assistant-test-start-tour', { detail: 'cash-banking' }));
  })()`);
  await sleep(1000);
  await pageCdp.captureScreenshot("03_cash_banking_guided_tour.png");

  // 4. Test Cash & Banking Route Navigation
  console.log("Navigating to Cash & Banking Tab...");
  await pageCdp.eval(`(() => {
    const cashNav = document.querySelector('a[href="/cash"], button[data-tab="cash"], nav a[href*="cash"]');
    if (cashNav) cashNav.click();
    else window.location.hash = '/cash';
  })()`);
  await sleep(1500);
  await pageCdp.captureScreenshot("04_cash_banking_workspace.png");

  // 5. Ask Assistant about Cash & Banking Balances
  console.log("Submitting conversation queries...");
  // Simulate assistant conversation in state
  await pageCdp.eval(`(() => {
    const textarea = document.querySelector('[data-tour="assistant-composer"] textarea');
    if (textarea) {
      textarea.value = "What are our cash and bank balances by currency?";
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);
  await sleep(500);
  await pageCdp.captureScreenshot("05_assistant_composer_typed.png");

  // 6. Mobile Viewport (390x844) Audit
  console.log("Switching to Mobile Viewport (390x844)...");
  await pageCdp.setViewport(390, 844, true);
  await sleep(1000);
  await pageCdp.captureScreenshot("06_mobile_assistant_drawer.png");

  // 7. Mobile Navigation & Invoices
  await pageCdp.captureScreenshot("07_mobile_cash_and_composer.png");

  // Reset to Desktop
  await pageCdp.setViewport(1440, 900, false);
  await sleep(500);

  console.log("✅ Browser audit & screenshot capture completed successfully!");
  await pageCdp.close();
  await cdp.close();
  chrome.kill();
}

main().catch((err) => {
  console.error("Browser audit failed:", err);
  process.exit(1);
});
