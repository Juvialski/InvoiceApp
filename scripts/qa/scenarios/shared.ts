import type { QaAssertion, QaBrowserPage, QaScenarioAction } from "../structuredEvidence.ts";

export const openMobileNavigation: QaScenarioAction = async (page) => {
  const opener = page.getByRole("button", { name: "Open navigation", exact: true });
  await opener.press("Enter");
  await waitForVisible(page, 'button[aria-label="Close navigation"]');
  const count = await page.locator('button[aria-label="Close navigation"]').count();
  const focusEntered = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Close navigation");
  await page.keyboard.press("Escape");
  const focusRestored = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Open navigation");
  await opener.press("Enter");
  await waitForVisible(page, 'button[aria-label="Close navigation"]');
  return [
    { id: "mobile-navigation-visible", passed: count > 0, details: `close-navigation controls: ${count}` },
    { id: "mobile-navigation-focus-entered", passed: focusEntered, details: `focus entered drawer: ${focusEntered}` },
    { id: "mobile-navigation-focus-restored", passed: focusRestored, details: `focus restored to opener: ${focusRestored}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyPageHeaderHelpAction: QaScenarioAction = async (page) => {
  const isCash = page.url().includes("/cash");
  const expectedTopic = isCash ? "Cash & Banking" : "Projects and project costing";
  const expectedRoute = isCash ? "/cash" : "/projects";
  const helpLink = page.getByRole("link", { name: `Help with ${expectedTopic}`, exact: true });
  const before = await helpLink.count();
  await helpLink.first().click();
  await waitForHeading(page, expectedTopic);
  const article = await page.getByRole("heading", { name: expectedTopic, exact: true }).count();
  const articlePath = page.url();
  await page.goBack();
  await page.getByRole("link", { name: `Help with ${expectedTopic}`, exact: true }).first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  return [
    { id: "page-header-help-action-visible", passed: before === 1, details: `route Help actions: ${before}` },
    { id: "page-header-help-action-opens-topic", passed: article === 1 && articlePath.includes("/help?topic="), details: `article headings: ${article}; path: ${articlePath}` },
    { id: "page-header-help-action-history-returns", passed: page.url().includes(expectedRoute), details: `returned path: ${page.url()}` },
  ] satisfies readonly QaAssertion[];
};
export const openDemoTour: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Demo Tour", exact: true }).first().click();
  await page.getByRole("dialog", { name: /Demo Tour$/i }).first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const count = await page.getByRole("dialog", { name: /Demo Tour$/i }).count();
  return [{ id: "demo-tour-visible", passed: count === 1, details: `tour panels: ${count}` } satisfies QaAssertion];
};
export const applyLightTheme: QaScenarioAction = (page) => applyThemePreferenceForVisualQa(page, "light");
export const applyDarkTheme: QaScenarioAction = (page) => applyThemePreferenceForVisualQa(page, "dark");
export const verifyDemoWorkspaceChrome: QaScenarioAction = async (page) => {
  const banner = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>("[data-demo-workspace-banner]");
    const safeStatus = document.querySelector<HTMLElement>("[data-demo-safe-status]");
    return {
      height: header?.getBoundingClientRect().height ?? null,
      bannerText: header?.innerText || "",
      safeStatusText: safeStatus?.innerText || "",
      viewportWidth: window.innerWidth,
      tourTriggerCount: Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter((button) => {
        const label = button.getAttribute("aria-label") || button.innerText.trim();
        return ["Open demo tour", "Demo Tour"].includes(label) && button.getClientRects().length > 0;
      }).length,
    };
  });
  const toolsSummary = page.locator('[data-demo-tools="true"] summary');
  const toolsCount = await toolsSummary.count();
  if (toolsCount === 1) await toolsSummary.click();
  const options = await page.evaluate(() => {
    const menu = document.querySelector<HTMLElement>("[data-demo-tools-menu]");
    return menu ? (menu.innerText || "") : "";
  });
  return [
    { id: "demo-workspace-banner-compact", passed: banner.height !== null && banner.height <= 100, details: `demo banner height: ${banner.height ?? "missing"}px` },
    { id: "demo-workspace-banner-does-not-repeat-sidebar-company", passed: !/Hydroqualisense Solutions Corp/i.test(banner.bannerText), details: `company identity in demo toolbar: ${/Hydroqualisense Solutions Corp/i.test(banner.bannerText) ? "repeated" : "sidebar only"}` },
    { id: "demo-data-boundary-stays-visible", passed: /Isolated demo/.test(banner.safeStatusText) && /production authentication/i.test(banner.safeStatusText), details: banner.safeStatusText || "demo safety status missing" },
    { id: "demo-tools-actions-remain-accessible", passed: toolsCount === 1 && /Documents/.test(options) && /AI Assistant/.test(options) && /Reset/.test(options), details: `tools disclosure: ${toolsCount}; options: ${options.replace(/\s+/g, " ").trim() || "missing"}` },
    { id: "demo-tour-remains-reachable-without-duplicate-launchers", passed: banner.viewportWidth < 640 ? /Tour/.test(options) : banner.tourTriggerCount === 1, details: `visible Tour launchers: ${banner.tourTriggerCount}; phone menu includes Tour: ${/Tour/.test(options)}` },
  ] satisfies readonly QaAssertion[];
};
export function verifyPageHeaderActionVariants(expected: readonly { label: string; variant: "primary" | "secondary" | "ghost" | "destructive" }[]): QaScenarioAction {
  return async (page) => {
    const actions = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLButtonElement>('[data-ui="page-header-actions"] button')).map((button) => ({
      label: (button.innerText || button.textContent || "").replace(/\s+/g, " ").trim(),
      variant: button.getAttribute("data-variant"),
    })));
    const primaryCount = actions.filter((action) => action.variant === "primary").length;
    return [
      ...expected.map((entry) => {
        const button = actions.find((action) => action.label === entry.label);
        return { id: `page-header-${entry.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${entry.variant}`, passed: button?.variant === entry.variant, details: `${entry.label}: ${button?.variant || "unclassified"}` } satisfies QaAssertion;
      }),
      { id: "page-header-at-most-one-primary", passed: primaryCount <= 1, details: `primary-filled actions: ${primaryCount}` },
    ];
  };
}
export function r4eThemeAction(preference: "light" | "dark" | "system-light" | "system-dark"): QaScenarioAction {
  return async (page) => {
    const themeAssertions = preference === "system-light"
      ? await verifyR4eSystemLight(page)
      : preference === "system-dark"
        ? await verifyR4eSystemDark(page)
        : preference === "dark"
          ? await applyDarkTheme(page)
          : await applyLightTheme(page);
    const shellAssertions = (await verifyR4eResponsiveShell(page)) || [];
    return [...(themeAssertions || []), ...shellAssertions];
  };
}
export const verifyR4eDarkRouteAudit: QaScenarioAction = async (page) => {
  const themeAssertions = (await applyDarkTheme(page)) || [];
  const shellAssertions = (await verifyR4eResponsiveShell(page)) || [];
  return [...themeAssertions, ...shellAssertions];
};
export const verifyR4eKeyboardAccountNavigation: QaScenarioAction = async (page) => {
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return { tag: "none", focusVisible: false, outline: "none" };
    const style = getComputedStyle(active);
    return {
      tag: active.tagName,
      focusVisible: active.matches(":focus-visible"),
      outline: `${style.outlineStyle} ${style.outlineWidth}`,
      boxShadow: style.boxShadow,
    };
  });
  const accountTrigger = page.locator('[aria-controls="sidebar-account-menu"]').first();
  await accountTrigger.click();
  const accountMenu = page.getByRole("menu", { name: "Account menu", exact: true });
  await accountMenu.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const settingsItem = await page.getByRole("menuitem", { name: "Workspace Settings", exact: true }).count();
  await page.keyboard.press("Escape");
  await accountMenu.waitFor({ state: "detached", timeout: READY_TIMEOUT_MS });
  const restoredFocus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || "");
  return [
    { id: "r4e-keyboard-visible-focus", passed: focus.focusVisible && (focus.outline.includes("2px") || focus.boxShadow !== "none"), details: `Tab focused ${focus.tag}; focus-visible=${focus.focusVisible}; outline=${focus.outline}` },
    { id: "r4e-sidebar-account-menu", passed: settingsItem === 1, details: `workspace settings menu items: ${settingsItem}` },
    { id: "r4e-account-menu-escape-focus-return", passed: restoredFocus.startsWith("Account"), details: `restored focus aria-label: ${restoredFocus || "missing"}` },
  ];
};
export const verifyR4eMobileNavigationAndAccount: QaScenarioAction = async (page) => {
  const nav = page.getByRole("button", { name: "Open navigation", exact: true });
  const target = await page.evaluate(() => {
    const element = document.querySelector<HTMLElement>('[data-app-shell-header="true"] button[aria-label="Open navigation"]');
    const rect = element?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  });
  await nav.click();
  const drawer = page.getByRole("dialog", { name: "Workspace navigation", exact: true });
  await drawer.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const accountTrigger = page.locator('#workspace-navigation-drawer [aria-controls="sidebar-account-menu"]').first();
  await accountTrigger.click();
  const menu = page.getByRole("menu", { name: "Account menu", exact: true });
  await menu.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const settingsItem = await page.getByRole("menuitem", { name: "Workspace Settings", exact: true }).count();
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached", timeout: READY_TIMEOUT_MS });
  const accountFocus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || "");
  const drawerRemainsOpen = await drawer.count();
  await page.keyboard.press("Escape");
  await drawer.waitFor({ state: "detached", timeout: READY_TIMEOUT_MS });
  const navigationFocus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || "");
  return [
    { id: "r4e-mobile-nav-touch-target", passed: target.width >= 40 && target.height >= 40, details: `navigation target: ${target.width}x${target.height}px` },
    { id: "r4e-mobile-navigation-drawer-opens", passed: true, details: "navigation drawer opened as a labelled modal dialog" },
    { id: "r4e-mobile-account-settings-reachable", passed: settingsItem === 1, details: `workspace settings menu items: ${settingsItem}` },
    { id: "r4e-mobile-account-escape-focus-return", passed: accountFocus.startsWith("Account"), details: `restored focus aria-label: ${accountFocus || "missing"}` },
    { id: "r4e-mobile-account-menu-does-not-close-drawer", passed: drawerRemainsOpen === 1, details: `drawer dialog count after closing account menu: ${drawerRemainsOpen}` },
    { id: "r4e-mobile-navigation-escape-focus-return", passed: navigationFocus === "Open navigation", details: `restored focus aria-label: ${navigationFocus || "missing"}` },
  ];
};
export const READY_TIMEOUT_MS = 30_000;
export async function applyThemePreferenceForVisualQa(page: QaBrowserPage, theme: "light" | "dark"): Promise<readonly QaAssertion[]> {
  if (theme === "light") {
    await page.evaluate(() => window.localStorage.setItem("hydroqualisense_theme_preference", "light"));
  } else {
    await page.evaluate(() => window.localStorage.setItem("hydroqualisense_theme_preference", "dark"));
  }
  await page.reload({ waitUntil: "networkidle", timeout: READY_TIMEOUT_MS });
  await page.getByRole("heading").first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });

  const palette = await page.evaluate(() => {
    const surface = document.querySelector(".hqs-surface, .hqs-surface-raised");
    const canvas = document.querySelector<HTMLElement>(".hqs-app-canvas");
    const control = document.querySelector(".hqs-input, .hqs-control");
    const secondaryProbe = document.createElement("span");
    secondaryProbe.className = "hqs-secondary-text";
    secondaryProbe.textContent = "temporary secondary text probe";
    canvas?.append(secondaryProbe);
    const secondaryTextColor = canvas ? getComputedStyle(secondaryProbe).color : "missing";
    secondaryProbe.remove();
    return {
      theme: document.documentElement.getAttribute("data-theme"),
      canvasBackground: canvas ? getComputedStyle(canvas).backgroundColor : "missing",
      surfaceBackground: surface ? getComputedStyle(surface).backgroundColor : "missing",
      primaryText: canvas ? getComputedStyle(canvas).color : "missing",
      secondaryText: secondaryTextColor,
      controlBorder: control ? getComputedStyle(control).borderColor : "missing",
    };
  });
  const expectedCanvas = theme === "dark" ? "rgb(15, 23, 42)" : "rgb(248, 250, 252)";
  const expectedSurface = theme === "dark" ? "rgb(30, 41, 59)" : "rgb(255, 255, 255)";
  const expectedPrimary = theme === "dark" ? "rgb(248, 250, 252)" : "rgb(15, 23, 42)";
  const expectedSecondary = theme === "dark" ? "rgb(148, 163, 184)" : "rgb(71, 85, 105)";
  const expectedBorder = theme === "dark" ? "rgb(148, 163, 184)" : "rgb(100, 116, 139)";
  return [
    { id: `${theme}-theme-root-preference`, passed: palette.theme === theme, details: `data-theme=${palette.theme || "system"}` },
    { id: `${theme}-theme-app-canvas`, passed: palette.canvasBackground === expectedCanvas, details: `app canvas: ${palette.canvasBackground}` },
    { id: `${theme}-theme-primary-surface`, passed: palette.surfaceBackground === expectedSurface, details: `surface background: ${palette.surfaceBackground}` },
    { id: `${theme}-theme-primary-text`, passed: palette.primaryText === expectedPrimary, details: `primary text: ${palette.primaryText}` },
    { id: `${theme}-theme-secondary-text`, passed: palette.secondaryText === expectedSecondary, details: `secondary text: ${palette.secondaryText}` },
    { id: `${theme}-theme-control-border`, passed: palette.controlBorder === expectedBorder, details: `control border: ${palette.controlBorder}` },
  ];
}
export async function applySystemThemeForVisualQa(page: QaBrowserPage, systemScheme: "light" | "dark"): Promise<readonly QaAssertion[]> {
  await page.emulateMedia({ colorScheme: systemScheme });
  await page.evaluate(() => window.localStorage.setItem("hydroqualisense_theme_preference", "system"));
  await page.reload({ waitUntil: "networkidle", timeout: READY_TIMEOUT_MS });
  await page.getByRole("heading").first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });

  const palette = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>(".hqs-app-canvas");
    const surface = document.querySelector<HTMLElement>(".hqs-surface, .hqs-surface-raised");
    const probe = document.createElement("span");
    probe.className = "hqs-secondary-text";
    canvas?.append(probe);
    const secondaryText = canvas ? getComputedStyle(probe).color : "missing";
    probe.remove();
    return {
      preference: window.localStorage.getItem("hydroqualisense_theme_preference"),
      rootTheme: document.documentElement.getAttribute("data-theme"),
      osScheme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
      canvasBackground: canvas ? getComputedStyle(canvas).backgroundColor : "missing",
      surfaceBackground: surface ? getComputedStyle(surface).backgroundColor : "missing",
      primaryText: canvas ? getComputedStyle(canvas).color : "missing",
      secondaryText,
    };
  });
  const expectedCanvas = systemScheme === "dark" ? "rgb(15, 23, 42)" : "rgb(248, 250, 252)";
  const expectedSurface = systemScheme === "dark" ? "rgb(30, 41, 59)" : "rgb(255, 255, 255)";
  const expectedPrimary = systemScheme === "dark" ? "rgb(248, 250, 252)" : "rgb(15, 23, 42)";
  const expectedSecondary = systemScheme === "dark" ? "rgb(148, 163, 184)" : "rgb(71, 85, 105)";
  return [
    { id: `system-${systemScheme}-preference-retained`, passed: palette.preference === "system", details: `stored preference: ${palette.preference || "missing"}` },
    { id: `system-${systemScheme}-root-follows-os`, passed: palette.rootTheme === null && palette.osScheme === systemScheme, details: `data-theme=${palette.rootTheme || "unset"}; OS=${palette.osScheme}` },
    { id: `system-${systemScheme}-canvas-follows-os`, passed: palette.canvasBackground === expectedCanvas, details: `app canvas: ${palette.canvasBackground}` },
    { id: `system-${systemScheme}-surface-follows-os`, passed: palette.surfaceBackground === expectedSurface, details: `surface background: ${palette.surfaceBackground}` },
    { id: `system-${systemScheme}-primary-text-follows-os`, passed: palette.primaryText === expectedPrimary, details: `primary text: ${palette.primaryText}` },
    { id: `system-${systemScheme}-secondary-text-follows-os`, passed: palette.secondaryText === expectedSecondary, details: `secondary text: ${palette.secondaryText}` },
  ];
}
export const verifyR4eSystemLight: QaScenarioAction = (page) => applySystemThemeForVisualQa(page, "light");
export const verifyR4eSystemDark: QaScenarioAction = (page) => applySystemThemeForVisualQa(page, "dark");
export const verifyR4eResponsiveShell: QaScenarioAction = async (page) => {
  const shell = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('[data-app-shell-header="true"]');
    const main = document.querySelector<HTMLElement>('[data-app-shell-main="true"]');
    const nav = document.querySelector<HTMLElement>('[data-app-shell-header="true"] button[aria-label="Open navigation"]');
    const navRect = nav?.getBoundingClientRect();
    return {
      headerDisplay: header ? getComputedStyle(header).display : "missing",
      mainPresent: Boolean(main && main.getBoundingClientRect().width > 0),
      navigationTargetWidth: navRect?.width ?? 0,
      navigationTargetHeight: navRect?.height ?? 0,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  const mobileHeaderExpected = shell.viewportWidth < 1024;
  return [
    { id: "r4e-app-main-visible", passed: shell.mainPresent, details: `main content visible at ${shell.viewportWidth}px` },
    { id: "r4e-shell-header-breakpoint", passed: shell.headerDisplay !== "missing" && (mobileHeaderExpected ? shell.headerDisplay !== "none" : shell.headerDisplay === "none"), details: `header display: ${shell.headerDisplay} at ${shell.viewportWidth}px` },
    ...(mobileHeaderExpected ? [{ id: "r4e-mobile-navigation-touch-target", passed: shell.navigationTargetWidth >= 40 && shell.navigationTargetHeight >= 40, details: `navigation target: ${shell.navigationTargetWidth}x${shell.navigationTargetHeight}px` }] : []),
  ];
};
export function relativeLuminance(color: string): number {
  const channels = color.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) return 0;
  const linear = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}
export function compositeCssColor(foreground: string, background: string): string {
  const parse = (value: string) => {
    const numbers = value.match(/\d+(?:\.\d+)?/g)?.map(Number);
    if (!numbers || numbers.length < 3) return null;
    const isSrgbFunction = value.startsWith("color(srgb");
    const channels = numbers.slice(0, 3).map((channel) => isSrgbFunction ? channel * 255 : channel);
    const alpha = numbers.length > 3 ? numbers[3]! : 1;
    return { channels, alpha };
  };
  const front = parse(foreground);
  const back = parse(background);
  if (!front || !back) return "missing";
  const alpha = front.alpha + back.alpha * (1 - front.alpha);
  const channels = front.channels.map((channel, index) => Math.round((channel * front.alpha + back.channels[index]! * back.alpha * (1 - front.alpha)) / alpha));
  return `rgb(${channels.join(", ")})`;
}
export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
export async function verifyEntityMediaThumbnails(page: QaBrowserPage, label: string): Promise<readonly QaAssertion[]> {
  await page.locator('[data-entity-media-thumbnail="true"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await page.locator('[data-entity-media-thumbnail="true"][data-entity-media-fallback="false"] img').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const total = await page.locator('[data-entity-media-thumbnail="true"]').count();
  const withImage = await page.locator('[data-entity-media-thumbnail="true"][data-entity-media-fallback="false"] img').count();
  const fallback = await page.locator('[data-entity-media-thumbnail="true"][data-entity-media-fallback="true"]').count();
  return [
    { id: `${label}-media-thumbnail-visible`, passed: total > 0, details: `${label} thumbnail containers: ${total}` },
    { id: `${label}-with-image-visible`, passed: withImage > 0, details: `${label} image previews: ${withImage}` },
    { id: `${label}-fallback-visible`, passed: fallback > 0, details: `${label} fallback previews: ${fallback}` },
  ];
}
export async function waitForVisible(page: QaBrowserPage, selector: string, timeout = READY_TIMEOUT_MS) {
  await page.locator(selector).first().waitFor({ state: "visible", timeout });
}
export async function waitForHeading(page: QaBrowserPage, name: string | RegExp, timeout = READY_TIMEOUT_MS) {
  await page.getByRole("heading", typeof name === "string" ? { name, exact: true } : { name }).first().waitFor({ state: "visible", timeout });
}
export function assertHeading(name: string | RegExp, assertionId: string): QaScenarioAction {
  return async (page) => {
    const count = await page.getByRole("heading", typeof name === "string" ? { name, exact: true } : { name }).count();
    return [{ id: assertionId, passed: count > 0, details: `matching headings: ${count}` } satisfies QaAssertion];
  };
}
export const sharedScenarioActions: Readonly<Record<string, QaScenarioAction>> = {
  applyDarkTheme,
  applyLightTheme,
  openDemoTour,
  openMobileNavigation,
  verifyDemoWorkspaceChrome,
  verifyPageHeaderHelpAction,
  verifyR4eDarkRouteAudit,
  verifyR4eKeyboardAccountNavigation,
  verifyR4eMobileNavigationAndAccount,
  verifyR4eResponsiveShell,
  "verifyPageHeaderActionVariants:cash": verifyPageHeaderActionVariants([{ label: "Executive Dashboard", variant: "ghost" }, { label: "Add account", variant: "primary" }]),
  "verifyPageHeaderActionVariants:expenses": verifyPageHeaderActionVariants([{ label: "Upload supplier invoice", variant: "secondary" }, { label: "Add expense", variant: "primary" }]),
  "verifyPageHeaderActionVariants:equipment": verifyPageHeaderActionVariants([{ label: "Add Equipment", variant: "primary" }]),
  "verifyPageHeaderActionVariants:warehouse": verifyPageHeaderActionVariants([{ label: "Add item", variant: "primary" }, { label: "Opening stock", variant: "secondary" }]),
  "verifyPageHeaderActionVariants:procurement": verifyPageHeaderActionVariants([{ label: "New Purchase Order", variant: "primary" }]),
  "r4eThemeAction:light": r4eThemeAction("light"),
  "r4eThemeAction:dark": r4eThemeAction("dark"),
  "r4eThemeAction:system-light": r4eThemeAction("system-light"),
  "r4eThemeAction:system-dark": r4eThemeAction("system-dark"),
};
