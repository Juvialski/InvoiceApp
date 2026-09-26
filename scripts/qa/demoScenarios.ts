import {
  defineQaScenario,
  QA_VIEWPORTS,
  type QaAssertion,
  type QaBrowserPage,
  type QaScenarioAction,
  type QaScenarioDefinition,
} from "./structuredEvidence.ts";

const PROJECT_ROOT = "/demo/app/projects/demo-project-warehouse";
const READY_TIMEOUT_MS = 30_000;
const R4C_VIEWPORTS = [
  { name: "r4c-desktop-1440", width: 1440, height: 1000 },
  { name: "r4c-laptop-1280", width: 1280, height: 800 },
  { name: "r4c-tablet-768", width: 768, height: 1024 },
  { name: "r4c-phone-390", width: 390, height: 844 },
] as const;
const R4E_VIEWPORTS = [
  { name: "r4e-desktop-1440", width: 1440, height: 1000 },
  { name: "r4e-laptop-1280", width: 1280, height: 800 },
  { name: "r4e-tablet-768", width: 768, height: 1024 },
  { name: "r4e-phone-390", width: 390, height: 844 },
] as const;
const UX_EDIT_1A_VIEWPORTS = [
  { name: "ux-edit-desktop-1440", width: 1440, height: 900 },
  { name: "ux-edit-laptop-1280", width: 1280, height: 800 },
  { name: "ux-edit-tablet-768", width: 768, height: 1024 },
  { name: "ux-edit-phone-390", width: 390, height: 844 },
] as const;
const R4D_CONSTRAINED_LAPTOP = { name: "r4d-laptop-1280", width: 1280, height: 800 } as const;
const R4D_TABLET = { name: "r4d-tablet-768", width: 768, height: 1024 } as const;

async function applyThemePreferenceForVisualQa(page: QaBrowserPage, theme: "light" | "dark"): Promise<readonly QaAssertion[]> {
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

const applyLightTheme: QaScenarioAction = (page) => applyThemePreferenceForVisualQa(page, "light");
const applyDarkTheme: QaScenarioAction = (page) => applyThemePreferenceForVisualQa(page, "dark");

async function applySystemThemeForVisualQa(page: QaBrowserPage, systemScheme: "light" | "dark"): Promise<readonly QaAssertion[]> {
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

const verifyR4eSystemLight: QaScenarioAction = (page) => applySystemThemeForVisualQa(page, "light");
const verifyR4eSystemDark: QaScenarioAction = (page) => applySystemThemeForVisualQa(page, "dark");

const verifyR4eResponsiveShell: QaScenarioAction = async (page) => {
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

const verifyR4eKeyboardAccountNavigation: QaScenarioAction = async (page) => {
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

const verifyR4eMobileNavigationAndAccount: QaScenarioAction = async (page) => {
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

function relativeLuminance(color: string): number {
  const channels = color.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) return 0;
  const linear = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function compositeCssColor(foreground: string, background: string): string {
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

function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const verifyR4eLegacySurfaceContrast: QaScenarioAction = async (page) => {
  const themeAssertions = await applyThemePreferenceForVisualQa(page, "dark");
  const colors = await page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('[data-app-shell="true"]');
    if (!app) return null;
    const surface = Array.from(app.querySelectorAll<HTMLElement>(".hqs-surface, .hqs-surface-raised, section.bg-white, article.bg-white, div.bg-white")).find((candidate) => getComputedStyle(candidate).display !== "none" && candidate.getClientRects().length > 0);
    const main = app.querySelector<HTMLElement>('[data-app-shell-main="true"]');
    const control = app.querySelector<HTMLElement>("input, select, textarea");
    if (!surface || !main || !control) return null;
    const semanticProbe = document.createElement("span");
    semanticProbe.className = "hqs-primary-text";
    semanticProbe.textContent = "temporary theme contrast probe";
    surface.prepend(semanticProbe);
    const swatchSurface = document.createElement("div");
    swatchSurface.className = "bg-white";
    const successFill = document.createElement("div");
    successFill.className = "bg-emerald-50";
    const successText = document.createElement("span");
    successText.className = "text-emerald-950";
    successText.textContent = "status";
    successFill.append(successText);
    const accentFill = document.createElement("div");
    accentFill.className = "bg-indigo-50";
    const accentText = document.createElement("span");
    accentText.className = "text-indigo-950";
    accentText.textContent = "selected";
    accentFill.append(accentText);
    swatchSurface.append(successFill, accentFill);
    main.append(swatchSurface);
    const swatchBackground = getComputedStyle(swatchSurface).backgroundColor;
    const successBackground = getComputedStyle(successFill).backgroundColor;
    const accentBackground = getComputedStyle(accentFill).backgroundColor;
    const colors = {
      surface: getComputedStyle(surface).backgroundColor,
      foreground: getComputedStyle(semanticProbe).color,
      controlBackground: getComputedStyle(control).backgroundColor,
      controlBorder: getComputedStyle(control).borderTopColor,
      successForeground: getComputedStyle(successText).color,
      successBackground,
      successBackdrop: swatchBackground,
      accentForeground: getComputedStyle(accentText).color,
      accentBackground,
    };
    swatchSurface.remove();
    semanticProbe.remove();
    return colors;
  });
  const headingContrast = colors ? contrastRatio(colors.foreground, colors.surface) : 0;
  const controlContrast = colors ? contrastRatio(colors.controlBorder, colors.controlBackground) : 0;
  const successComposite = colors ? compositeCssColor(colors.successBackground, colors.successBackdrop) : "missing";
  const successContrast = colors ? contrastRatio(colors.successForeground, successComposite) : 0;
  const accentContrast = colors ? contrastRatio(colors.accentForeground, colors.accentBackground) : 0;
  return [...themeAssertions,
    { id: "r4e-dark-legacy-surface-uses-theme", passed: colors?.surface === "rgb(30, 41, 59)", details: `legacy white surface: ${colors?.surface || "missing"}` },
    { id: "r4e-dark-semantic-heading-aa", passed: headingContrast >= 4.5, details: `semantic heading contrast: ${headingContrast.toFixed(2)}:1 (${colors?.foreground || "missing"} on ${colors?.surface || "missing"})` },
    { id: "r4e-dark-success-status-aa", passed: successContrast >= 4.5, details: `success status contrast: ${successContrast.toFixed(2)}:1 (${colors?.successForeground || "missing"} on ${colors?.successBackground || "missing"})` },
    { id: "r4e-dark-selected-accent-aa", passed: accentContrast >= 4.5, details: `selected accent contrast: ${accentContrast.toFixed(2)}:1 (${colors?.accentForeground || "missing"} on ${colors?.accentBackground || "missing"})` },
    { id: "r4e-dark-input-boundary-nontext", passed: controlContrast >= 3, details: `input boundary contrast: ${controlContrast.toFixed(2)}:1 (${colors?.controlBorder || "missing"} on ${colors?.controlBackground || "missing"})` },
  ] satisfies readonly QaAssertion[];
};

const verifyR4eProcurementMetricContrast: QaScenarioAction = async (page) => {
  const themeAssertions = await applyThemePreferenceForVisualQa(page, "dark");
  const colors = await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll<HTMLElement>('[data-app-shell-main="true"] .bg-gradient-to-br')).find((candidate) => candidate.innerText.toLowerCase().includes("active committed"));
    if (!card) return null;
    const label = card.querySelector<HTMLElement>(".text-indigo-700");
    const value = card.querySelector<HTMLElement>(".text-lg");
    const backgroundImage = getComputedStyle(card).backgroundImage;
    return {
      backgroundImage,
      stops: backgroundImage.match(/rgba?\([^)]*\)/g) || [],
      label: label ? getComputedStyle(label).color : "missing",
      value: value ? getComputedStyle(value).color : "missing",
    };
  });
  const labelContrast = colors?.stops.map((stop) => contrastRatio(colors.label, stop)) || [];
  const valueContrast = colors?.stops.map((stop) => contrastRatio(colors.value, stop)) || [];
  const minimumLabelContrast = labelContrast.length ? Math.min(...labelContrast) : 0;
  const minimumValueContrast = valueContrast.length ? Math.min(...valueContrast) : 0;
  return [...themeAssertions,
    { id: "r4e-procurement-active-committed-tile-present", passed: Boolean(colors && colors.stops.length >= 2), details: `gradient stops: ${colors?.backgroundImage || "missing"}` },
    { id: "r4e-procurement-active-committed-label-aa", passed: minimumLabelContrast >= 4.5, details: `minimum label contrast across gradient stops: ${minimumLabelContrast.toFixed(2)}:1` },
    { id: "r4e-procurement-active-committed-value-aa", passed: minimumValueContrast >= 4.5, details: `minimum value contrast across gradient stops: ${minimumValueContrast.toFixed(2)}:1` },
  ] satisfies readonly QaAssertion[];
};

const verifyR4eExpenseRegisterFit: QaScenarioAction = async (page) => {
  const layout = await page.evaluate(() => {
    const section = document.querySelector<HTMLElement>('[data-ux45c="expenses-primary-register"]');
    const cardList = section?.querySelector<HTMLElement>('[aria-label="Expense register cards"]');
    const table = section?.querySelector<HTMLTableElement>('[data-operations-grid] table');
    const scroller = table?.parentElement;
    const actionHeader = table ? Array.from(table.querySelectorAll<HTMLElement>("thead th")).find((header) => header.innerText.trim() === "Actions") : undefined;
    const scrollerRect = scroller?.getBoundingClientRect();
    const actionRect = actionHeader?.getBoundingClientRect();
    return {
      cardsVisible: Boolean(cardList && getComputedStyle(cardList).display !== "none" && cardList.getClientRects().length > 0),
      cardCount: cardList?.querySelectorAll("[data-expense-register-card]").length ?? 0,
      cardDetailsText: cardList?.querySelector<HTMLElement>("[data-expense-register-card]")?.innerText.toLocaleLowerCase() || "",
      tableVisible: Boolean(table && table.getClientRects().length > 0),
      actionColumnVisible: Boolean(scrollerRect && actionRect && actionRect.right <= scrollerRect.right + 1),
      scrollerWidth: scroller?.clientWidth ?? 0,
      tableWidth: table?.scrollWidth ?? 0,
      mode: cardList && getComputedStyle(cardList).display !== "none" ? "cards" : "table",
    };
  });
  return [
    { id: "r4e-expense-register-uses-visible-responsive-path", passed: layout.cardsVisible || (layout.tableVisible && layout.actionColumnVisible), details: `register mode: ${layout.mode}; table ${layout.tableWidth}px inside ${layout.scrollerWidth}px; actions visible: ${layout.actionColumnVisible}` },
    ...(layout.cardsVisible ? [
      { id: "r4e-expense-card-rows-readable", passed: layout.cardCount > 0, details: `expense record cards visible: ${layout.cardCount}` },
      { id: "r4e-expense-card-retains-financial-and-source-detail", passed: ["project", "payee", "source", "amount", "settlement"].every((label) => layout.cardDetailsText.includes(label)), details: `card fields: ${layout.cardDetailsText.replaceAll("\n", " · ").slice(0, 220)}` },
    ] : []),
  ] satisfies readonly QaAssertion[];
};

const verifyR4ePrimaryButtonContrast: QaScenarioAction = async (page) => {
  const themeAssertions = await applyThemePreferenceForVisualQa(page, "dark");
  const button = page.getByRole("button", { name: "Upload supplier invoice", exact: true }).first();
  await button.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const colors = await page.evaluate(() => {
    const element = Array.from(document.querySelectorAll<HTMLElement>('[data-ui="page-header-actions"] button')).find((candidate) => candidate.textContent?.trim() === "Upload supplier invoice");
    return {
      background: element ? getComputedStyle(element).backgroundColor : "missing",
      foreground: element ? getComputedStyle(element).color : "missing",
    };
  });
  const contrast = contrastRatio(colors.foreground, colors.background);
  return [
    ...themeAssertions,
    { id: "r4e-dark-primary-action-uses-accent", passed: colors.background === "rgb(129, 140, 248)", details: `primary action background: ${colors.background}` },
    { id: "r4e-dark-primary-action-uses-on-accent-text", passed: colors.foreground === "rgb(15, 23, 42)", details: `primary action foreground: ${colors.foreground}` },
    { id: "r4e-dark-primary-action-aa", passed: contrast >= 4.5, details: `primary action contrast: ${contrast.toFixed(2)}:1 (${colors.foreground} on ${colors.background})` },
  ] satisfies readonly QaAssertion[];
};

const verifyInvoiceRegisterCompactFilters: QaScenarioAction = async (page) => {
  const toolbarCount = await page.locator('[data-ui="compact-action-bar"]').count();
  const searchCount = await page.getByRole("searchbox", { name: "Search invoices", exact: true }).count()
    + await page.getByRole("textbox", { name: "Search invoices", exact: true }).count();
  const uploadCount = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-ui="page-header-actions"] button')).filter((button) => button.textContent?.trim() === "Upload supplier invoice").length);
  const filterButton = page.getByRole("button", { name: /^Filters/ }).first();
  const filterButtonCount = await filterButton.count();
  let activeChipCount = 0;
  let rowsBefore = 0;
  let rowsFiltered = 0;
  let rowsRestored = 0;
  if (filterButtonCount === 1) {
    await filterButton.click();
    const panel = page.getByRole("dialog", { name: "Filters options", exact: true });
    await panel.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
    const reviewFilter = page.getByRole("combobox", { name: "Review status", exact: true });
    rowsBefore = await page.locator("#invoice-directory-results tbody tr").count();
    await reviewFilter.selectOption("NEEDS_REVIEW");
    const removable = page.getByRole("button", { name: "Remove filter: Review: Needs review", exact: true });
    activeChipCount = await removable.count();
    rowsFiltered = await page.locator("#invoice-directory-results tbody tr").count();
    if (activeChipCount === 1) await removable.click();
    rowsRestored = await page.locator("#invoice-directory-results tbody tr").count();
  }
  return [
    { id: "invoice-register-one-compact-action-bar", passed: toolbarCount === 1, details: `compact action bars: ${toolbarCount}` },
    { id: "invoice-register-search-available", passed: searchCount === 1, details: `invoice search controls: ${searchCount}` },
    { id: "invoice-register-filters-disclosed", passed: filterButtonCount === 1, details: `Filters triggers: ${filterButtonCount}` },
    { id: "invoice-register-upload-primary", passed: uploadCount === 1, details: `Upload primary actions: ${uploadCount}` },
    { id: "invoice-register-active-filter-removable", passed: activeChipCount === 1 && rowsBefore > rowsFiltered && rowsRestored === rowsBefore, details: `rows before/filter/restored: ${rowsBefore}/${rowsFiltered}/${rowsRestored}; removable chips: ${activeChipCount}` },
  ] satisfies readonly QaAssertion[];
};

const verifyInvoiceRegisterPhoneCards: QaScenarioAction = async (page) => {
  const layout = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-invoice-mobile-card="true"]'));
    const firstCard = cards[0];
    const table = document.querySelector<HTMLElement>('section[aria-label="Invoice directory table"]');
    const actionLabels = firstCard ? Array.from(firstCard.querySelectorAll("button")).map((button) => button.getAttribute("aria-label") || button.innerText) : [];
    return {
      cardCount: cards.length,
      firstText: firstCard?.innerText || "",
      openActionCount: actionLabels.filter((label) => /Open invoice/.test(label)).length,
      correctionActionCount: actionLabels.filter((label) => /Review correction options/.test(label)).length,
      tableVisible: Boolean(table && getComputedStyle(table).display !== "none" && table.getClientRects().length),
    };
  });
  return [
    { id: "invoice-register-phone-cards-visible", passed: layout.cardCount > 0, details: `responsive invoice cards: ${layout.cardCount}` },
    { id: "invoice-register-phone-key-fields-visible", passed: /Amount|Project|Date/.test(layout.firstText) && /Needs review|Verified/.test(layout.firstText), details: layout.firstText.slice(0, 240) || "first invoice card is missing" },
    { id: "invoice-register-phone-actions-touchable", passed: layout.openActionCount === 1 && layout.correctionActionCount <= 1, details: `open/correction actions: ${layout.openActionCount}/${layout.correctionActionCount}` },
    { id: "invoice-register-phone-hides-wide-table", passed: !layout.tableVisible, details: `wide invoice table visible: ${layout.tableVisible}` },
  ] satisfies readonly QaAssertion[];
};

const verifyInvoiceFilterSheetPhone: QaScenarioAction = async (page) => {
  const filterButton = page.getByRole("button", { name: /^Filters/ }).first();
  await filterButton.click();
  const panel = page.getByRole("dialog", { name: "Filters options", exact: true });
  await panel.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const closeButton = page.getByRole("button", { name: "Close filters", exact: true });
  const closeButtonCount = await closeButton.count();
  const layout = await page.evaluate(() => {
    const element = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Filters options"]');
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: window.innerHeight,
      containsFocus: element.contains(document.activeElement),
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      overflowY: style.overflowY,
    };
  });
  let panelClosedByButton = false;
  let focusReturnedToTrigger = false;
  if (closeButtonCount === 1) {
    await closeButton.click();
    panelClosedByButton = await page.getByRole("dialog", { name: "Filters options", exact: true }).count() === 0;
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-controls")?.startsWith("advanced-filter-") === true, [], { timeout: READY_TIMEOUT_MS });
    focusReturnedToTrigger = await page.evaluate(() => document.activeElement?.getAttribute("aria-controls")?.startsWith("advanced-filter-") === true);
    await filterButton.click();
    await panel.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  }
  return [
    { id: "invoice-filter-phone-panel-within-viewport", passed: Boolean(layout && layout.left >= 0 && layout.right <= layout.viewportWidth && layout.top >= 0 && layout.bottom <= layout.viewportHeight), details: layout ? `panel bounds ${Math.round(layout.left)},${Math.round(layout.top)}–${Math.round(layout.right)},${Math.round(layout.bottom)} within ${layout.viewportWidth}×${layout.viewportHeight}` : "filter panel is missing" },
    { id: "invoice-filter-phone-first-control-focused", passed: layout?.containsFocus === true, details: `focus inside filter panel: ${layout?.containsFocus ?? false}` },
    { id: "invoice-filter-phone-long-panel-scrollable", passed: Boolean(layout && (layout.scrollHeight <= layout.clientHeight || layout.overflowY === "auto" || layout.overflowY === "scroll")), details: layout ? `panel scroll ${layout.clientHeight}/${layout.scrollHeight}px, overflow-y=${layout.overflowY}` : "filter panel is missing" },
    { id: "invoice-filter-phone-close-button-visible", passed: closeButtonCount === 1, details: `Close filters controls: ${closeButtonCount}` },
    { id: "invoice-filter-phone-close-restores-focus", passed: panelClosedByButton && focusReturnedToTrigger, details: `closed: ${panelClosedByButton}; focus returned: ${focusReturnedToTrigger}` },
  ] satisfies readonly QaAssertion[];
};

const verifyDarkInvoiceFilterSheet: QaScenarioAction = async (page) => {
  const themeAssertions = await applyThemePreferenceForVisualQa(page, "dark");
  const filterAssertions = (await verifyInvoiceFilterSheetPhone(page)) || [];
  const colors = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Filters options"]');
    const control = panel?.querySelector<HTMLElement>("input, select, textarea");
    if (!panel || !control) return null;
    const panelStyle = getComputedStyle(panel);
    const controlStyle = getComputedStyle(control);
    return {
      panelBackground: panelStyle.backgroundColor,
      panelText: panelStyle.color,
      controlBackground: controlStyle.backgroundColor,
      controlText: controlStyle.color,
      controlBorder: controlStyle.borderTopColor,
    };
  });
  const panelTextContrast = colors ? contrastRatio(colors.panelText, colors.panelBackground) : 0;
  const controlTextContrast = colors ? contrastRatio(colors.controlText, colors.controlBackground) : 0;
  const controlBorderContrast = colors ? contrastRatio(colors.controlBorder, colors.controlBackground) : 0;
  return [...themeAssertions, ...filterAssertions,
    { id: "r4e-dark-phone-filter-surface", passed: colors?.panelBackground === "rgb(30, 41, 59)", details: `filter surface: ${colors?.panelBackground || "missing"}` },
    { id: "r4e-dark-phone-filter-text-aa", passed: panelTextContrast >= 4.5, details: `filter text contrast: ${panelTextContrast.toFixed(2)}:1` },
    { id: "r4e-dark-phone-filter-control-aa", passed: controlTextContrast >= 4.5, details: `filter control text contrast: ${controlTextContrast.toFixed(2)}:1` },
    { id: "r4e-dark-phone-filter-control-boundary", passed: controlBorderContrast >= 3, details: `filter control boundary contrast: ${controlBorderContrast.toFixed(2)}:1` },
  ] satisfies readonly QaAssertion[];
};

const verifyPayrollFirstView: QaScenarioAction = async (page) => {
  const layout = await page.evaluate(() => {
    const nextStep = Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,h4")).find((element) => element.textContent?.trim() === "Next step");
    const review = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((element) => element.textContent?.trim() === "Review payroll");
    const reviewRect = review?.getBoundingClientRect();
    const summary = document.querySelector<HTMLElement>("[data-payroll-period-summary]");
    return {
      nextStepTop: nextStep?.getBoundingClientRect().top ?? null,
      reviewButtonInFirstView: Boolean(reviewRect && reviewRect.top >= 0 && reviewRect.bottom <= window.innerHeight),
      navigationButtons: document.querySelectorAll('[data-payroll-navigation="true"] button').length,
      periodSummaryCollapsed: summary?.querySelector("button")?.getAttribute("aria-expanded") === "false",
    };
  });
  return [
    { id: "payroll-next-step-first-view", passed: layout.nextStepTop !== null && layout.nextStepTop < 800, details: `Next step top: ${layout.nextStepTop ?? "missing"}px in 390×844 view` },
    { id: "payroll-primary-next-step-visible", passed: layout.reviewButtonInFirstView, details: `Review payroll button fits first view: ${layout.reviewButtonInFirstView}` },
    { id: "payroll-compact-navigation-preserved", passed: layout.navigationButtons === 7, details: `Payroll navigation buttons: ${layout.navigationButtons}` },
    { id: "payroll-period-summary-progressively-disclosed", passed: layout.periodSummaryCollapsed, details: `Period summary collapsed: ${layout.periodSummaryCollapsed}` },
  ] satisfies readonly QaAssertion[];
};

const verifyEmailComposeFirstView: QaScenarioAction = async (page) => {
  const layout = await page.evaluate(() => {
    const compose = document.querySelector<HTMLElement>('[data-email-compose="true"]');
    const toolbar = compose?.querySelector<HTMLElement>("[data-email-compose-toolbar]");
    const to = compose?.querySelector<HTMLElement>('input[placeholder^="recipient"]');
    const provider = compose?.querySelector<HTMLElement>('[aria-label="Brevo email provider status"]');
    const buttons = compose ? Array.from(compose.querySelectorAll<HTMLButtonElement>("button")).map((button) => button.textContent?.trim() || "") : [];
    const send = buttons.find((label) => label.includes("Confirm & Send"));
    const sendButton = send && compose ? Array.from(compose.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === send) : undefined;
    return {
      toTop: to?.getBoundingClientRect().top ?? null,
      toolbarHeight: toolbar?.getBoundingClientRect().height ?? null,
      providerVisible: Boolean(provider && getComputedStyle(provider).display !== "none"),
      providerText: provider?.innerText || "",
      emailSetupInCompose: buttons.filter((label) => label === "Email setup").length,
      browseDocuments: buttons.filter((label) => label.includes("Browse Documents")).length,
      composeSms: buttons.filter((label) => label.includes("Compose SMS")).length,
      sendDisabledUntilReview: sendButton?.disabled ?? false,
      providerStatusTab: Array.from(document.querySelectorAll<HTMLButtonElement>("[data-email-sms-tabs] button")).some((button) => button.getAttribute("aria-label") === "Email Provider Status"),
    };
  });
  const composeTools = page.locator('[data-email-compose-tools] summary');
  const composeToolsCount = await composeTools.count();
  let composeToolLabels = "";
  if (composeToolsCount === 1) {
    await composeTools.click();
    composeToolLabels = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("[data-email-compose-tools] button"))
      .filter((button) => button.getClientRects().length > 0)
      .map((button) => button.innerText.trim())
      .join(" | "));
    await composeTools.click();
  }
  return [
    { id: "email-compose-fields-appear-first-view", passed: layout.toTop !== null && layout.toTop < 800, details: `To field top: ${layout.toTop ?? "missing"}px in 390×844 view` },
    { id: "email-compose-toolbar-compact", passed: layout.toolbarHeight !== null && layout.toolbarHeight <= 72, details: `compose toolbar height: ${layout.toolbarHeight ?? "missing"}px` },
    { id: "email-compose-provider-error-remains-visible", passed: layout.providerVisible && /Connection problem|Ready|Sender setup required|Not configured/.test(layout.providerText), details: `provider state: ${layout.providerText.trim() || "missing"}` },
    { id: "email-compose-status-navigation-remains-reachable", passed: layout.providerStatusTab && layout.emailSetupInCompose === 0, details: `provider tab: ${layout.providerStatusTab}; duplicate setup buttons in compose: ${layout.emailSetupInCompose}` },
    { id: "email-compose-document-and-sms-actions-remain", passed: layout.browseDocuments === 1 && layout.composeSms === 1, details: `Browse Documents / Compose SMS: ${layout.browseDocuments}/${layout.composeSms}` },
    { id: "email-compose-secondary-actions-touch-reachable", passed: composeToolsCount === 1 && /Browse Documents/.test(composeToolLabels) && /Compose SMS/.test(composeToolLabels), details: `More actions options: ${composeToolLabels || "missing"}` },
    { id: "email-send-remains-review-gated", passed: layout.sendDisabledUntilReview, details: `Confirm & Send disabled until review: ${layout.sendDisabledUntilReview}` },
  ] satisfies readonly QaAssertion[];
};

function verifyPageHeaderActionVariants(expected: readonly { label: string; variant: "primary" | "secondary" | "ghost" | "destructive" }[]): QaScenarioAction {
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

const verifyDemoWorkspaceChrome: QaScenarioAction = async (page) => {
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

async function verifyEntityMediaThumbnails(page: QaBrowserPage, label: string): Promise<readonly QaAssertion[]> {
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

const verifyProjectMediaLight: QaScenarioAction = async (page) => [
  ...(await applyThemePreferenceForVisualQa(page, "light")),
  ...(await verifyEntityMediaThumbnails(page, "project")),
];
const verifyProjectMediaDark: QaScenarioAction = async (page) => [
  ...(await applyThemePreferenceForVisualQa(page, "dark")),
  ...(await verifyEntityMediaThumbnails(page, "project")),
];
const verifyEquipmentMediaLight: QaScenarioAction = async (page) => [
  ...(await applyThemePreferenceForVisualQa(page, "light")),
  ...(await verifyEntityMediaThumbnails(page, "equipment")),
];
const verifyEquipmentMediaDark: QaScenarioAction = async (page) => [
  ...(await applyThemePreferenceForVisualQa(page, "dark")),
  ...(await verifyEntityMediaThumbnails(page, "equipment")),
];
const verifyMaterialMediaLight: QaScenarioAction = async (page) => [
  ...(await applyThemePreferenceForVisualQa(page, "light")),
  ...(await verifyEntityMediaThumbnails(page, "material")),
];
const verifyMaterialMediaDark: QaScenarioAction = async (page) => [
  ...(await applyThemePreferenceForVisualQa(page, "dark")),
  ...(await verifyEntityMediaThumbnails(page, "material")),
];

const verifyProjectMediaControls: QaScenarioAction = async (page) => {
  const themeAssertions = await applyThemePreferenceForVisualQa(page, "dark");
  await page.getByRole("button", { name: "Edit project details", exact: true }).first().click();
  await page.locator('[data-entity-media-panel="true"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await page.getByRole("button", { name: "Replace", exact: true }).first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const panelCount = await page.locator('[data-entity-media-panel="true"]').count();
  const replaceCount = await page.getByRole("button", { name: "Replace", exact: true }).count();
  const removeCount = await page.getByRole("button", { name: "Remove", exact: true }).count();
  return [
    ...themeAssertions,
    { id: "project-image-panel-visible", passed: panelCount === 1, details: `project image panels: ${panelCount}` },
    { id: "project-image-replace-control-visible", passed: replaceCount === 1, details: `Replace controls: ${replaceCount}` },
    { id: "project-image-remove-control-visible", passed: removeCount === 1, details: `Remove controls: ${removeCount}` },
  ];
};

const verifyPayrollSummaryDisclosure: QaScenarioAction = async (page) => {
  const trigger = page.getByRole("button", { name: /Payroll period summary/ }).first();
  const triggerCount = await trigger.count();
  const initialState = await page.evaluate(() => document.querySelector<HTMLElement>("[data-payroll-period-summary] [data-ui=disclosure-section] > button")?.getAttribute("aria-expanded") || "missing");
  await trigger.click();
  const expanded = await page.evaluate(() => {
    const section = document.querySelector<HTMLElement>("[data-payroll-period-summary] [data-ui=disclosure-section]");
    return {
      state: section?.querySelector("button")?.getAttribute("aria-expanded") || "missing",
      text: section?.innerText || "",
    };
  });
  await trigger.click();
  const restoredState = await page.evaluate(() => document.querySelector<HTMLElement>("[data-payroll-period-summary] [data-ui=disclosure-section] > button")?.getAttribute("aria-expanded") || "missing");
  return [
    { id: "r4e-payroll-summary-disclosure-present", passed: triggerCount === 1 && initialState === "false", details: `trigger count: ${triggerCount}; initial state: ${initialState}` },
    { id: "r4e-payroll-summary-details-retained", passed: expanded.state === "true" && ["Active workers", "Current period", "Estimated gross", "Project labor", "Admin / overhead"].every((label) => expanded.text.includes(label)), details: `expanded metrics: ${expanded.text.replaceAll("\n", " · ").slice(0, 240)}` },
    { id: "r4e-payroll-summary-collapses", passed: restoredState === "false", details: `restored disclosure state: ${restoredState}` },
  ] satisfies readonly QaAssertion[];
};

const verifyProjectMaterialImage: QaScenarioAction = async (page) => {
  const themeAssertions = await applyThemePreferenceForVisualQa(page, "light");
  await page.getByRole("tab", { name: "Materials & Equipment", exact: true }).click();
  await waitForVisible(page, '[data-phase3b="materials-equipment"]');
  await page.locator('[data-entity-media-thumbnail="true"][data-entity-media-fallback="false"] img').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const media = await page.locator('[data-entity-media-thumbnail="true"][data-entity-media-fallback="false"] img').count();
  const materialName = await page.locator("text=110mm heavy-duty PVC conduit").count();
  const plannedQty = await page.locator("text=800 pcs").count();
  return [
    ...themeAssertions,
    { id: "linked-project-material-image-visible", passed: media > 0, details: `linked Warehouse image previews: ${media}` },
    { id: "project-material-identity-visible", passed: materialName > 0, details: `linked material labels: ${materialName}` },
    { id: "project-material-quantity-context-visible", passed: plannedQty > 0, details: `planned quantity context labels: ${plannedQty}` },
  ];
};

async function waitForVisible(page: QaBrowserPage, selector: string, timeout = READY_TIMEOUT_MS) {
  await page.locator(selector).first().waitFor({ state: "visible", timeout });
}

async function waitForHeading(page: QaBrowserPage, name: string | RegExp, timeout = READY_TIMEOUT_MS) {
  await page.getByRole("heading", typeof name === "string" ? { name, exact: true } : { name }).first().waitFor({ state: "visible", timeout });
}

const openProjectFromDirectory: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: /Quezon City Warehouse Expansion/ }).first().click();
  await waitForHeading(page, "Quezon City Warehouse Expansion");
  const count = await page.getByRole("heading", { name: "Quezon City Warehouse Expansion", exact: true }).count();
  return [{ id: "project-workspace-visible", passed: count === 1, details: `matching project headings: ${count}` } satisfies QaAssertion];
};

const verifyProjectFinancialControlDashboard: QaScenarioAction = async (page) => {
  const dashboardHeading = await page.getByRole("heading", { name: "Project Financial Control Dashboard", exact: true }).count();
  const costControlHeading = await page.getByRole("heading", { name: "Cost Control", exact: true }).count();
  const commercialControlHeading = await page.getByRole("heading", { name: "Commercial Control", exact: true }).count();
  const budgetControlCta = await page.getByRole("button", { name: /Open Budget Control Tab/ }).count();
  const financialMetrics = await page.locator("[data-financial-metric-status]").count();
  return [
    { id: "project-financial-control-heading-visible", passed: dashboardHeading === 1, details: `financial-control headings: ${dashboardHeading}` },
    { id: "project-cost-control-visible", passed: costControlHeading === 1, details: `cost-control headings: ${costControlHeading}` },
    { id: "project-commercial-control-visible", passed: commercialControlHeading === 1, details: `commercial-control headings: ${commercialControlHeading}` },
    { id: "project-budget-control-drilldown-visible", passed: budgetControlCta === 1, details: `budget-control CTAs: ${budgetControlCta}` },
    { id: "project-financial-metrics-visible", passed: financialMetrics >= 10, details: `financial metric cards: ${financialMetrics}` },
  ] satisfies readonly QaAssertion[];
};

const verifyPhpOnlyProjectControlState: QaScenarioAction = async (page) => {
  const mixedCurrencyCount = await page.locator("text=Mixed currencies present").count();
  const withheldChartCount = await page.locator("text=Complete budget position withheld while unconverted foreign-currency costs are present.").count();
  const partialMetricCount = await page.locator('[data-financial-metric-status="partial"]').count();
  const availableMetricCount = await page.locator('[data-financial-metric-status="available"]').count();
  return [
    { id: "php-only-mixed-currency-warning-absent", passed: mixedCurrencyCount === 0, details: `mixed-currency warnings: ${mixedCurrencyCount}` },
    { id: "php-only-budget-chart-not-withheld", passed: withheldChartCount === 0, details: `withheld budget chart messages: ${withheldChartCount}` },
    { id: "php-only-financial-metrics-not-partial", passed: partialMetricCount === 0, details: `partial financial metrics: ${partialMetricCount}` },
    { id: "php-only-financial-metrics-available", passed: availableMetricCount > 0, details: `available financial metrics: ${availableMetricCount}` },
  ] satisfies readonly QaAssertion[];
};

const openDemoDrawingPreview: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Open original demo drawing", exact: true }).first().click();
  await waitForVisible(page, '[aria-label="Demo drawing preview"]');
  const count = await page.locator('[aria-label="Demo drawing preview"]').count();
  return [{ id: "blueprint-viewer-visible", passed: count === 1, details: `demo drawing preview panels: ${count}` } satisfies QaAssertion];
};

const openDemoTour: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Demo Tour", exact: true }).first().click();
  await page.getByRole("dialog", { name: /Demo Tour$/i }).first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const count = await page.getByRole("dialog", { name: /Demo Tour$/i }).count();
  return [{ id: "demo-tour-visible", passed: count === 1, details: `tour panels: ${count}` } satisfies QaAssertion];
};

const verifySupplierPayableBridge: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[data-testid="supplier-invoice-expense-bridge"]');
  const changeStatus = await page.getByRole("button", { name: "Change Status", exact: true }).count();
  const expenseLink = await page.getByRole("link", { name: /Open\/Correct linked Expense/ }).count();
  const correctionLink = await page.getByRole("button", { name: /Review correction options/ }).count();
  if (changeStatus === 1) {
    await page.getByRole("button", { name: "Change Status", exact: true }).click();
    await waitForVisible(page, '[data-testid="supplier-payment-dialog"]');
  }
  const paymentDialog = await page.locator('[data-testid="supplier-payment-dialog"]').count();
  const paidOption = await page.getByRole("button", { name: "Paid", exact: true }).count();
  const partialOption = await page.getByRole("button", { name: "Partially Paid", exact: true }).count();
  const confirmPayment = await page.getByRole("button", { name: /Confirm Payment/ }).count();
  const addAccount = await page.getByRole("button", { name: /Add Cash\/Bank Account/ }).count();
  return [
    { id: "supplier-payment-change-status-visible", passed: changeStatus === 1, details: `Change Status controls: ${changeStatus}` },
    { id: "supplier-payment-dialog-visible", passed: paymentDialog === 1, details: `supplier payment dialogs: ${paymentDialog}` },
    { id: "supplier-payment-status-options-visible", passed: paidOption === 1 && partialOption === 1, details: `Paid/Partially Paid controls: ${paidOption}/${partialOption}` },
    { id: "supplier-payment-confirm-visible", passed: confirmPayment === 1, details: `Confirm Payment controls: ${confirmPayment}` },
    { id: "supplier-payment-inline-account-visible", passed: addAccount === 1, details: `Add Cash/Bank Account controls: ${addAccount}` },
    { id: "supplier-expense-secondary-correction-link-visible", passed: expenseLink === 1, details: `linked Expense correction links: ${expenseLink}` },
    { id: "supplier-invoice-correction-continuation-visible", passed: correctionLink > 0, details: `correction continuation controls: ${correctionLink}` },
  ] satisfies readonly QaAssertion[];
};

const verifySupplierInvoiceNavigation: QaScenarioAction = async (page) => {
  const moduleButton = await page.getByRole("button", { name: /Supplier Invoices/ }).count();
  const childRouteBefore = await page.getByRole("button", { name: /Supplier documents/ }).count();
  if (moduleButton === 1 && childRouteBefore === 0) await page.getByRole("button", { name: /Supplier Invoices/ }).click();
  await waitForHeading(page, "Supplier source documents");
  const register = await page.getByRole("heading", { name: "Supplier source documents", exact: true }).count();
  const childRoute = await page.getByRole("button", { name: /Supplier documents/ }).count();
  return [
    { id: "supplier-invoice-module-visible", passed: moduleButton === 1, details: `Supplier Invoices module controls: ${moduleButton}` },
    { id: "supplier-invoice-register-visible", passed: register === 1, details: `Supplier invoice register headings: ${register}` },
    { id: "supplier-invoice-child-route-visible", passed: childRoute === 1, details: `Supplier documents child routes: ${childRoute}` },
  ] satisfies readonly QaAssertion[];
};

const verifySupplierInvoiceReview: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[data-testid="supplier-invoice-side-by-side-review"]');
  const reviewLayout = await page.locator('[data-testid="supplier-invoice-side-by-side-review"]').count();
  const sourcePane = await page.locator('[data-testid="supplier-invoice-source-pane"]').count();
  const extractedPane = await page.locator('[data-testid="supplier-invoice-extracted-pane"]').count();
  const sourceSurface = await page.locator('[data-testid="supplier-invoice-source-surface"]').count();
  const sourceDocument = await page.locator('[data-testid="supplier-invoice-source-document"][data-source-state="available"]').count();
  const extractedWorksheet = await page.locator('[data-testid="supplier-invoice-extracted-worksheet"]').count();
  const worksheetActionBar = await page.locator('[data-testid="supplier-invoice-worksheet-action-bar"]').count();
  const headerWorksheet = await page.locator('[data-testid="supplier-invoice-header-worksheet"]').count();
  const lineWorksheet = await page.locator('[data-testid="supplier-invoice-line-items-worksheet"]').count();
  const totalsWorksheet = await page.locator('[data-testid="supplier-invoice-totals-worksheet"]').count();
  const worksheetEditors = await page.locator('[data-worksheet-editor="true"]').count();
  const geometry = await page.evaluate(() => {
    const grid = window.innerWidth < 768 ? "[data-worksheet-mobile-fallback='true']" : "[data-worksheet-desktop-grid='true']";
    const sourceElement = document.querySelector<HTMLElement>('[data-testid="supplier-invoice-source-pane"]');
    const extractedElement = document.querySelector<HTMLElement>('[data-testid="supplier-invoice-extracted-pane"]');
    const sourceDocumentElement = document.querySelector<HTMLElement>('[data-testid="supplier-invoice-source-document"][data-source-state="available"]');
    const firstEditableElement = document.querySelector<HTMLElement>(`[data-testid="supplier-invoice-header-worksheet"] ${grid} [data-worksheet-cell$=":invoiceNumber"]`);
    const sourceRect = sourceElement?.getBoundingClientRect();
    const extractedRect = extractedElement?.getBoundingClientRect();
    const sourceDocumentRect = sourceDocumentElement?.getBoundingClientRect();
    const firstEditableRect = firstEditableElement?.getBoundingClientRect();
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      pageWidth: document.documentElement.scrollWidth,
      source: sourceRect ? { left: sourceRect.left, right: sourceRect.right, top: sourceRect.top, bottom: sourceRect.bottom, width: sourceRect.width, height: sourceRect.height } : null,
      extracted: extractedRect ? { left: extractedRect.left, right: extractedRect.right, top: extractedRect.top, bottom: extractedRect.bottom, width: extractedRect.width, height: extractedRect.height } : null,
      sourceDocument: sourceDocumentRect ? { left: sourceDocumentRect.left, right: sourceDocumentRect.right, top: sourceDocumentRect.top, bottom: sourceDocumentRect.bottom, width: sourceDocumentRect.width, height: sourceDocumentRect.height } : null,
      firstEditable: firstEditableRect ? { left: firstEditableRect.left, right: firstEditableRect.right, top: firstEditableRect.top, bottom: firstEditableRect.bottom, width: firstEditableRect.width, height: firstEditableRect.height } : null,
      editableCursor: firstEditableElement ? getComputedStyle(firstEditableElement).cursor : "missing",
    };
  });
  const wide = geometry.width >= 1280;
  const widePanelsUsable = Boolean(geometry.source && geometry.extracted && geometry.source.width >= 320 && geometry.extracted.width >= 420 && geometry.source.right <= geometry.extracted.left + 2 && Math.abs(geometry.source.top - geometry.extracted.top) <= 16 && Math.max(geometry.source.top, geometry.extracted.top) < Math.min(geometry.source.bottom, geometry.extracted.bottom));
  const sourceAndFieldInFirstView = Boolean(geometry.sourceDocument && geometry.firstEditable && geometry.sourceDocument.top < geometry.height && geometry.sourceDocument.bottom > 0 && geometry.firstEditable.top < geometry.height && geometry.firstEditable.bottom > 0);
  const narrowPanelsStacked = Boolean(geometry.source && geometry.extracted && geometry.source.width >= geometry.width * 0.8 && geometry.extracted.width >= geometry.width * 0.8 && Math.abs(geometry.source.left - geometry.extracted.left) <= 4 && geometry.extracted.top >= geometry.source.bottom - 2);
  const noPageOverflow = geometry.pageWidth <= geometry.width + 2;

  const gridSelector = geometry.width < 768 ? "[data-worksheet-mobile-fallback='true']" : "[data-worksheet-desktop-grid='true']";
  const editableCellSelector = `[data-testid="supplier-invoice-header-worksheet"] ${gridSelector} [data-worksheet-cell$=":invoiceNumber"]`;
  const dateCellSelector = `[data-testid="supplier-invoice-header-worksheet"] ${gridSelector} [data-worksheet-cell$=":invoiceDate"]`;
  const editableCell = page.locator(editableCellSelector);
  await editableCell.click();
  const textEditor = page.locator(`${editableCellSelector} input[type="text"]`);
  await textEditor.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const pointerFocus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Invoice Number, row 1");
  const originalInvoiceNumber = await page.evaluate(() => {
    const grid = window.innerWidth < 768 ? "[data-worksheet-mobile-fallback='true']" : "[data-worksheet-desktop-grid='true']";
    const cell = document.querySelector<HTMLElement>(`[data-testid="supplier-invoice-header-worksheet"] ${grid} [data-worksheet-cell$=":invoiceNumber"]`);
    return cell?.querySelector<HTMLInputElement>("input")?.value || cell?.textContent?.trim() || "";
  });
  const copiedCell = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement)) return { text: "", prevented: false };
    const clipboard = new DataTransfer();
    const event = new ClipboardEvent("copy", { clipboardData: clipboard, bubbles: true, cancelable: true });
    active.dispatchEvent(event);
    return { text: clipboard.getData("text/plain"), prevented: event.defaultPrevented };
  });
  await textEditor.fill("UX-EDIT-1A-ESCAPE-CHECK");
  await page.keyboard.press("Escape");
  const escapedEditorClosed = (await page.locator(`${editableCellSelector} input, ${editableCellSelector} select`).count()) === 0;
  const escapeRestoredValue = await page.evaluate(() => {
    const grid = window.innerWidth < 768 ? "[data-worksheet-mobile-fallback='true']" : "[data-worksheet-desktop-grid='true']";
    const cell = document.querySelector<HTMLElement>(`[data-testid="supplier-invoice-header-worksheet"] ${grid} [data-worksheet-cell$=":invoiceNumber"]`);
    if (!cell) return "";
    return window.innerWidth < 768 ? cell.lastElementChild?.textContent?.trim() || "" : cell.textContent.trim();
  });

  await editableCell.press("Enter");
  await textEditor.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await textEditor.fill("UX-EDIT-1A-TAB-CHECK");
  await page.keyboard.press("Tab");
  const tabNavigation = await page.evaluate(() => ({
    selected: document.querySelector<HTMLElement>('[data-testid="supplier-invoice-header-worksheet"] [aria-selected="true"]')?.getAttribute("data-worksheet-cell") || "",
    value: document.querySelector<HTMLElement>('[data-testid="supplier-invoice-header-worksheet"] [data-worksheet-desktop-grid="true"] [data-worksheet-cell$=":invoiceNumber"]')?.textContent?.trim() || "",
  }));
  await page.locator(dateCellSelector).press("Shift+Tab");
  const shiftTabNavigation = await page.evaluate(() => document.activeElement?.getAttribute("data-worksheet-cell") || "");
  const discard = page.getByRole("button", { name: "Discard all worksheet edits", exact: true });
  if (await discard.count() === 1) await discard.click();

  const dateCell = page.locator(dateCellSelector);
  await dateCell.click();
  const dateEditor = page.locator(`${dateCellSelector} input[type="date"]`);
  await dateEditor.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await page.keyboard.press("Escape");
  const selectCellSelector = `[data-testid="supplier-invoice-line-items-worksheet"] ${gridSelector} [data-worksheet-cell$=":taxTreatment"]`;
  await page.locator(selectCellSelector).click();
  const selectEditor = page.locator(`${selectCellSelector} select`);
  await selectEditor.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const selectFocused = await page.evaluate(() => document.activeElement instanceof HTMLSelectElement);
  await page.keyboard.press("Escape");

  const saveAction = await page.getByRole("button", { name: "Save worksheet edits", exact: true }).count();
  const collapsedWorkflows = await page.evaluate(() => {
    const allocation = document.querySelector<HTMLDetailsElement>('[data-testid="supplier-invoice-project-allocation-disclosure"]');
    const purchaseOrder = document.querySelector<HTMLDetailsElement>('[data-testid="supplier-invoice-purchase-order-disclosure"]');
    const materialIntake = document.querySelector<HTMLDetailsElement>('[data-testid="supplier-invoice-material-intake-disclosure"]');
    const settlement = document.querySelector<HTMLDetailsElement>('[data-testid="supplier-invoice-settlement-disclosure"]');
    return {
      allocationPresent: Boolean(allocation),
      allocationOpen: Boolean(allocation?.open),
      purchaseOrderPresent: Boolean(purchaseOrder),
      purchaseOrderOpen: Boolean(purchaseOrder?.open),
      materialIntakePresent: Boolean(materialIntake),
      materialIntakeOpen: Boolean(materialIntake?.open),
      settlementPresent: Boolean(settlement),
      settlementOpen: Boolean(settlement?.open),
      secondaryActionsOpen: Boolean(document.querySelector<HTMLDetailsElement>('[data-testid="supplier-invoice-secondary-actions"]')?.open),
      extractedDetailsOpen: Boolean(document.querySelector<HTMLDetailsElement>('[data-testid="supplier-invoice-review"] details:not([data-testid="supplier-invoice-review-notes"])')?.open),
    };
  });
  const verifyWorkflow = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
    let count = 0;
    let outsideWorksheet = true;
    let stickyCount = 0;
    for (const button of buttons) {
      if (!/Verify & Create Expense/.test(button.textContent || "")) continue;
      count += 1;
      if (button.closest('[data-testid="supplier-invoice-extracted-worksheet"]')) outsideWorksheet = false;
      if (button.closest(".sticky.bottom-2")) stickyCount += 1;
    }
    return {
      count,
      outsideWorksheet,
      stickyCount,
    };
  });
  const stickyFooterCount = await page.locator(".sticky.bottom-2").count();
  const detailsToggle = await page.getByRole("button", { name: "Details", exact: true }).count();
  const sourceToggle = await page.getByRole("button", { name: "Source", exact: true }).count();
  const prominentCorrectionAction = await page.getByRole("button", { name: "Review correction options", exact: true }).count();
  return [
    { id: "supplier-invoice-wide-panels-visible", passed: reviewLayout === 1 && sourcePane === 1 && extractedPane === 1 && (wide ? widePanelsUsable && sourceAndFieldInFirstView : narrowPanelsStacked), details: `paired panes at ${geometry.width}px: source ${geometry.source?.width ?? 0}px, extracted ${geometry.extracted?.width ?? 0}px; source doc y=${geometry.sourceDocument?.top ?? "missing"}..${geometry.sourceDocument?.bottom ?? "missing"}, first field y=${geometry.firstEditable?.top ?? "missing"}..${geometry.firstEditable?.bottom ?? "missing"}, viewport=${geometry.height}px` },
    { id: "supplier-invoice-source-surface-visible", passed: sourceSurface === 1, details: `preserved source surfaces: ${sourceSurface}` },
    { id: "supplier-invoice-source-document-visible", passed: sourceDocument === 1, details: `available source documents: ${sourceDocument}` },
    { id: "supplier-invoice-extracted-worksheet-visible", passed: extractedWorksheet === 1, details: `extracted worksheets: ${extractedWorksheet}` },
    { id: "supplier-invoice-worksheet-action-bar-visible", passed: worksheetActionBar === 1, details: `aggregate worksheet action bars: ${worksheetActionBar}` },
    { id: "supplier-invoice-header-worksheet-visible", passed: headerWorksheet === 1, details: `header worksheets: ${headerWorksheet}` },
    { id: "supplier-invoice-line-worksheet-visible", passed: lineWorksheet === 1, details: `line-item worksheets: ${lineWorksheet}` },
    { id: "supplier-invoice-totals-worksheet-visible", passed: totalsWorksheet === 1, details: `totals worksheets: ${totalsWorksheet}` },
    { id: "supplier-invoice-four-worksheet-editors-visible", passed: worksheetEditors === 4, details: `worksheet editors: ${worksheetEditors}` },
    { id: "supplier-invoice-editable-cell-one-click", passed: geometry.editableCursor === "text" && pointerFocus, details: `cursor ${geometry.editableCursor}; input focused after one click: ${pointerFocus}` },
    { id: "supplier-invoice-copy-while-editing", passed: copiedCell.prevented && copiedCell.text === originalInvoiceNumber, details: `copy used the cell value while the editor was focused: ${copiedCell.text === originalInvoiceNumber}` },
    { id: "supplier-invoice-escape-cancels-edit", passed: escapedEditorClosed && originalInvoiceNumber === escapeRestoredValue, details: `editor closed ${escapedEditorClosed}; original "${originalInvoiceNumber}"; after Escape "${escapeRestoredValue}"` },
    { id: "supplier-invoice-keyboard-enter-edits", passed: tabNavigation.value.includes("UX-EDIT-1A-TAB-CHECK"), details: `Enter opened the editor and Tab committed: ${tabNavigation.value}` },
    { id: "supplier-invoice-tab-shift-tab-navigation", passed: tabNavigation.selected.endsWith(":invoiceDate") && shiftTabNavigation.endsWith(":invoiceNumber"), details: `Tab selected ${tabNavigation.selected}; Shift+Tab returned to ${shiftTabNavigation}` },
    { id: "supplier-invoice-date-editor-one-click", passed: (await page.locator(`${dateCellSelector} input[type="date"]`).count()) === 0, details: "date input opened on one click and Escape closed it" },
    { id: "supplier-invoice-select-editor-one-click", passed: selectFocused, details: `select control focused after one click: ${selectFocused}` },
    { id: "supplier-invoice-worksheet-save-visible", passed: saveAction === 1, details: `aggregate Save worksheet edits actions: ${saveAction}` },
    { id: "supplier-invoice-verify-workflow-separate", passed: verifyWorkflow.count === 1 && verifyWorkflow.outsideWorksheet && (stickyFooterCount === 0 || (stickyFooterCount === 1 && verifyWorkflow.stickyCount === 1)), details: `verify actions ${verifyWorkflow.count}, outside worksheet ${verifyWorkflow.outsideWorksheet}, sticky footers ${stickyFooterCount}, verify in footer ${verifyWorkflow.stickyCount}` },
    { id: "supplier-invoice-downstream-workflows-collapsed", passed: collapsedWorkflows.allocationPresent && !collapsedWorkflows.allocationOpen && collapsedWorkflows.purchaseOrderPresent && !collapsedWorkflows.purchaseOrderOpen && collapsedWorkflows.materialIntakePresent && !collapsedWorkflows.materialIntakeOpen, details: `allocation ${collapsedWorkflows.allocationPresent}/${collapsedWorkflows.allocationOpen}, PO match ${collapsedWorkflows.purchaseOrderPresent}/${collapsedWorkflows.purchaseOrderOpen}, material intake ${collapsedWorkflows.materialIntakePresent}/${collapsedWorkflows.materialIntakeOpen}` },
    { id: "supplier-invoice-secondary-details-collapsed", passed: !collapsedWorkflows.secondaryActionsOpen && !collapsedWorkflows.extractedDetailsOpen && (!collapsedWorkflows.settlementPresent || !collapsedWorkflows.settlementOpen), details: `more actions ${collapsedWorkflows.secondaryActionsOpen}; extracted details ${collapsedWorkflows.extractedDetailsOpen}; settlement ${collapsedWorkflows.settlementPresent}/${collapsedWorkflows.settlementOpen}` },
    { id: "supplier-invoice-correction-action-secondary", passed: prominentCorrectionAction === 0, details: `prominent correction buttons: ${prominentCorrectionAction}` },
    { id: "supplier-invoice-no-page-horizontal-overflow", passed: noPageOverflow, details: `page width ${geometry.pageWidth}px at viewport ${geometry.width}px` },
    { id: "supplier-invoice-old-mobile-pane-removed", passed: detailsToggle === 0 && sourceToggle === 0, details: `legacy Details/Source toggles: ${detailsToggle}/${sourceToggle}` },
  ] satisfies readonly QaAssertion[];
};

const verifySupplierInvoiceReadOnlyCell: QaScenarioAction = async (page) => {
  const width = await page.evaluate(() => window.innerWidth);
  const gridSelector = width < 768 ? "[data-worksheet-mobile-fallback='true']" : "[data-worksheet-desktop-grid='true']";
  const cellSelector = `[data-testid="supplier-invoice-header-worksheet"] ${gridSelector} [data-worksheet-cell$=":invoiceNumber"]`;
  const cell = page.locator(cellSelector);
  await cell.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const before = await page.evaluate(() => ({
    readonly: document.querySelector<HTMLElement>(`[data-testid="supplier-invoice-header-worksheet"] ${window.innerWidth < 768 ? "[data-worksheet-mobile-fallback='true']" : "[data-worksheet-desktop-grid='true']"} [data-worksheet-cell$=":invoiceNumber"]`)?.getAttribute("aria-readonly"),
    editable: document.querySelector<HTMLElement>(`[data-testid="supplier-invoice-header-worksheet"] ${window.innerWidth < 768 ? "[data-worksheet-mobile-fallback='true']" : "[data-worksheet-desktop-grid='true']"} [data-worksheet-cell$=":invoiceNumber"]`)?.getAttribute("data-worksheet-editable"),
  }));
  await cell.click();
  const editorCount = await page.locator(`${cellSelector} input, ${cellSelector} select`).count();
  return [
    { id: "supplier-invoice-protected-cell-read-only", passed: before.readonly === "true" && before.editable === "false" && editorCount === 0, details: `aria-readonly ${before.readonly}; editable ${before.editable}; editors after click ${editorCount}` },
  ];
};

const verifyStaleSupplierInvoiceRecovery: QaScenarioAction = async (page) => {
  const title = await page.getByRole("heading", { name: "Supplier invoice unavailable", exact: true }).count();
  const action = await page.getByRole("button", { name: "Return to Supplier Invoices", exact: true }).count();
  if (action === 1) {
    await page.getByRole("button", { name: "Return to Supplier Invoices", exact: true }).click();
    await waitForHeading(page, "Supplier source documents");
  }
  const recovered = await page.getByRole("heading", { name: "Supplier source documents", exact: true }).count();
  return [
    { id: "stale-supplier-invoice-recovery-visible", passed: title === 1, details: `recovery headings: ${title}` },
    { id: "stale-supplier-invoice-recovery-action-visible", passed: action === 1, details: `recovery actions: ${action}` },
    { id: "stale-supplier-invoice-recovered-to-register", passed: recovered === 1, details: `recovered register headings: ${recovered}` },
  ] satisfies readonly QaAssertion[];
};

const verifyExpensePaymentSurface: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[data-testid="expense-detail-panel"]');
  const panel = await page.locator('[data-testid="expense-detail-panel"]').count();
  const recordPayment = await page.getByRole("link", { name: /Record Payment/ }).count();
  const supplierInvoice = await page.getByRole("link", { name: /View Supplier Invoice/ }).count();
  return [
    { id: "expense-detail-visible", passed: panel === 1, details: `Expense detail panels: ${panel}` },
    { id: "expense-payment-cta-visible", passed: recordPayment === 1, details: `Record Payment links: ${recordPayment}` },
    { id: "expense-source-invoice-link-visible", passed: supplierInvoice === 1, details: `supplier invoice source links: ${supplierInvoice}` },
  ] satisfies readonly QaAssertion[];
};

const verifyCashExpenseTarget: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[data-testid="cash-target-context"]');
  const context = await page.locator('[data-testid="cash-target-context"]').count();
  const requested = await page.locator("text=Requested target").count();
  const returnToExpense = await page.getByRole("link", { name: /Return to Expense/ }).count();
  if (returnToExpense === 1) {
    await page.getByRole("link", { name: /Return to Expense/ }).click();
    await waitForVisible(page, '[data-testid="expense-detail-panel"]');
  }
  const returnedExpense = await page.locator('[data-testid="expense-detail-panel"]').count();
  return [
    { id: "cash-expense-target-context-visible", passed: context === 1, details: `cash target contexts: ${context}` },
    { id: "cash-expense-target-prioritized", passed: requested >= 1, details: `requested-target badges: ${requested}` },
    { id: "cash-expense-return-link-visible", passed: returnToExpense === 1, details: `Expense return links: ${returnToExpense}` },
    { id: "cash-expense-returned-to-exact-expense", passed: returnedExpense === 1, details: `returned Expense panels: ${returnedExpense}` },
  ] satisfies readonly QaAssertion[];
};

const verifyPayrollNormalCycleOverview: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Next step");
  const nextStep = await page.getByRole("heading", { name: "Next step", exact: true }).count();
  const reviewOrPrepare = await page.getByRole("button", { name: /Review payroll|Import workbook/ }).count();
  const calculateFromOverview = await page.getByRole("button", { name: "Calculate payroll", exact: true }).count();
  const stageBoundary = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[data-payroll-next-step="true"]');
    const text = panel?.innerText || "";
    return {
      approvalAndPaymentSeparated: text.includes("Approval and payment stay separate"),
      paymentRoutedToCash: text.includes("record payment through Cash & Banking"),
    };
  });
  return [
    { id: "payroll-normal-cycle-next-step-visible", passed: nextStep === 1, details: `next-step panels: ${nextStep}` },
    { id: "payroll-normal-cycle-review-or-prepare-action-visible", passed: reviewOrPrepare >= 1, details: `review/prepare actions: ${reviewOrPrepare}` },
    { id: "payroll-overview-does-not-calculate-directly", passed: calculateFromOverview === 0, details: `overview Calculate payroll buttons: ${calculateFromOverview}` },
    { id: "payroll-normal-cycle-stage-boundary-visible", passed: stageBoundary.approvalAndPaymentSeparated && stageBoundary.paymentRoutedToCash, details: `approval/payment separated: ${stageBoundary.approvalAndPaymentSeparated}; Cash & Banking handoff: ${stageBoundary.paymentRoutedToCash}` },
  ] satisfies readonly QaAssertion[];
};

const verifyPayrollApprovedSettlementHandoff: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[aria-label="payroll settlement"]');
  const settlement = await page.locator('[aria-label="payroll settlement"]').count();
  const netPay = await page.locator("text=Expected employee net pay").count();
  const recordPayment = await page.getByRole("link", { name: /Record Payment/ }).count();
  const manualPaid = await page.locator("text=Mark paid manually").count();
  const cashBoundary = await page.locator("text=Cash evidence only").count();
  return [
    { id: "payroll-approved-settlement-card-visible", passed: settlement === 1, details: `payroll settlement cards: ${settlement}` },
    { id: "payroll-approved-net-pay-basis-visible", passed: netPay === 1, details: `employee net-pay basis labels: ${netPay}` },
    { id: "payroll-approved-record-payment-visible", passed: recordPayment === 1, details: `Record Payment links: ${recordPayment}` },
    { id: "payroll-no-manual-paid-toggle", passed: manualPaid === 0, details: `manual paid controls: ${manualPaid}` },
    { id: "payroll-cash-authority-copy-visible", passed: cashBoundary >= 1, details: `cash authority copy: ${cashBoundary}` },
  ] satisfies readonly QaAssertion[];
};

const verifyCashBrowseAndChoice: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Cash & Banking");
  const browseStage = await page.locator('[data-testid="cash-stage-browse"]').count();
  const chooseStage = await page.locator('[data-testid="cash-stage-choose"]').count();
  const intentionalChoice = await page.locator('[data-testid="cash-settlement-empty-selection"]').count();
  const reviewLinks = await page.getByRole("link", { name: "Review allocation", exact: true }).count();
  const queueConfirmButtons = await page.getByRole("button", { name: "Confirm match", exact: true }).count();
  if (reviewLinks > 0) {
    await page.getByRole("link", { name: "Review allocation", exact: true }).first().click();
    await waitForVisible(page, '[data-testid="cash-settlement-workspace"]');
  }
  const resultAfterReview = await page.locator('[data-testid="cash-settlement-result"]').count();
  return [
    { id: "cash-browse-stage-visible", passed: browseStage >= 1, details: `browse stage markers: ${browseStage}` },
    { id: "cash-choose-stage-visible", passed: chooseStage >= 1, details: `choose stage markers: ${chooseStage}` },
    { id: "cash-settlement-requires-intentional-choice", passed: intentionalChoice === 1, details: `intentional empty selection states: ${intentionalChoice}` },
    { id: "cash-queue-review-allocation-visible", passed: reviewLinks > 0, details: `non-mutating review links: ${reviewLinks}` },
    { id: "cash-queue-confirm-match-removed", passed: queueConfirmButtons === 0, details: `queue-level Confirm match buttons: ${queueConfirmButtons}` },
    { id: "cash-review-link-does-not-confirm", passed: resultAfterReview === 0, details: `settlement results after review navigation: ${resultAfterReview}` },
  ] satisfies readonly QaAssertion[];
};

const verifyCashSettlementResult: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[data-testid="cash-settlement-workspace"]');
  const reviewStage = await page.locator('[data-testid="cash-stage-review"]').count();
  const candidateCount = await page.locator('[data-testid="cash-settlement-candidate"]').count();
  const allocate = page.getByRole("button", { name: "Allocate", exact: true }).first();
  const allocateCount = await allocate.count();
  if (allocateCount === 1) await allocate.click();
  const confirm = page.getByRole("button", { name: "Confirm settlement", exact: true });
  const confirmCount = await confirm.count();
  if (allocateCount === 1 && confirmCount === 1) {
    await confirm.click();
    await waitForVisible(page, '[data-testid="cash-settlement-result"]');
  }
  const result = await page.locator('[data-testid="cash-settlement-result"]').count();
  const sourceUnchanged = await page.locator("text=The source record was not changed").count();
  const openTarget = await page.getByRole("link", { name: "Open target", exact: true }).count();
  return [
    { id: "cash-review-stage-visible", passed: reviewStage === 1, details: `review stage markers: ${reviewStage}` },
    { id: "cash-candidate-visible", passed: candidateCount > 0, details: `eligible candidate cards: ${candidateCount}` },
    { id: "cash-allocation-confirmed-explicitly", passed: allocateCount === 1 && confirmCount === 1, details: `allocate/confirm controls: ${allocateCount}/${confirmCount}` },
    { id: "cash-settlement-result-visible", passed: result === 1, details: `settlement result panels: ${result}` },
    { id: "cash-result-source-authority-visible", passed: sourceUnchanged > 0, details: `source-authority messages: ${sourceUnchanged}` },
    { id: "cash-result-open-target-visible", passed: openTarget > 0, details: `open-target links: ${openTarget}` },
  ] satisfies readonly QaAssertion[];
};

const verifyCashTransferWorkflowSeparation: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Cash & Banking");
  const transferWorkflow = await page.locator('[data-testid="cash-transfer-workflow"]').count();
  const transferConfirm = await page.getByRole("button", { name: "Confirm transfer", exact: true }).count();
  const transferReverse = await page.getByRole("button", { name: "Reverse transfer", exact: true }).count();
  const transferCandidates = await page.locator('[data-testid="cash-settlement-candidate"][data-target-type="TRANSFER"]').count();
  return [
    { id: "cash-transfer-workflow-visible", passed: transferWorkflow === 1, details: `dedicated transfer workflow regions: ${transferWorkflow}` },
    { id: "cash-transfer-confirmation-explicit", passed: transferConfirm > 0 || transferReverse > 0, details: `transfer confirm/reverse controls: ${transferConfirm}/${transferReverse}` },
    { id: "cash-transfer-not-operating-candidate", passed: transferCandidates === 0, details: `transfer candidates in operating allocation: ${transferCandidates}` },
  ] satisfies readonly QaAssertion[];
};

const verifyClientReceivableLifecycle: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Client Invoices & Collections");
  await waitForVisible(page, '[data-testid="client-invoice-collection-position"]');
  const position = await page.locator('[data-testid="client-invoice-collection-position"]').count();
  const recordCollection = await page.getByRole("button", { name: /Record Collection/ }).count();
  const collectionHistory = await page.locator('[data-testid="client-invoice-collection-history"]').count();

  await page.getByRole("button", { name: /Record Collection/ }).first().click();
  await waitForHeading(page, "Record client collection draft");
  const exactBillingContext = await page.locator('[data-testid="client-collection-target-context"]').count();
  await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
  await page.getByRole("button", { name: /^Client Invoices \(/ }).first().click();
  await waitForVisible(page, '[data-testid="client-invoice-collection-history"]');
  await page.getByRole("button", { name: /Open collection/ }).first().click();
  await waitForVisible(page, '[data-testid="continue-client-collection-to-cash"]');
  const continueToCash = await page.locator('[data-testid="continue-client-collection-to-cash"]').count();
  await page.locator('[data-testid="continue-client-collection-to-cash"]').first().click();
  await waitForVisible(page, '[data-testid="cash-target-context"]');
  const cashTargetContext = await page.locator('[data-testid="cash-target-context"]').count();
  const cashReturn = await page.locator('[data-testid="cash-return-to-client-invoice"]').count();

  const transactionSelect = page.locator('select[aria-label="Transaction to reconcile"]').first();
  await transactionSelect.selectOption("demo-transaction-client-collection-02");
  await waitForVisible(page, '[data-testid="cash-settlement-candidate"]');
  const requestedTarget = await page.locator("text=Requested target").count();
  const requestedAllocation = page.locator('article:has-text("COL-MEC-24-017-002") button:has-text("Allocate")').first();
  await requestedAllocation.click();
  await page.getByRole("button", { name: "Confirm settlement", exact: true }).click();
  await waitForVisible(page, '[data-testid="cash-return-to-client-invoice"]');
  await page.locator('[data-testid="cash-return-to-client-invoice"]').first().click();
  await waitForVisible(page, '[data-testid="client-invoice-collection-position"]');
  const returnedPosition = await page.locator('[data-testid="client-invoice-collection-position"]').count();
  const returnedHistory = await page.locator('[data-testid="client-invoice-collection-history"]').count();
  return [
    { id: "client-invoice-collection-position-visible", passed: position === 1, details: `invoice collection position panels: ${position}` } satisfies QaAssertion,
    { id: "client-invoice-record-collection-visible", passed: recordCollection === 1, details: `contextual Record Collection CTAs: ${recordCollection}` } satisfies QaAssertion,
    { id: "client-invoice-collection-history-visible", passed: collectionHistory === 1, details: `invoice collection history panels: ${collectionHistory}` } satisfies QaAssertion,
    { id: "client-collection-exact-billing-context-visible", passed: exactBillingContext === 1, details: `exact billing contexts in collection editor: ${exactBillingContext}` } satisfies QaAssertion,
    { id: "client-collection-cash-continuation-visible", passed: continueToCash === 1, details: `Cash continuation CTAs: ${continueToCash}` } satisfies QaAssertion,
    { id: "client-collection-cash-target-context-visible", passed: cashTargetContext === 1, details: `CLIENT_COLLECTION cash target contexts: ${cashTargetContext}` } satisfies QaAssertion,
    { id: "client-collection-cash-target-prioritized", passed: requestedTarget >= 1, details: `requested-target badges: ${requestedTarget}` } satisfies QaAssertion,
    { id: "client-collection-cash-return-visible", passed: cashReturn === 1, details: `client-invoice return links: ${cashReturn}` } satisfies QaAssertion,
    { id: "client-collection-returned-to-invoice", passed: returnedPosition === 1 && returnedHistory === 1, details: `returned invoice position/history panels: ${returnedPosition}/${returnedHistory}` } satisfies QaAssertion,
  ] satisfies readonly QaAssertion[];
};

const verifyClientBillingDraftWorksheet: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Client Invoices & Collections");
  await page.getByRole("button", { name: "Edit draft", exact: true }).first().click();
  await waitForVisible(page, '[data-testid="client-billing-draft-worksheet"]');
  const worksheet = await page.locator('[data-testid="client-billing-draft-worksheet"]').count();
  const editors = await page.locator('[data-testid="client-billing-draft-worksheet"] [data-worksheet-editor="true"]').count();
  const addRow = await page.locator('[data-testid="client-billing-draft-worksheet"] [data-worksheet-add-row="true"]').count();
  const protectedCells = await page.locator('[data-testid="client-billing-draft-worksheet"] [data-worksheet-protected="true"]').count();
  const save = await page.getByRole("button", { name: "Save draft", exact: true }).count();
  const submit = await page.getByRole("button", { name: "Submit", exact: true }).count();
  const issue = await page.getByRole("button", { name: "Issue Client Invoice", exact: true }).count();
  const collection = await page.getByRole("button", { name: "Record Collection", exact: true }).count();
  await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
  return [
    { id: "client-billing-draft-worksheet-visible", passed: worksheet === 1, details: `Client Billing draft worksheet surfaces: ${worksheet}` },
    { id: "client-billing-draft-worksheet-editors-visible", passed: editors === 2, details: `Client Billing worksheet editors: ${editors}` },
    { id: "client-billing-draft-worksheet-add-row-visible", passed: addRow === 1, details: `Client Billing Add row controls: ${addRow}` },
    { id: "client-billing-draft-protected-cells-visible", passed: protectedCells > 0, details: `Client Billing protected cells: ${protectedCells}` },
    { id: "client-billing-draft-single-save-visible", passed: save === 1, details: `Client Billing Save draft controls: ${save}` },
    { id: "client-billing-draft-lifecycle-outside-worksheet", passed: submit === 0 && issue === 0, details: `worksheet lifecycle buttons: submit=${submit}, issue=${issue}` },
    { id: "client-billing-draft-collections-outside-worksheet", passed: collection === 0, details: `worksheet collection buttons: ${collection}` },
  ] satisfies readonly QaAssertion[];
};

const verifyPurchaseOrderDocumentDeliverySurface: QaScenarioAction = async (page) => {
  const preview = page.getByRole("button", { name: "Preview", exact: true }).first();
  const previewCount = await page.getByRole("button", { name: "Preview", exact: true }).count();
  if (previewCount > 0) await preview.click();
  await waitForVisible(page, '[data-document-delivery-history]');
  const documentPreview = await page.locator("#document-preview-title").count();
  const deliveryHistory = await page.locator('[data-document-delivery-history]').count();
  const fallbackPdf = await page.getByRole("button", { name: "Generate / Download PDF", exact: true }).count();
  const companyTemplatePdf = await page.getByRole("button", { name: "Company-template PDF", exact: true }).count();
  const sendButton = await page.getByRole("button", { name: /Send by Email|Resend by Email|Try send again/ }).count();
  const disconnectedHistory = await page.locator("text=Connect the authenticated workspace to load immutable delivery history.").count();
  return [
    { id: "po-document-preview-visible", passed: documentPreview === 1, details: `Purchase Order preview headings: ${documentPreview}` },
    { id: "po-delivery-history-surface-visible", passed: deliveryHistory === 1, details: `delivery history surfaces: ${deliveryHistory}` },
    { id: "po-programmatic-pdf-fallback-control-visible", passed: fallbackPdf === 1, details: `programmatic PDF controls: ${fallbackPdf}` },
    { id: "po-company-template-pdf-control-visible", passed: companyTemplatePdf === 1, details: `company-template PDF controls: ${companyTemplatePdf}` },
    { id: "po-email-send-control-visible", passed: sendButton === 1, details: `email send controls: ${sendButton}` },
    { id: "po-demo-history-disconnected-state-visible", passed: disconnectedHistory === 1, details: `disconnected delivery-history notices: ${disconnectedHistory}` },
  ] satisfies readonly QaAssertion[];
};

const verifyProcurementDraftWorksheets: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Requests for Quotation (RFQs)" }).click();
  await page.getByRole("button", { name: "Issue", exact: true }).first().click();
  await waitForVisible(page, '[role="dialog"]');
  const issueDialogFocusEntered = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
  const issueConfirmation = await page.getByRole("button", { name: "Confirm Issue", exact: true }).count();
  const issueSafety = await page.locator("text=Issuing does not select a supplier or create a Purchase Order.").count();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  const issueDialogFocusRestored = await page.evaluate(() => document.activeElement?.textContent?.trim() === "Issue");
  await page.getByRole("button", { name: "New RFQ", exact: true }).first().click();
  await waitForVisible(page, '[data-testid="rfq-draft-worksheet"]');
  const rfqDialogFocusEntered = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
  const rfqWorksheet = await page.locator('[data-testid="rfq-draft-worksheet"]').count();
  const rfqEditors = await page.locator('[data-testid="rfq-draft-worksheet"] [data-worksheet-editor="true"]').count();
  const rfqAddRow = await page.locator('[data-testid="rfq-draft-worksheet"] [data-worksheet-add-row="true"]').count();
  await page.keyboard.press("Escape");
  const rfqDialogFocusRestored = await page.evaluate(() => document.activeElement?.textContent?.trim() === "New RFQ");

  await page.getByRole("button", { name: "Purchase Orders" }).click();
  await page.getByRole("button", { name: "New Purchase Order", exact: true }).first().click();
  await waitForVisible(page, '[data-testid="purchase-order-draft-worksheet"]');
  const poDialogFocusEntered = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
  const poWorksheet = await page.locator('[data-testid="purchase-order-draft-worksheet"]').count();
  const poEditors = await page.locator('[data-testid="purchase-order-draft-worksheet"] [data-worksheet-editor="true"]').count();
  const poAddRow = await page.locator('[data-testid="purchase-order-draft-worksheet"] [data-worksheet-add-row="true"]').count();
  const protectedCells = await page.locator('[data-testid="purchase-order-draft-worksheet"] [data-worksheet-protected="true"]').count();
  await page.keyboard.press("Escape");
  const poDialogFocusRestored = await page.evaluate(() => document.activeElement?.textContent?.trim() === "New Purchase Order");
  await page.getByRole("button", { name: "New Purchase Order", exact: true }).first().click();
  await waitForVisible(page, '[data-testid="purchase-order-draft-worksheet"]');
  const approval = await page.getByRole("button", { name: "Approve PO", exact: true }).count();
  const saveBeforeApproval = await page.locator("text=Save this draft before approval becomes available.").count();
  const receiptWorkflow = await page.getByRole("button", { name: /Record Delivery \/ Receipt/ }).count();

  return [
    { id: "rfq-issue-confirmation-visible", passed: issueConfirmation === 1, details: `RFQ issue confirmation controls: ${issueConfirmation}` },
    { id: "rfq-issue-safety-boundary-visible", passed: issueSafety === 1, details: `RFQ issue safety notices: ${issueSafety}` },
    { id: "rfq-issue-dialog-focus-entered", passed: issueDialogFocusEntered, details: `RFQ issue dialog received focus: ${issueDialogFocusEntered}` },
    { id: "rfq-issue-dialog-focus-restored", passed: issueDialogFocusRestored, details: `RFQ issue opener focus restored: ${issueDialogFocusRestored}` },
    { id: "rfq-draft-worksheet-visible", passed: rfqWorksheet === 1, details: `RFQ worksheet surfaces: ${rfqWorksheet}` },
    { id: "rfq-draft-worksheet-editors-visible", passed: rfqEditors === 2, details: `RFQ worksheet editors: ${rfqEditors}` },
    { id: "rfq-draft-worksheet-add-row-visible", passed: rfqAddRow === 1, details: `RFQ Add row controls: ${rfqAddRow}` },
    { id: "rfq-dialog-focus-entered", passed: rfqDialogFocusEntered, details: `RFQ dialog received focus: ${rfqDialogFocusEntered}` },
    { id: "rfq-dialog-focus-restored", passed: rfqDialogFocusRestored, details: `RFQ opener focus restored: ${rfqDialogFocusRestored}` },
    { id: "po-draft-worksheet-visible", passed: poWorksheet === 1, details: `PO worksheet surfaces: ${poWorksheet}` },
    { id: "po-draft-worksheet-editors-visible", passed: poEditors === 2, details: `PO worksheet editors: ${poEditors}` },
    { id: "po-draft-worksheet-add-row-visible", passed: poAddRow === 1, details: `PO Add row controls: ${poAddRow}` },
    { id: "po-draft-protected-cells-visible", passed: protectedCells > 0, details: `PO protected cells: ${protectedCells}` },
    { id: "po-dialog-focus-entered", passed: poDialogFocusEntered, details: `PO dialog received focus: ${poDialogFocusEntered}` },
    { id: "po-dialog-focus-restored", passed: poDialogFocusRestored, details: `PO opener focus restored: ${poDialogFocusRestored}` },
    { id: "po-draft-approval-workflow-outside-worksheet", passed: approval === 0, details: `new PO approval controls: ${approval}` },
    { id: "po-draft-save-before-approval-visible", passed: saveBeforeApproval === 1, details: `save-before-approval notices: ${saveBeforeApproval}` },
    { id: "po-draft-receiving-workflow-not-on-draft", passed: receiptWorkflow === 0, details: `draft receiving controls: ${receiptWorkflow}` },
  ] satisfies readonly QaAssertion[];
};

const verifyClientInvoiceDocumentDeliverySurface: QaScenarioAction = async (page) => {
  const preview = page.getByRole("button", { name: "Preview / generate Client Invoice", exact: true }).first();
  const previewCount = await page.getByRole("button", { name: "Preview / generate Client Invoice", exact: true }).count();
  if (previewCount > 0) await preview.click();
  await waitForVisible(page, '[data-document-delivery-history]');
  const documentPreview = await page.locator("#document-preview-title").count();
  const deliveryHistory = await page.locator('[data-document-delivery-history]').count();
  const fallbackPdf = await page.getByRole("button", { name: "Generate / Download PDF", exact: true }).count();
  const companyTemplatePdf = await page.getByRole("button", { name: "Company-template PDF", exact: true }).count();
  const sendButton = await page.getByRole("button", { name: /Send by Email|Resend by Email|Try send again/ }).count();
  const disconnectedHistory = await page.locator("text=Connect the authenticated workspace to load immutable delivery history.").count();
  return [
    { id: "client-invoice-document-preview-visible", passed: documentPreview === 1, details: `Client Invoice preview headings: ${documentPreview}` },
    { id: "client-invoice-delivery-history-surface-visible", passed: deliveryHistory === 1, details: `delivery history surfaces: ${deliveryHistory}` },
    { id: "client-invoice-programmatic-pdf-fallback-control-visible", passed: fallbackPdf === 1, details: `programmatic PDF controls: ${fallbackPdf}` },
    { id: "client-invoice-company-template-pdf-control-visible", passed: companyTemplatePdf === 1, details: `company-template PDF controls: ${companyTemplatePdf}` },
    { id: "client-invoice-email-send-control-visible", passed: sendButton === 1, details: `email send controls: ${sendButton}` },
    { id: "client-invoice-demo-history-disconnected-state-visible", passed: disconnectedHistory === 1, details: `disconnected delivery-history notices: ${disconnectedHistory}` },
  ] satisfies readonly QaAssertion[];
};

const verifyEmailSmsWorkspace: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Email / SMS");
  const workspace = await page.locator('[data-email-sms-workspace]').count();
  const tabs = await page.locator('[data-email-sms-tabs] button').count();
  const compose = await page.getByRole("button", { name: "Compose", exact: true }).count();
  const history = await page.getByRole("button", { name: "Sent / Delivery History", exact: true }).count();
  const provider = await page.getByRole("button", { name: "Email Provider Status", exact: true }).count();
  const sms = await page.getByRole("button", { name: "SMS status", exact: true }).count();
  return [
    { id: "email-sms-workspace-visible", passed: workspace === 1, details: `Email / SMS workspace surfaces: ${workspace}` },
    { id: "email-sms-section-tabs-visible", passed: tabs === 4, details: `Email / SMS section tabs: ${tabs}` },
    { id: "email-sms-compose-visible", passed: compose === 1, details: `Compose tabs: ${compose}` },
    { id: "email-sms-history-visible", passed: history === 1, details: `Sent / Delivery History tabs: ${history}` },
    { id: "email-sms-provider-status-visible", passed: provider === 1, details: `Email Provider Status tabs: ${provider}` },
    { id: "email-sms-sms-visible", passed: sms === 1, details: `SMS tabs: ${sms}` },
  ] satisfies readonly QaAssertion[];
};

const verifyEmailComposeWorkspace: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[data-email-compose]');
  const compose = await page.locator('[data-email-compose]').count();
  const to = await page.getByRole("textbox", { name: "To" }).count();
  const subject = await page.getByRole("textbox", { name: "Subject" }).count();
  const body = await page.getByRole("textbox", { name: "Message" }).count();
  const review = await page.getByRole("button", { name: "Preview / Review", exact: true }).count();
  const send = await page.getByRole("button", { name: "Confirm & Send", exact: true }).count();
  return [
    { id: "email-compose-visible", passed: compose === 1, details: `compose panels: ${compose}` },
    { id: "email-compose-fields-visible", passed: to === 1 && subject === 1 && body === 1, details: `To/Subject/Message fields: ${to}/${subject}/${body}` },
    { id: "email-compose-review-visible", passed: review === 1, details: `review controls: ${review}` },
    { id: "email-compose-confirm-visible", passed: send === 1, details: `confirm controls: ${send}` },
  ] satisfies readonly QaAssertion[];
};

const verifyDocumentsWorkspace: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Documents");
  const workspace = await page.locator('[data-documents-workspace]').count();
  const entries = await page.locator('[data-document-register-entry]').count();
  const ownerLinks = await page.getByRole("button", { name: "Open owning record", exact: true }).count();
  const libraryTab = await page.locator('[data-document-center-view="library"][aria-selected="true"]').count();
  const createTab = await page.getByRole("tab", { name: /Create/ }).count();
  const templatesTab = await page.getByRole("tab", { name: /Templates/ }).count();
  return [
    { id: "documents-workspace-visible", passed: workspace === 1, details: `Documents workspace surfaces: ${workspace}` },
    { id: "documents-register-populated", passed: entries > 0, details: `document register entries: ${entries}` },
    { id: "documents-owner-navigation-visible", passed: ownerLinks > 0, details: `owner navigation controls: ${ownerLinks}` },
    { id: "documents-library-default-visible", passed: libraryTab === 1, details: `selected Library tabs: ${libraryTab}` },
    { id: "documents-create-view-link-visible", passed: createTab === 1, details: `Create tabs: ${createTab}` },
    { id: "documents-templates-view-link-visible", passed: templatesTab === 1, details: `Templates tabs: ${templatesTab}` },
  ] satisfies readonly QaAssertion[];
};

const verifyDocumentsCreateWorkspace: QaScenarioAction = async (page) => {
  await page.getByRole("tab", { name: /Create/ }).click();
  await waitForVisible(page, '[data-document-create-view]');
  const workspace = await page.locator('[data-document-create-view]').count();
  const availableOptions = await page.locator('[data-document-create-option]').count();
  const managedTemplateCreate = await page.locator('[data-managed-document-create]').count();
  const businessLabels = await page.locator("text=Purchase Order").count();
  return [
    { id: "documents-create-view-visible", passed: workspace === 1, details: `Create view surfaces: ${workspace}` },
    { id: "documents-create-options-visible", passed: availableOptions > 0, details: `supported Create options: ${availableOptions}` },
    { id: "documents-create-business-label-visible", passed: businessLabels > 0, details: `Purchase Order labels: ${businessLabels}` },
    { id: "documents-create-managed-template-surface-visible", passed: managedTemplateCreate === 1, details: `managed template Create surfaces: ${managedTemplateCreate}` },
  ] satisfies readonly QaAssertion[];
};

const verifyManagedDocumentDetail: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[data-managed-document-detail="true"]');
  await waitForHeading(page, "Warranty Certificate · Quezon City Warehouse");
  const detail = await page.locator('[data-managed-document-detail="true"]').count();
  const history = await page.getByRole("heading", { name: "Version history", exact: true }).count();
  const versionTwo = await page.locator("text=Version 2 · NGL-WHX-warranty-revised.pdf · Current").count();
  const versionOne = await page.locator("text=Version 1 · NGL-WHX-warranty.pdf").count();
  const openCurrent = await page.getByRole("button", { name: "Open current file", exact: true }).count();
  return [
    { id: "managed-document-detail-visible", passed: detail === 1, details: `managed detail surfaces: ${detail}` },
    { id: "managed-document-version-history-visible", passed: history === 1 && versionTwo === 1 && versionOne === 1, details: `history/current/older rows: ${history}/${versionTwo}/${versionOne}` },
    { id: "managed-document-current-file-action-visible", passed: openCurrent === 1, details: `Open current file controls: ${openCurrent}` },
  ] satisfies readonly QaAssertion[];
};

const verifyManagedArtifactDetail: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[data-managed-document-detail="true"]');
  await waitForHeading(page, "Purchase Order PO-2026-017 (PDF)");
  const provenance = await page.locator("text=Generated source and template provenance").count();
  const source = await page.locator("text=PURCHASE_ORDER · PO-2026-017").count();
  const archive = await page.getByRole("button", { name: "Archive", exact: true }).count();
  const versionUpload = await page.locator('input[type="file"]').count();
  return [
    { id: "managed-artifact-provenance-visible", passed: provenance === 1 && source === 1, details: `provenance/source rows: ${provenance}/${source}` },
    { id: "managed-artifact-remains-read-only", passed: archive === 0 && versionUpload === 0, details: `archive/file-upload controls: ${archive}/${versionUpload}` },
  ] satisfies readonly QaAssertion[];
};

const verifyDocumentsTemplatesWorkspace: QaScenarioAction = async (page) => {
  await page.getByRole("tab", { name: /Templates/ }).click();
  await waitForVisible(page, '[data-document-templates-view]');
  const view = await page.locator('[data-document-templates-view]').count();
  const templateSettings = await page.locator('[data-document-template-settings]').count();
  const documentTemplates = await page.locator("text=Document templates").count();
  const settingsLink = await page.getByRole("tab", { name: /Templates/ }).count();
  return [
    { id: "documents-templates-view-visible", passed: view === 1, details: `Templates view surfaces: ${view}` },
    { id: "documents-template-settings-visible", passed: templateSettings === 1, details: `template administration surfaces: ${templateSettings}` },
    { id: "documents-template-heading-visible", passed: documentTemplates > 0, details: `Document templates headings: ${documentTemplates}` },
    { id: "documents-template-tab-remains-visible", passed: settingsLink === 1, details: `Templates tabs after navigation: ${settingsLink}` },
  ] satisfies readonly QaAssertion[];
};

const verifyDocumentsToEmailHandoff: QaScenarioAction = async (page) => {
  const send = page.getByRole("button", { name: "Send", exact: true }).first();
  const sendCount = await page.getByRole("button", { name: "Send", exact: true }).count();
  if (sendCount > 0) await send.click();
  await waitForVisible(page, '[data-email-compose]');
  const compose = await page.locator('[data-email-compose]').count();
  const selected = page.url();
  return [
    { id: "documents-to-email-compose-handoff", passed: compose === 1, details: `compose panels after handoff: ${compose}` },
    { id: "documents-to-email-exact-selection", passed: (selected.includes("documentType=PURCHASE_ORDER") || selected.includes("documentType=CLIENT_INVOICE")) && selected.includes("documentId="), details: `handoff URL: ${selected}` },
  ] satisfies readonly QaAssertion[];
};

const verifySmsNotConfigured: QaScenarioAction = async (page) => {
  await waitForHeading(page, "SMS setup");
  const status = await page.locator('[data-sms-provider-status="NOT_CONFIGURED"]').count();
  const notConfigured = await page.locator("text=SMS · Not configured").count();
  return [
    { id: "sms-not-configured-visible", passed: status === 1 && notConfigured === 1, details: `SMS not-configured panels/text: ${status}/${notConfigured}` },
  ] satisfies readonly QaAssertion[];
};

const verifySmsComposeWorkspace: QaScenarioAction = async (page) => {
  await waitForHeading(page, "New SMS");
  const compose = await page.locator('[data-sms-compose]').count();
  const recipient = await page.locator('[data-sms-compose] input[type="tel"]').count();
  const message = await page.locator('[data-sms-compose] textarea').count();
  const review = await page.getByRole("button", { name: "Preview / Review", exact: true }).count();
  if (recipient === 1 && message === 1) {
    await page.locator('[data-sms-compose] input[type="tel"]').fill("09171234567");
    await page.locator('[data-sms-compose] textarea').fill("Synthetic SMS draft prepared for review only.");
    if (review === 1) await page.getByRole("button", { name: "Preview / Review", exact: true }).click();
  }
  const reviewSurface = await page.locator('[data-sms-compose-review="true"]').count();
  const confirm = await page.getByRole("button", { name: "Confirm & Send SMS", exact: true }).count();
  return [
    { id: "sms-compose-visible", passed: compose === 1, details: `SMS compose panels: ${compose}` },
    { id: "sms-compose-fields-visible", passed: recipient === 1 && message === 1, details: `recipient/message fields: ${recipient}/${message}` },
    { id: "sms-compose-review-visible", passed: reviewSurface === 1, details: `SMS review surfaces: ${reviewSurface}` },
    { id: "sms-compose-confirm-visible", passed: confirm === 1, details: `SMS confirm controls: ${confirm}` },
  ] satisfies readonly QaAssertion[];
};

const openMobileNavigation: QaScenarioAction = async (page) => {
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

function assertHeading(name: string | RegExp, assertionId: string): QaScenarioAction {
  return async (page) => {
    const count = await page.getByRole("heading", typeof name === "string" ? { name, exact: true } : { name }).count();
    return [{ id: assertionId, passed: count > 0, details: `matching headings: ${count}` } satisfies QaAssertion];
  };
}

const verifyExtractorScreen = assertHeading("Extract invoice documents", "invoice-extractor-visible");
const verifyVendorsScreen: QaScenarioAction = async (page) => {
  const heading = await page.getByRole("heading", { name: "Vendors", exact: true }).count();
  const directory = await page.locator('[data-vendor-directory="true"]').count();
  const manage = await page.getByRole("button", { name: "Manage Vendors", exact: true }).count();
  const rows = await page.locator('[data-vendor-directory="true"] tbody tr').count();
  return [
    { id: "vendor-directory-visible", passed: heading === 1, details: `Vendor headings: ${heading}` },
    { id: "vendor-directory-browse-surface-visible", passed: directory === 1 && rows > 0, details: `directory surfaces: ${directory}; rows: ${rows}` },
    { id: "vendor-directory-maintenance-action-visible", passed: manage === 1, details: `Manage Vendors controls: ${manage}` },
  ] satisfies readonly QaAssertion[];
};

const verifyVendorMasterWorksheet: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Manage Vendors", exact: true }).click();
  await page.locator('[data-testid="vendor-master-worksheet"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const editor = await page.locator('[data-worksheet-responsive-surface="vendor-master"] [data-worksheet-editor="true"]').count();
  const editableNames = await page.locator('[data-worksheet-responsive-surface="vendor-master"] [data-worksheet-cell$=":name"][data-worksheet-editable="true"]').count();
  const protectedState = await page.locator('[data-worksheet-responsive-surface="vendor-master"] [data-worksheet-cell$=":active"][data-worksheet-protected="true"]').count();
  const addRow = await page.locator('[data-worksheet-responsive-surface="vendor-master"] [data-worksheet-add-row="true"]').count();
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  const stagedRows = await page.locator('[data-worksheet-responsive-surface="vendor-master"] [data-worksheet-row-key]').count();
  await page.getByRole("button", { name: "Save Vendors", exact: true }).click();
  await page.locator('[data-worksheet-responsive-surface="vendor-master"] [data-worksheet-state="error"]:visible').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const validationErrors = await page.locator('[data-worksheet-responsive-surface="vendor-master"] [data-worksheet-state="error"]').count();
  const mobileFallback = await page.locator('[data-worksheet-responsive-surface="vendor-master"] [data-worksheet-mobile-fallback="true"]').count();
  return [
    { id: "vendor-master-worksheet-visible", passed: editor === 1, details: `Vendor worksheet editors: ${editor}` },
    { id: "vendor-master-safe-name-editable", passed: editableNames > 0, details: `editable Vendor-name cells: ${editableNames}` },
    { id: "vendor-master-lifecycle-protected", passed: protectedState > 0, details: `protected Vendor state cells: ${protectedState}` },
    { id: "vendor-master-add-row-visible", passed: addRow === 1 && stagedRows > 1, details: `Add row controls: ${addRow}; staged rows: ${stagedRows}` },
    { id: "vendor-master-validation-visible", passed: validationErrors > 0, details: `validation error cells: ${validationErrors}` },
    { id: "vendor-master-mobile-fallback-visible", passed: mobileFallback === 1, details: `mobile fallbacks: ${mobileFallback}` },
  ] satisfies readonly QaAssertion[];
};

const verifyWarehouseInventoryScreen: QaScenarioAction = async (page) => {
  const headingCount = await page.getByRole("heading", { name: "Warehouse Inventory", exact: true }).count();
  const itemCount = await page.locator('[data-domain="warehouse-inventory"] [data-inventory-item]').count();
  const movementTruthCount = await page.locator("text=Movement-derived stock truth").count();
  await page.getByRole("button", { name: "History", exact: true }).first().click();
  await waitForVisible(page, '[role="dialog"]');
  const historyDialogCount = await page.getByRole("dialog", { name: /Ready-mix concrete 28 MPa/ }).count();
  const movementHistoryCount = await page.locator("text=Opening physical count").count();
  const sourceLink = page.getByRole("link", { name: /Procurement receipt REC-24-0015/ }).first();
  const sourceLinkCount = await page.getByRole("link", { name: /Procurement receipt REC-24-0015/ }).count();
  if (sourceLinkCount === 1) {
    await sourceLink.click();
    await waitForHeading(page, "Procurement & Purchase Orders");
  } else {
    await page.getByRole("button", { name: "Close dialog", exact: true }).first().click();
  }
  const finalPath = page.url();
  return [
    { id: "warehouse-heading-visible", passed: headingCount === 1, details: `warehouse headings: ${headingCount}` },
    { id: "warehouse-items-visible", passed: itemCount > 0, details: `warehouse item rows: ${itemCount}` },
    { id: "warehouse-movement-truth-visible", passed: movementTruthCount === 1, details: `movement truth banners: ${movementTruthCount}` },
    { id: "warehouse-history-dialog-visible", passed: historyDialogCount === 1, details: `item history dialogs: ${historyDialogCount}` },
    { id: "warehouse-history-movement-visible", passed: movementHistoryCount > 0, details: `opening movement rows: ${movementHistoryCount}` },
    { id: "warehouse-authoritative-source-link-visible", passed: sourceLinkCount === 1, details: `Procurement source links: ${sourceLinkCount}` },
    { id: "warehouse-authoritative-source-link-opens-procurement", passed: sourceLinkCount === 1 && finalPath.includes("/procurement?poId=demo-po-wh-002&receiptId=demo-po-rec-wh-01"), details: `final source path: ${finalPath}` },
  ] satisfies readonly QaAssertion[];
};

const verifyWarehouseItemWorksheetCreate: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const editor = await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"] [data-worksheet-editor="true"]').count();
  const addRow = await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"] [data-worksheet-add-row="true"]').count();
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  const stagedRows = await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"] [data-worksheet-row-key]').count();
  await page.getByRole("button", { name: "Save items", exact: true }).click();
  await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"] [data-worksheet-state="error"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const errors = await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"] [data-worksheet-state="error"]').count();
  const mobileFallback = await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"] [data-worksheet-mobile-fallback="true"]').count();
  return [
    { id: "warehouse-item-worksheet-create-visible", passed: editor === 1, details: `Warehouse item worksheet editors: ${editor}` } satisfies QaAssertion,
    { id: "warehouse-item-worksheet-add-row-visible", passed: addRow === 1 && stagedRows > 1, details: `add-row controls: ${addRow}; staged rows: ${stagedRows}` } satisfies QaAssertion,
    { id: "warehouse-item-worksheet-validation-visible", passed: errors > 0, details: `validation error cells: ${errors}` } satisfies QaAssertion,
    { id: "warehouse-item-worksheet-mobile-fallback-visible", passed: mobileFallback === 1, details: `mobile fallbacks: ${mobileFallback}` } satisfies QaAssertion,
  ];
};

const verifyWarehouseItemWorksheetEdit: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const editableNames = await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"] [data-worksheet-cell$=":itemName"][data-worksheet-editable="true"]').count();
  const protectedBalances = await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"] [data-worksheet-cell$=":onHandQuantity"][data-worksheet-protected="true"]').count();
  const protectedMovements = await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"] [data-worksheet-cell$=":movementCount"][data-worksheet-protected="true"]').count();
  const protectedStatuses = await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"] [data-worksheet-cell$=":status"][data-worksheet-protected="true"]').count();
  return [
    { id: "warehouse-item-worksheet-edit-visible", passed: editableNames > 0, details: `editable item-name cells: ${editableNames}` } satisfies QaAssertion,
    { id: "warehouse-item-worksheet-protected-balance-visible", passed: protectedBalances > 0 && protectedMovements > 0, details: `protected balance cells: ${protectedBalances}; movement cells: ${protectedMovements}` } satisfies QaAssertion,
    { id: "warehouse-item-worksheet-status-protected", passed: protectedStatuses > 0, details: `protected status cells: ${protectedStatuses}` } satisfies QaAssertion,
  ];
};

const verifyEquipmentRegistryScreen: QaScenarioAction = async (page) => {
  const headingCount = await page.getByRole("heading", { name: "Equipment Registry", exact: true }).count();
  const registryCount = await page.locator('[data-domain="equipment-registry"]').count();
  const authorityCount = await page.locator("text=Assignment authority is separate from field evidence").count();
  const historyButtons = await page.getByRole("button", { name: "History", exact: true }).count();
  return [
    { id: "equipment-heading-visible", passed: headingCount === 1, details: `equipment headings: ${headingCount}` },
    { id: "equipment-registry-visible", passed: registryCount === 1, details: `equipment registry regions: ${registryCount}` },
    { id: "equipment-authority-boundary-visible", passed: authorityCount === 1, details: `authority banners: ${authorityCount}` },
    { id: "equipment-history-actions-visible", passed: historyButtons > 0, details: `history controls: ${historyButtons}` },
  ] satisfies readonly QaAssertion[];
};

const verifyCanonicalEquipmentWorksheetCreate: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Add Equipment", exact: true }).click();
  await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const editor = await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"] [data-worksheet-editor="true"]').count();
  const addRow = await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"] [data-worksheet-add-row="true"]').count();
  const protectedLifecycle = await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"] [data-worksheet-cell$=":lifecycleStatus"][data-worksheet-protected="true"]').count();
  const protectedAssignments = await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"] [data-worksheet-cell$=":currentState"][data-worksheet-protected="true"]').count();
  const mobileFallback = await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"] [data-worksheet-mobile-fallback="true"]').count();
  return [
    { id: "canonical-equipment-worksheet-create-visible", passed: editor === 1, details: `Equipment worksheet editors: ${editor}` } satisfies QaAssertion,
    { id: "canonical-equipment-worksheet-add-row-visible", passed: addRow === 1, details: `add-row controls: ${addRow}` } satisfies QaAssertion,
    { id: "canonical-equipment-worksheet-lifecycle-protected", passed: protectedLifecycle > 0, details: `protected lifecycle cells: ${protectedLifecycle}` } satisfies QaAssertion,
    { id: "canonical-equipment-worksheet-state-protected", passed: protectedAssignments > 0, details: `protected current-state cells: ${protectedAssignments}` } satisfies QaAssertion,
    { id: "canonical-equipment-worksheet-mobile-fallback-visible", passed: mobileFallback === 1, details: `mobile fallbacks: ${mobileFallback}` } satisfies QaAssertion,
  ];
};

const verifyCanonicalEquipmentWorksheetEdit: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const editableNames = await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"] [data-worksheet-cell$=":equipmentName"][data-worksheet-editable="true"]').count();
  const protectedLifecycle = await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"] [data-worksheet-cell$=":lifecycleStatus"][data-worksheet-protected="true"]').count();
  const protectedProjects = await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"] [data-worksheet-cell$=":currentProjectId"][data-worksheet-protected="true"]').count();
  const protectedAssignmentIds = await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"] [data-worksheet-cell$=":currentAssignmentId"][data-worksheet-protected="true"]').count();
  return [
    { id: "canonical-equipment-worksheet-edit-visible", passed: editableNames > 0, details: `editable equipment-name cells: ${editableNames}` } satisfies QaAssertion,
    { id: "canonical-equipment-worksheet-lifecycle-stays-protected", passed: protectedLifecycle > 0, details: `protected lifecycle cells: ${protectedLifecycle}` } satisfies QaAssertion,
    { id: "canonical-equipment-worksheet-assignment-stays-protected", passed: protectedProjects > 0 && protectedAssignmentIds > 0, details: `protected project cells: ${protectedProjects}; assignment cells: ${protectedAssignmentIds}` } satisfies QaAssertion,
  ];
};

const verifyPortfolioDashboard: QaScenarioAction = async (page) => {
  const headingCount = await page.getByRole("heading", { name: "Portfolio Management", exact: true }).count();
  const totalsCount = await page.locator('[aria-label="Portfolio Financial Totals"]').count();
  const remainingToBillCount = await page.locator('text=Remaining to Bill').count();
  return [
    { id: "portfolio-heading-visible", passed: headingCount === 1, details: `portfolio headings: ${headingCount}` },
    { id: "portfolio-financial-totals-visible", passed: totalsCount === 1, details: `portfolio total regions: ${totalsCount}` },
    { id: "portfolio-remaining-to-bill-visible", passed: remainingToBillCount > 0, details: `remaining-to-bill labels: ${remainingToBillCount}` },
  ] satisfies readonly QaAssertion[];
};

const verifyPortfolioAttention: QaScenarioAction = async (page) => {
  const attentionCount = await page.locator("text=Needs attention").count();
  const criticalCount = await page.locator("text=Critical signals").count();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const filter = page.getByRole("combobox", { name: "Filter by financial health and attention signals", exact: true }).first();
  await filter.selectOption("NEEDS_ATTENTION");
  const projectCards = page.locator('[aria-label="Projects list cards"] [data-project-id]');
  await projectCards.first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const flaggedProjects = await projectCards.count();
  await filter.selectOption("ALL");
  return [
    { id: "portfolio-attention-count-visible", passed: attentionCount > 0, details: `needs-attention labels: ${attentionCount}` } satisfies QaAssertion,
    { id: "portfolio-critical-count-visible", passed: criticalCount > 0, details: `critical-signal labels: ${criticalCount}` } satisfies QaAssertion,
    { id: "portfolio-needs-attention-filter-returns-projects", passed: flaggedProjects > 0, details: `flagged project card nodes: ${flaggedProjects}` } satisfies QaAssertion,
  ] satisfies readonly QaAssertion[];
};

const verifyPortfolioAttentionDark: QaScenarioAction = async (page) => {
  const themeResult = await applyDarkTheme(page);
  const filterResult = await verifyPortfolioAttention(page);
  return [
    ...(Array.isArray(themeResult) ? themeResult : []),
    ...(Array.isArray(filterResult) ? filterResult : []),
  ];
};

const verifyProjectCardActionPopover: QaScenarioAction = async (page) => {
  const cardSelector = '[aria-label="Projects list cards"] [data-project-id]:has(summary[aria-label^="More actions for"])';
  const card = page.locator(cardSelector).first();
  await card.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const trigger = page.locator(`${cardSelector} summary[aria-label^="More actions for"]`).first();
  await trigger.click();
  const popover = page.locator(`${cardSelector} .hqs-popover`).first();
  await popover.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await page.evaluate(() => document.querySelector<HTMLElement>('[aria-label="Projects list cards"] [data-project-id] .hqs-popover')?.scrollIntoView({ block: "nearest", inline: "nearest" }));

  const layout = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('[aria-label="Projects list cards"] [data-project-id]');
    const popover = card?.querySelector<HTMLElement>(".hqs-popover");
    const lifecycleAction = popover?.querySelector<HTMLButtonElement>("button");
    if (!card || !popover || !lifecycleAction) return null;

    const cardRect = card.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const lifecycleRect = lifecycleAction.getBoundingClientRect();
    const lifecycleHit = document.elementFromPoint(lifecycleRect.left + lifecycleRect.width / 2, lifecycleRect.top + lifecycleRect.height / 2);
    const style = getComputedStyle(popover);
    return {
      card: { left: cardRect.left, right: cardRect.right, top: cardRect.top, bottom: cardRect.bottom, width: cardRect.width, height: cardRect.height },
      popover: { left: popoverRect.left, right: popoverRect.right, top: popoverRect.top, bottom: popoverRect.bottom, width: popoverRect.width, height: popoverRect.height },
      lifecycle: { left: lifecycleRect.left, right: lifecycleRect.right, top: lifecycleRect.top, bottom: lifecycleRect.bottom, width: lifecycleRect.width, height: lifecycleRect.height },
      cardOverflow: getComputedStyle(card).overflow,
      popoverVisible: popover.getClientRects().length > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0,
      lifecycleHit: lifecycleHit === lifecycleAction || lifecycleAction.contains(lifecycleHit),
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: window.innerHeight,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
      popoverBottom: popoverRect.bottom,
      cardBottom: cardRect.bottom,
      lifecycleBottom: lifecycleRect.bottom,
    };
  });
  const lifecycleAction = page.locator(`${cardSelector} .hqs-popover button`).first();
  const lifecycleActionCount = await lifecycleAction.count();
  await lifecycleAction.click();
  const lifecycleDialog = page.locator('[role="dialog"][aria-labelledby="project-lifecycle-title"]');
  await lifecycleDialog.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const lifecycleDialogCount = await lifecycleDialog.count();

  const viewportTolerance = 2;
  const popoverWithinViewport = Boolean(layout && layout.popover.left >= -viewportTolerance && layout.popover.right <= layout.viewportWidth + viewportTolerance && layout.popover.top >= -viewportTolerance && layout.popover.bottom <= layout.viewportHeight + viewportTolerance);
  const lifecycleWithinViewport = Boolean(layout && layout.lifecycle.left >= -viewportTolerance && layout.lifecycle.right <= layout.viewportWidth + viewportTolerance && layout.lifecycle.top >= -viewportTolerance && layout.lifecycle.bottom <= layout.viewportHeight + viewportTolerance);
  const popoverExtendsBeyondCard = Boolean(layout && layout.popoverBottom > layout.cardBottom);
  return [
    { id: "project-card-more-trigger-opens-popover", passed: Boolean(layout?.popoverVisible), details: layout ? `popover ${Math.round(layout.popover.width)}×${Math.round(layout.popover.height)} at ${Math.round(layout.popover.left)},${Math.round(layout.popover.top)}` : "popover geometry missing" },
    { id: "project-card-popover-card-boundary-allows-reachability", passed: layout?.cardOverflow === "visible" && layout.lifecycleHit === true, details: `card overflow: ${layout?.cardOverflow || "missing"}; popover extends beyond card: ${popoverExtendsBeyondCard}; card bottom: ${layout ? Math.round(layout.cardBottom) : "missing"}; popover bottom: ${layout ? Math.round(layout.popoverBottom) : "missing"}` },
    { id: "project-card-popover-within-viewport", passed: popoverWithinViewport && lifecycleWithinViewport, details: layout ? `popover ${Math.round(layout.popover.left)},${Math.round(layout.popover.top)}–${Math.round(layout.popover.right)},${Math.round(layout.popover.bottom)}; lifecycle ${Math.round(layout.lifecycle.left)},${Math.round(layout.lifecycle.top)}–${Math.round(layout.lifecycle.right)},${Math.round(layout.lifecycle.bottom)} within ${layout.viewportWidth}×${layout.viewportHeight}` : "popover geometry missing" },
    { id: "project-card-lifecycle-action-hit-target-visible", passed: lifecycleActionCount === 1 && layout?.lifecycleHit === true, details: `lifecycle action count: ${lifecycleActionCount}; center hit target: ${layout?.lifecycleHit ?? false}` },
    { id: "project-card-popover-does-not-create-horizontal-overflow", passed: Boolean(layout && layout.documentWidth <= layout.viewportWidth + 2), details: layout ? `document width: ${layout.documentWidth}px; viewport: ${layout.viewportWidth}px` : "document geometry missing" },
    { id: "project-card-lifecycle-dialog-opens", passed: lifecycleDialogCount === 1, details: `lifecycle dialogs: ${lifecycleDialogCount}` },
  ] satisfies readonly QaAssertion[];
};

function projectCardActionTheme(theme: "light" | "dark"): QaScenarioAction {
  return async (page) => {
    const themeAssertions = theme === "dark" ? await applyDarkTheme(page) : await applyLightTheme(page);
    const actionAssertions = await verifyProjectCardActionPopover(page);
    return [
      ...(Array.isArray(themeAssertions) ? themeAssertions : []),
      ...(Array.isArray(actionAssertions) ? actionAssertions : []),
    ];
  };
}

const verifyProjectAttentionAndEngineering: QaScenarioAction = async (page) => {
  const managementAttention = await page.getByRole("heading", { name: "Management Attention", exact: true }).count();
  const engineeringSummary = await page.getByRole("heading", { name: "Engineering Coordination", exact: true }).count();
  const evidence = await page.locator("text=Evidence:").count();
  await page.locator('nav[aria-label="Project workspace sections"] button:has-text("Documents")').first().click();
  await waitForHeading(page, /Engineering Document Register/);
  const documentRegister = await page.getByRole("heading", { name: /Engineering Document Register/ }).count();
  await page.locator('nav[aria-label="Project workspace sections"] button:has-text("RFIs")').first().click();
  await waitForHeading(page, /Project RFIs|RFI Register/);
  const rfiRegister = await page.getByRole("heading", { name: /Project RFIs|RFI Register/ }).count();
  await page.locator('nav[aria-label="Project workspace sections"] button:has-text("Submittals")').first().click();
  await waitForHeading(page, /Technical Submittal Register|Submittals/);
  const submittalRegister = await page.getByRole("heading", { name: /Technical Submittal Register|Submittals/ }).count();
  await page.locator('nav[aria-label="Project workspace sections"] button:has-text("Site Logs")').first().click();
  await waitForHeading(page, /Daily Site Logs|Site Logs/);
  const siteLogRegister = await page.getByRole("heading", { name: /Daily Site Logs|Site Logs/ }).count();
  await page.locator('nav[aria-label="Project workspace sections"] button:has-text("Materials & Equipment")').first().click();
  await page.locator("text=Current warehouse on-hand").first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const projectWarehouseReadThrough = await page.locator("text=Current warehouse on-hand").count();
  return [
    { id: "project-management-attention-visible", passed: managementAttention === 1, details: `management-attention headings: ${managementAttention}` } satisfies QaAssertion,
    { id: "project-engineering-summary-visible", passed: engineeringSummary === 1, details: `engineering summaries: ${engineeringSummary}` } satisfies QaAssertion,
    { id: "project-signal-evidence-visible", passed: evidence > 0, details: `evidence labels: ${evidence}` } satisfies QaAssertion,
    { id: "project-documents-drilldown-visible", passed: documentRegister > 0, details: `document registers: ${documentRegister}` } satisfies QaAssertion,
    { id: "project-rfis-drilldown-visible", passed: rfiRegister > 0, details: `RFI registers: ${rfiRegister}` } satisfies QaAssertion,
    { id: "project-submittals-drilldown-visible", passed: submittalRegister > 0, details: `submittal registers: ${submittalRegister}` } satisfies QaAssertion,
    { id: "project-site-logs-drilldown-visible", passed: siteLogRegister > 0, details: `Site Log registers: ${siteLogRegister}` } satisfies QaAssertion,
    { id: "project-materials-warehouse-read-through-visible", passed: projectWarehouseReadThrough > 0, details: `project warehouse read-through labels: ${projectWarehouseReadThrough}` } satisfies QaAssertion,
  ] satisfies readonly QaAssertion[];
};

const verifyMaterialsEquipmentBrowse: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Materials & Equipment");
  const surface = await page.locator('[data-phase3b="materials-equipment"]').count();
  const materialRows = await page.locator('[data-phase3b="materials-equipment"] [class*="border-b"]').count();
  const receiptsBoundary = await page.locator("text=Formal receipts remain authoritative").count();
  return [
    { id: "materials-equipment-browse-surface-visible", passed: surface === 1, details: `materials/equipment surfaces: ${surface}` } satisfies QaAssertion,
    { id: "materials-equipment-browse-rows-visible", passed: materialRows > 0, details: `browse row regions: ${materialRows}` } satisfies QaAssertion,
    { id: "materials-equipment-receipt-boundary-visible", passed: receiptsBoundary > 0, details: `receipt boundary labels: ${receiptsBoundary}` } satisfies QaAssertion,
  ] satisfies readonly QaAssertion[];
};

const verifyMaterialWorksheetCreate: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Materials & Equipment");
  await page.getByRole("button", { name: "Add material", exact: true }).click();
  await page.locator('[data-worksheet-responsive-surface="project-materials"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const editor = await page.locator('[data-worksheet-responsive-surface="project-materials"] [data-worksheet-editor="true"]').count();
  const addRow = await page.locator('[data-worksheet-responsive-surface="project-materials"] [data-worksheet-add-row="true"]').count();
  const mobileFallback = await page.locator('[data-worksheet-responsive-surface="project-materials"] [data-worksheet-mobile-fallback="true"]').count();
  return [
    { id: "material-worksheet-create-visible", passed: editor === 1, details: `material worksheet editors: ${editor}` } satisfies QaAssertion,
    { id: "material-worksheet-add-row-visible", passed: addRow === 1, details: `material add-row controls: ${addRow}` } satisfies QaAssertion,
    { id: "material-worksheet-mobile-fallback-visible", passed: mobileFallback === 1, details: `material mobile fallbacks: ${mobileFallback}` } satisfies QaAssertion,
  ] satisfies readonly QaAssertion[];
};

const verifyMaterialWorksheetValidation: QaScenarioAction = async (page) => {
  await verifyMaterialWorksheetCreate(page);
  await page.getByRole("button", { name: "Save materials", exact: true }).click();
  await page.locator('[data-worksheet-responsive-surface="project-materials"] [data-worksheet-state="error"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const errors = await page.locator('[data-worksheet-responsive-surface="project-materials"] [data-worksheet-state="error"]').count();
  return [{ id: "material-worksheet-validation-visible", passed: errors > 0, details: `material worksheet error cells: ${errors}` } satisfies QaAssertion];
};

const verifyMaterialWorksheetEdit: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Materials & Equipment");
  await page.locator('[data-phase3b="materials-equipment"] button:has-text("Edit")').first().click();
  await page.locator('[data-worksheet-responsive-surface="project-materials"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const editableNames = await page.locator('[data-worksheet-responsive-surface="project-materials"] [data-worksheet-cell$=":materialName"][data-worksheet-editable="true"]').count();
  const boundaryText = await page.locator("text=PO receiving and warehouse on-hand remain protected").count();
  return [
    { id: "material-worksheet-edit-visible", passed: editableNames > 0, details: `editable material-name cells: ${editableNames}` } satisfies QaAssertion,
    { id: "material-worksheet-protected-boundary-visible", passed: boundaryText > 0, details: `protected boundary notes: ${boundaryText}` } satisfies QaAssertion,
  ] satisfies readonly QaAssertion[];
};

const verifyEquipmentWorksheetCreate: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Materials & Equipment");
  await page.getByRole("button", { name: "Equipment", exact: true }).first().click();
  await page.getByRole("button", { name: "Add equipment", exact: true }).click();
  await page.locator('[data-worksheet-responsive-surface="project-equipment"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const editor = await page.locator('[data-worksheet-responsive-surface="project-equipment"] [data-worksheet-editor="true"]').count();
  const canonicalIdentity = await page.locator('[data-worksheet-responsive-surface="project-equipment"] [data-worksheet-cell$=":canonicalEquipmentId"][data-worksheet-protected="true"]').count();
  return [
    { id: "equipment-worksheet-create-visible", passed: editor === 1, details: `equipment worksheet editors: ${editor}` } satisfies QaAssertion,
    { id: "equipment-canonical-identity-protected", passed: canonicalIdentity > 0, details: `canonical identity cells: ${canonicalIdentity}` } satisfies QaAssertion,
  ] satisfies readonly QaAssertion[];
};

const verifyEquipmentWorksheetEdit: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Materials & Equipment");
  await page.getByRole("button", { name: "Equipment", exact: true }).first().click();
  await page.locator('[data-phase3b="materials-equipment"] button:has-text("Edit")').first().click();
  await page.locator('[data-worksheet-responsive-surface="project-equipment"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const editableDates = await page.locator('[data-worksheet-responsive-surface="project-equipment"] [data-worksheet-cell$=":assignmentStart"][data-worksheet-editable="true"]').count();
  const mobileFallback = await page.locator('[data-worksheet-responsive-surface="project-equipment"] [data-worksheet-mobile-fallback="true"]').count();
  return [
    { id: "equipment-worksheet-edit-visible", passed: editableDates > 0, details: `editable project-start cells: ${editableDates}` } satisfies QaAssertion,
    { id: "equipment-worksheet-mobile-fallback-visible", passed: mobileFallback === 1, details: `equipment mobile fallbacks: ${mobileFallback}` } satisfies QaAssertion,
  ] satisfies readonly QaAssertion[];
};

const verifyProcurementSubcontractParity: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: /^Subcontracts/ }).first().click();
  await page.locator("text=Total Subcontracts").first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const totalSubcontracts = await page.locator("text=Total Subcontracts").count();
  const claimsMetric = await page.locator("text=Approved progress claims").count();
  const variationsMetric = await page.locator("text=Variations").count();
  const rows = await page.locator("tbody tr").count();
  return [
    { id: "production-equivalent-subcontract-tab-visible", passed: totalSubcontracts > 0, details: `subcontract KPI labels: ${totalSubcontracts}` } satisfies QaAssertion,
    { id: "subcontract-claims-metric-visible", passed: claimsMetric > 0, details: `claim KPI labels: ${claimsMetric}` } satisfies QaAssertion,
    { id: "subcontract-variations-metric-visible", passed: variationsMetric > 0, details: `variation KPI labels: ${variationsMetric}` } satisfies QaAssertion,
    { id: "subcontract-records-not-dropped", passed: rows > 0, details: `subcontract row nodes: ${rows}` } satisfies QaAssertion,
  ] satisfies readonly QaAssertion[];
};

const verifySubcontractMobileSettlementWorkflow: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: /^Subcontracts/ }).first().click();
  await page.locator("text=Total Subcontracts").first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const claimsButton = page.getByRole("button", { name: /Claims \(/ }).first();
  await claimsButton.click();
  await page.getByRole("heading", { name: /Subcontract Claims:/ }).waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const responsiveCards = await page.locator('[aria-label="Responsive subcontract claim cards"]').count();
  const inspectClaim = page.getByRole("button", { name: /Inspect claim|Edit claim/ }).first();
  await inspectClaim.click();
  await page.locator("text=Net Certified Payable").first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const paymentEvidence = await page.locator("text=Payment / settlement").count();
  const netPayable = await page.locator("text=Net Certified Payable").count();
  const recordPayment = await page.getByRole("link", { name: /Record Payment/ }).count();
  return [
    { id: "subcontract-mobile-claim-cards-visible", passed: responsiveCards === 1, details: `responsive claim card regions: ${responsiveCards}` },
    { id: "subcontract-net-payable-visible", passed: netPayable > 0, details: `net certified payable labels: ${netPayable}` },
    { id: "subcontract-settlement-evidence-visible", passed: paymentEvidence > 0, details: `settlement evidence panels: ${paymentEvidence}` },
    { id: "subcontract-record-payment-visible", passed: recordPayment > 0, details: `Record Payment links: ${recordPayment}` },
  ] satisfies readonly QaAssertion[];
};

const verifySettingsScreen: QaScenarioAction = async (page) => {
  const settingsHeading = await page.getByRole("heading", { name: "Operational settings", exact: true }).count();
  const regionalPreferences = await page.getByRole("heading", { name: "Regional display preferences", exact: true }).count();
  const roadmapHeading = await page.getByRole("heading", { name: "Hydroqualisense Features & Roadmap", exact: true }).count();
  const plannedWorkerRegistration = await page.locator('[data-product-feature-id="worker-registration"][data-product-feature-status="PLANNED"]').count();
  const futureFaceAttendance = await page.locator('[data-product-feature-id="face-recognition-attendance"][data-product-feature-status="FUTURE_DESIGN"]').count();
  const internalFeatureRegistry = await page.locator('[aria-label="Internal feature registry"]').count();
  const templateLink = await page.getByRole("button", { name: "Manage Document Templates", exact: true }).count();
  const fullTemplateSurface = await page.locator('[data-document-template-settings]').count();
  return [
    { id: "settings-heading-visible", passed: settingsHeading === 1, details: `settings headings: ${settingsHeading}` },
    { id: "regional-preferences-visible", passed: regionalPreferences === 1, details: `regional preference headings: ${regionalPreferences}` },
    { id: "client-roadmap-visible", passed: roadmapHeading === 1, details: `client roadmap headings: ${roadmapHeading}` },
    { id: "planned-worker-registration-visible", passed: plannedWorkerRegistration === 1, details: `Worker Registration cards: ${plannedWorkerRegistration}` },
    { id: "future-face-attendance-visible", passed: futureFaceAttendance === 1, details: `Future / Design Stage cards: ${futureFaceAttendance}` },
    { id: "internal-feature-registry-hidden", passed: internalFeatureRegistry === 0, details: `internal feature registry panels: ${internalFeatureRegistry}` },
    { id: "settings-template-link-visible", passed: templateLink === 1, details: `template navigation links: ${templateLink}` },
    { id: "settings-full-template-surface-relocated", passed: fullTemplateSurface === 0, details: `full template panels in Settings: ${fullTemplateSurface}` },
  ] satisfies readonly QaAssertion[];
};

const verifyHelpIndex: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Help Center");
  const helpCenter = await page.locator('[data-help-center="true"]').count();
  const search = await page.getByRole("textbox", { name: "Search Help", exact: true }).count();
  const categories = await page.locator('[data-help-category-list="true"]').count();
  const startHere = await page.getByRole("heading", { name: "Start here", exact: true }).count();
  const topics = await page.getByRole("region", { name: "Help topics", exact: true }).count();
  return [
    { id: "help-center-index-visible", passed: helpCenter === 1, details: `Help Center surfaces: ${helpCenter}` },
    { id: "help-center-search-visible", passed: search === 1, details: `Help search inputs: ${search}` },
    { id: "help-center-categories-visible", passed: categories === 1, details: `Help category lists: ${categories}` },
    { id: "help-center-start-here-visible", passed: startHere === 1, details: `Start here headings: ${startHere}` },
    { id: "help-center-topics-visible", passed: topics === 1, details: `Help topic regions: ${topics}` },
  ] satisfies readonly QaAssertion[];
};

const verifyHelpArticle: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Supplier Invoice review");
  const article = await page.locator('[data-help-article="true"]').count();
  const breadcrumbs = await page.locator('[data-help-breadcrumbs="true"]').count();
  const returnToWorkspace = await page.getByRole("link", { name: "Return to workspace", exact: true }).count();
  const articleText = await page.locator("text=Supplier Invoice evidence remains distinct from the authoritative linked Expense payable and cost record.").count();
  await page.reload({ waitUntil: "networkidle", timeout: READY_TIMEOUT_MS });
  await waitForHeading(page, "Supplier Invoice review");
  const refreshedArticle = await page.locator('[data-help-article="true"]').count();
  return [
    { id: "help-invoice-review-article-visible", passed: article === 1, details: `invoice-review article surfaces: ${article}` },
    { id: "help-invoice-review-breadcrumbs-visible", passed: breadcrumbs === 1, details: `Help breadcrumb regions: ${breadcrumbs}` },
    { id: "help-invoice-review-return-visible", passed: returnToWorkspace === 1, details: `return-to-workspace links: ${returnToWorkspace}` },
    { id: "help-invoice-review-boundary-visible", passed: articleText === 1, details: `invoice-review boundary statements: ${articleText}` },
    { id: "help-invoice-review-refresh-stable", passed: refreshedArticle === 1, details: `refreshed invoice-review articles: ${refreshedArticle}` },
  ] satisfies readonly QaAssertion[];
};

const verifyHelpNavigation: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Help Center");
  const search = page.getByRole("textbox", { name: "Search Help", exact: true });
  await search.fill("supplier invoice");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await waitForHeading(page, "Search results");
  const searchResult = await page.getByRole("link", { name: /Supplier Invoice review/ }).count();
  const searchPath = page.url();

  const category = page.getByRole("button", { name: /Supplier Invoices and Expenses/ }).first();
  await category.click();
  const activeCategory = await page.locator('button[aria-pressed="true"]').count();
  const categoryResult = await page.getByRole("link", { name: /Supplier Invoice review/ }).count();

  await page.getByRole("link", { name: /Supplier Invoice review/ }).first().click();
  await waitForHeading(page, "Supplier Invoice review");
  const articlePath = page.url();
  await page.goBack();
  await waitForHeading(page, "Search results");
  const backPath = page.url();
  await page.goForward();
  await waitForHeading(page, "Supplier Invoice review");
  const forwardPath = page.url();

  return [
    { id: "help-search-matching-result", passed: searchResult > 0 && searchPath.includes("q=supplier+invoice"), details: `matching results: ${searchResult}; path: ${searchPath}` },
    { id: "help-category-selection", passed: activeCategory === 1 && categoryResult > 0, details: `active categories: ${activeCategory}; category results: ${categoryResult}` },
    { id: "help-article-deep-link", passed: articlePath.includes("topic=invoice-review"), details: `article path: ${articlePath}` },
    { id: "help-browser-back", passed: backPath.includes("/help") && !backPath.includes("topic=invoice-review"), details: `back path: ${backPath}` },
    { id: "help-browser-forward", passed: forwardPath.includes("topic=invoice-review"), details: `forward path: ${forwardPath}` },
  ] satisfies readonly QaAssertion[];
};

const verifyHelpUnknownTopicFallback: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Help Center");
  const invalidTopic = await page.locator('[data-help-invalid-topic="true"]').count();
  const article = await page.locator('[data-help-article="true"]').count();
  const index = await page.getByRole("heading", { name: "Start here", exact: true }).count();
  return [
    { id: "help-unknown-topic-fallback-visible", passed: invalidTopic === 1, details: `invalid-topic notices: ${invalidTopic}` },
    { id: "help-unknown-topic-does-not-select-article", passed: article === 0, details: `selected articles: ${article}` },
    { id: "help-unknown-topic-returns-to-index", passed: index === 1, details: `Start here headings: ${index}` },
  ] satisfies readonly QaAssertion[];
};

const verifyPageHeaderHelpAction: QaScenarioAction = async (page) => {
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

const verifyAttachmentContextualHelp: QaScenarioAction = async (page) => {
  const trigger = page.getByRole("button", { name: "Attachment eligibility help", exact: true });
  const triggerCount = await trigger.count();
  await trigger.first().press("Enter");
  const dialog = page.getByRole("dialog", { name: "Eligible document attachments", exact: true });
  await dialog.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const dialogCount = await dialog.count();
  const ariaModal = await page.evaluate(() => document.querySelector('[role="dialog"][aria-labelledby^="contextual-help-"]')?.getAttribute("aria-modal") || "");
  const focusedOnOpen = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || "");
  const articleLink = await page.getByRole("link", { name: "Read more in Help Center", exact: true }).count();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached", timeout: READY_TIMEOUT_MS });
  const focusedLabel = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || "");
  return [
    { id: "contextual-help-trigger-visible", passed: triggerCount === 1, details: `attachment-help triggers: ${triggerCount}` },
    { id: "contextual-help-dialog-visible", passed: dialogCount === 1, details: `attachment-help dialogs: ${dialogCount}` },
    { id: "contextual-help-keyboard-opened", passed: focusedOnOpen === "Attachment eligibility help" && ariaModal === "false", details: `keyboard focus: ${focusedOnOpen || "none"}; aria-modal: ${ariaModal || "missing"}` },
    { id: "contextual-help-article-link-visible", passed: articleLink === 1, details: `configured Help Center article links: ${articleLink}` },
    { id: "contextual-help-escape-closes", passed: true, details: "Escape detached the contextual-help dialog" },
    { id: "contextual-help-focus-restored", passed: focusedLabel === "Attachment eligibility help", details: `focused aria-label: ${focusedLabel || "none"}` },
  ] satisfies readonly QaAssertion[];
};

const verifyRfiMissingRecordRecovery: QaScenarioAction = async (page) => {
  await page.locator("text=RFI not available").first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const unavailable = await page.locator("text=RFI not available").count();
  const returnToRegister = await page.getByRole("button", { name: "Return to register", exact: true }).count();
  return [
    { id: "rfi-missing-record-recovery-visible", passed: unavailable > 0, details: `RFI unavailable labels: ${unavailable}` },
    { id: "rfi-missing-record-return-visible", passed: returnToRegister === 1, details: `Return-to-register controls: ${returnToRegister}` },
  ] satisfies readonly QaAssertion[];
};

const verifySubmittalMissingRecordRecovery: QaScenarioAction = async (page) => {
  await page.locator("text=Submittal not available").first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const unavailable = await page.locator("text=Submittal not available").count();
  const returnToRegister = await page.getByRole("button", { name: "Return to register", exact: true }).count();
  return [
    { id: "submittal-missing-record-recovery-visible", passed: unavailable > 0, details: `Submittal unavailable labels: ${unavailable}` },
    { id: "submittal-missing-record-return-visible", passed: returnToRegister === 1, details: `Return-to-register controls: ${returnToRegister}` },
  ] satisfies readonly QaAssertion[];
};

function route(id: string, canonicalPath: string) {
  return { id, canonicalPath } as const;
}

const R4E_VISUAL_ROUTES = [
  { id: "dashboard", canonicalPath: "/dashboard", path: "/demo/app/dashboard", label: "Home" },
  { id: "invoices", canonicalPath: "/invoices", path: "/demo/app/invoices", label: "Supplier Invoices" },
  { id: "review", canonicalPath: "/review?invoiceId=:invoiceId", path: "/demo/app/review?invoiceId=demo-invoice-07", label: "Invoice Review" },
  { id: "payroll", canonicalPath: "/payroll", path: "/demo/app/payroll", label: "Payroll" },
  { id: "inbox", canonicalPath: "/email-sms", path: "/demo/app/email-sms?view=compose", label: "Email and SMS" },
  { id: "cash", canonicalPath: "/cash", path: "/demo/app/cash", label: "Cash and Banking" },
  { id: "expenses", canonicalPath: "/expenses", path: "/demo/app/expenses", label: "Expenses" },
  { id: "procurement", canonicalPath: "/procurement", path: "/demo/app/procurement", label: "Procurement" },
  { id: "warehouse", canonicalPath: "/warehouse", path: "/demo/app/warehouse", label: "Warehouse" },
  { id: "equipment", canonicalPath: "/equipment", path: "/demo/app/equipment", label: "Equipment" },
  { id: "documents", canonicalPath: "/documents", path: "/demo/app/documents", label: "Documents" },
  { id: "reports", canonicalPath: "/reports", path: "/demo/app/reports", label: "Reports" },
  { id: "project-materials-equipment", canonicalPath: "/projects/:projectId/materials-equipment", path: "/demo/app/projects/demo-project-warehouse/materials-equipment", label: "Project Materials and Equipment" },
  { id: "rfis", canonicalPath: "/projects/:projectId/rfis", path: "/demo/app/projects/demo-project-warehouse/rfis", label: "RFIs" },
  { id: "submittals", canonicalPath: "/projects/:projectId/submittals", path: "/demo/app/projects/demo-project-warehouse/submittals", label: "Submittals" },
  { id: "site-logs", canonicalPath: "/projects/:projectId/site-logs", path: "/demo/app/projects/demo-project-warehouse/site-logs", label: "Site Logs" },
  { id: "vendors", canonicalPath: "/vendors", path: "/demo/app/vendors", label: "Vendors" },
  { id: "settings", canonicalPath: "/settings", path: "/demo/app/settings", label: "Settings" },
] as const;

const R4E_SYSTEM_THEME_ROUTES = R4E_VISUAL_ROUTES.filter((candidate) => ["dashboard", "invoices", "payroll"].includes(candidate.id));
const R4E_DARK_ROUTE_AUDIT = [
  { id: "project-overview", canonicalPath: "/projects/:projectId", path: "/demo/app/projects/demo-project-warehouse", label: "Project overview" },
  { id: "project-financial-control", canonicalPath: "/projects/:projectId", path: "/demo/app/projects/demo-project-solar", label: "Project financial control" },
  { id: "project-documents", canonicalPath: "/projects/:projectId/documents", path: "/demo/app/projects/demo-project-warehouse/documents", label: "Project documents" },
  { id: "blueprint-viewer", canonicalPath: "/projects/:projectId/documents", path: "/demo/app/projects/demo-project-warehouse/documents", label: "Blueprint viewer" },
  { id: "engineering-documents", canonicalPath: "/documents", path: "/demo/app/documents", label: "Engineering documents" },
  { id: "rfi-detail", canonicalPath: "/projects/:projectId/rfis?rfiId=:rfiId", path: "/demo/app/projects/demo-project-warehouse/rfis?rfiId=demo-rfi-missing-s3e", label: "RFI detail recovery" },
  { id: "submittal-detail", canonicalPath: "/projects/:projectId/submittals?submittalId=:submittalId&roundId=:roundId", path: "/demo/app/projects/demo-project-warehouse/submittals?submittalId=demo-sub-missing-s3e&roundId=demo-round-missing-s3e", label: "Submittal detail recovery" },
  { id: "site-log-detail", canonicalPath: "/projects/:projectId/site-logs?siteLogId=:siteLogId", path: "/demo/app/projects/demo-project-warehouse/site-logs?siteLogId=demo-site-log-wh-concrete", label: "Site Log detail" },
  { id: "cash-settlement", canonicalPath: "/cash?transactionId=:transactionId", path: "/demo/app/cash?transactionId=demo-transaction-19", label: "Cash settlement" },
  { id: "extract", canonicalPath: "/extract", path: "/demo/app/extract", label: "Invoice extraction" },
  { id: "invoice-detail", canonicalPath: "/invoices/:invoiceId", path: "/demo/app/invoices/demo-invoice-01", label: "Supplier invoice detail" },
  { id: "payroll-run", canonicalPath: "/payroll?runId=:runId", path: "/demo/app/payroll?runId=demo-payroll-run-9", label: "Payroll run" },
  { id: "project-billing", canonicalPath: "/projects/:projectId/billing?billingId=:billingId", path: "/demo/app/projects/demo-project-warehouse/billing?billingId=demo-client-billing-warehouse-02", label: "Client billing" },
  { id: "assistant", canonicalPath: "/assistant", path: "/demo/app/assistant", label: "Assistant" },
  { id: "help", canonicalPath: "/help?topic=invoice-review", path: "/help?topic=invoice-review", label: "Help Center article" },
] as const;

const verifyR4eDarkRouteAudit: QaScenarioAction = async (page) => {
  const themeAssertions = (await applyDarkTheme(page)) || [];
  const shellAssertions = (await verifyR4eResponsiveShell(page)) || [];
  return [...themeAssertions, ...shellAssertions];
};

function r4eThemeAction(preference: "light" | "dark" | "system-light" | "system-dark"): QaScenarioAction {
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

export const DEMO_QA_SCENARIOS: readonly QaScenarioDefinition[] = [
  defineQaScenario({ feature: "demo", route: route("landing", "/demo"), path: "/demo", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "dashboard", route: route("dashboard", "/dashboard"), path: "/demo/app/dashboard", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "dashboard", route: route("dashboard", "/dashboard"), path: "/demo/app/dashboard", interactionState: "base route loaded", viewport: QA_VIEWPORTS.laptop }),
  defineQaScenario({ feature: "dashboard", route: route("dashboard", "/dashboard"), path: "/demo/app/dashboard", interactionState: "mobile navigation opened", viewport: QA_VIEWPORTS.mobile, action: openMobileNavigation }),
  defineQaScenario({ feature: "projects", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "portfolio dashboard verified", viewport: QA_VIEWPORTS.desktop, action: verifyPortfolioDashboard }),
  defineQaScenario({ feature: "projects", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "attention filters verified", viewport: QA_VIEWPORTS.desktop, action: verifyPortfolioAttention }),
  defineQaScenario({ feature: "projects", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "portfolio dashboard verified", viewport: QA_VIEWPORTS.laptop, action: verifyPortfolioDashboard }),
  defineQaScenario({ feature: "projects", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "portfolio dashboard verified", viewport: QA_VIEWPORTS.tablet, action: verifyPortfolioDashboard }),
  defineQaScenario({ feature: "projects", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "portfolio dashboard verified", viewport: QA_VIEWPORTS.mobile, action: verifyPortfolioDashboard }),
  defineQaScenario({ feature: "projects", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "UI-PROJECTS-ACTION-1 Light popover reachability", viewport: R4E_VIEWPORTS[1], action: projectCardActionTheme("light") }),
  defineQaScenario({ feature: "projects", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "UI-PROJECTS-ACTION-1 Dark popover reachability", viewport: R4E_VIEWPORTS[1], action: projectCardActionTheme("dark") }),
  defineQaScenario({ feature: "projects", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "UI-PROJECTS-ACTION-1 Light phone popover reachability", viewport: R4E_VIEWPORTS[3], action: projectCardActionTheme("light") }),
  defineQaScenario({ feature: "projects", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "UI-PROJECTS-ACTION-1 Dark phone popover reachability", viewport: R4E_VIEWPORTS[3], action: projectCardActionTheme("dark") }),
  defineQaScenario({ feature: "procurement", route: route("procurement", "/procurement"), path: "/demo/app/procurement", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "procurement", route: route("procurement", "/procurement"), path: "/demo/app/procurement", interactionState: "RFQ and Purchase Order draft worksheets verified", viewport: QA_VIEWPORTS.desktop, action: verifyProcurementDraftWorksheets }),
  defineQaScenario({ feature: "procurement", route: route("procurement", "/procurement"), path: "/demo/app/procurement", interactionState: "RFQ and Purchase Order draft worksheets verified", viewport: QA_VIEWPORTS.tablet, action: verifyProcurementDraftWorksheets }),
  defineQaScenario({ feature: "procurement", route: route("procurement", "/procurement"), path: "/demo/app/procurement", interactionState: "RFQ and Purchase Order draft worksheets verified", viewport: QA_VIEWPORTS.mobile, action: verifyProcurementDraftWorksheets }),
  defineQaScenario({ feature: "procurement", route: route("procurement", "/procurement"), path: "/demo/app/procurement", interactionState: "subcontract claim and variation parity verified", viewport: QA_VIEWPORTS.desktop, action: verifyProcurementSubcontractParity }),
  defineQaScenario({ feature: "procurement", route: route("procurement", "/procurement"), path: "/demo/app/procurement", interactionState: "subcontract claim settlement workflow verified", viewport: QA_VIEWPORTS.mobile, action: verifySubcontractMobileSettlementWorkflow }),
  defineQaScenario({ feature: "document-delivery", route: route("procurement", "/procurement"), path: "/demo/app/procurement", interactionState: "Purchase Order delivery preview and disconnected history verified", viewport: QA_VIEWPORTS.desktop, action: verifyPurchaseOrderDocumentDeliverySurface }),
  defineQaScenario({ feature: "document-delivery", route: route("procurement", "/procurement"), path: "/demo/app/procurement", interactionState: "Purchase Order delivery preview and disconnected history verified", viewport: QA_VIEWPORTS.mobile, action: verifyPurchaseOrderDocumentDeliverySurface }),
  defineQaScenario({ feature: "warehouse-inventory", route: route("warehouse", "/warehouse"), path: "/demo/app/warehouse", interactionState: "warehouse ledger rendered", viewport: QA_VIEWPORTS.desktop, action: verifyWarehouseInventoryScreen }),
  defineQaScenario({ feature: "warehouse-inventory", route: route("warehouse", "/warehouse"), path: "/demo/app/warehouse", interactionState: "warehouse source continuation verified", viewport: QA_VIEWPORTS.mobile, action: verifyWarehouseInventoryScreen }),
  defineQaScenario({ feature: "warehouse-item-master", route: route("warehouse", "/warehouse"), path: "/demo/app/warehouse", interactionState: "Warehouse item create worksheet and validation verified", viewport: QA_VIEWPORTS.desktop, action: verifyWarehouseItemWorksheetCreate }),
  defineQaScenario({ feature: "warehouse-item-master", route: route("warehouse", "/warehouse"), path: "/demo/app/warehouse", interactionState: "Warehouse item edit worksheet verified", viewport: QA_VIEWPORTS.laptop, action: verifyWarehouseItemWorksheetEdit }),
  defineQaScenario({ feature: "warehouse-item-master", route: route("warehouse", "/warehouse"), path: "/demo/app/warehouse", interactionState: "Warehouse item phone worksheet verified", viewport: QA_VIEWPORTS.mobile, action: verifyWarehouseItemWorksheetEdit }),
  defineQaScenario({ feature: "equipment-registry", route: route("equipment", "/equipment"), path: "/demo/app/equipment", interactionState: "Equipment Registry rendered", viewport: QA_VIEWPORTS.desktop, action: verifyEquipmentRegistryScreen }),
  defineQaScenario({ feature: "equipment-master", route: route("equipment", "/equipment"), path: "/demo/app/equipment", interactionState: "Equipment create worksheet verified", viewport: QA_VIEWPORTS.tablet, action: verifyCanonicalEquipmentWorksheetCreate }),
  defineQaScenario({ feature: "equipment-master", route: route("equipment", "/equipment"), path: "/demo/app/equipment", interactionState: "Equipment edit worksheet verified", viewport: QA_VIEWPORTS.desktop, action: verifyCanonicalEquipmentWorksheetEdit }),
  defineQaScenario({ feature: "equipment-master", route: route("equipment", "/equipment"), path: "/demo/app/equipment", interactionState: "Equipment phone worksheet verified", viewport: QA_VIEWPORTS.mobile, action: verifyCanonicalEquipmentWorksheetEdit }),
  defineQaScenario({ feature: "project-workspace", route: route("project-overview", "/projects/:projectId"), path: "/demo/app/projects", interactionState: "project selected", viewport: QA_VIEWPORTS.desktop, action: openProjectFromDirectory }),
  defineQaScenario({ feature: "project-workspace", route: route("project-overview", "/projects/:projectId"), path: PROJECT_ROOT, interactionState: "attention and engineering drilldowns verified", viewport: QA_VIEWPORTS.desktop, action: verifyProjectAttentionAndEngineering }),
  defineQaScenario({ feature: "project-materials-equipment", route: route("project-materials-equipment", "/projects/:projectId/materials-equipment"), path: `${PROJECT_ROOT}/materials-equipment`, interactionState: "materials and equipment browse rendered", viewport: QA_VIEWPORTS.desktop, action: verifyMaterialsEquipmentBrowse }),
  defineQaScenario({ feature: "project-materials-equipment", route: route("project-materials-equipment", "/projects/:projectId/materials-equipment"), path: `${PROJECT_ROOT}/materials-equipment`, interactionState: "materials and equipment browse rendered", viewport: QA_VIEWPORTS.laptop, action: verifyMaterialsEquipmentBrowse }),
  defineQaScenario({ feature: "project-materials-equipment", route: route("project-materials-equipment", "/projects/:projectId/materials-equipment"), path: `${PROJECT_ROOT}/materials-equipment`, interactionState: "materials and equipment browse rendered", viewport: QA_VIEWPORTS.tablet, action: verifyMaterialsEquipmentBrowse }),
  defineQaScenario({ feature: "project-materials-equipment", route: route("project-materials-equipment", "/projects/:projectId/materials-equipment"), path: `${PROJECT_ROOT}/materials-equipment`, interactionState: "materials and equipment browse rendered", viewport: QA_VIEWPORTS.mobile, action: verifyMaterialsEquipmentBrowse }),
  defineQaScenario({ feature: "project-materials-equipment", route: route("project-materials-equipment", "/projects/:projectId/materials-equipment"), path: `${PROJECT_ROOT}/materials-equipment`, interactionState: "material worksheet create rendered", viewport: QA_VIEWPORTS.desktop, action: verifyMaterialWorksheetCreate }),
  defineQaScenario({ feature: "project-materials-equipment", route: route("project-materials-equipment", "/projects/:projectId/materials-equipment"), path: `${PROJECT_ROOT}/materials-equipment`, interactionState: "material worksheet validation rendered", viewport: QA_VIEWPORTS.desktop, action: verifyMaterialWorksheetValidation }),
  defineQaScenario({ feature: "project-materials-equipment", route: route("project-materials-equipment", "/projects/:projectId/materials-equipment"), path: `${PROJECT_ROOT}/materials-equipment`, interactionState: "material worksheet edit rendered", viewport: QA_VIEWPORTS.laptop, action: verifyMaterialWorksheetEdit }),
  defineQaScenario({ feature: "project-materials-equipment", route: route("project-materials-equipment", "/projects/:projectId/materials-equipment"), path: `${PROJECT_ROOT}/materials-equipment`, interactionState: "equipment worksheet create rendered", viewport: QA_VIEWPORTS.tablet, action: verifyEquipmentWorksheetCreate }),
  defineQaScenario({ feature: "project-materials-equipment", route: route("project-materials-equipment", "/projects/:projectId/materials-equipment"), path: `${PROJECT_ROOT}/materials-equipment`, interactionState: "equipment worksheet edit rendered", viewport: QA_VIEWPORTS.mobile, action: verifyEquipmentWorksheetEdit }),
  defineQaScenario({ feature: "project-financial-control", route: route("project-financial-control", "/projects/:projectId"), path: PROJECT_ROOT, interactionState: "financial control dashboard verified", viewport: QA_VIEWPORTS.desktop, action: verifyProjectFinancialControlDashboard }),
  defineQaScenario({ feature: "project-financial-control", route: route("project-financial-control", "/projects/:projectId"), path: PROJECT_ROOT, interactionState: "financial control dashboard verified", viewport: QA_VIEWPORTS.laptop, action: verifyProjectFinancialControlDashboard }),
  defineQaScenario({ feature: "project-financial-control", route: route("project-financial-control", "/projects/:projectId"), path: PROJECT_ROOT, interactionState: "financial control dashboard verified", viewport: QA_VIEWPORTS.tablet, action: verifyProjectFinancialControlDashboard }),
  defineQaScenario({ feature: "project-financial-control", route: route("project-financial-control", "/projects/:projectId"), path: PROJECT_ROOT, interactionState: "financial control dashboard verified", viewport: QA_VIEWPORTS.mobile, action: verifyProjectFinancialControlDashboard }),
  defineQaScenario({ feature: "project-financial-control", route: route("project-financial-control", "/projects/:projectId"), path: "/demo/app/projects/demo-project-solar", interactionState: "mixed-currency control state verified", viewport: QA_VIEWPORTS.desktop, action: verifyPhpOnlyProjectControlState }),
  defineQaScenario({ feature: "project-workspace", route: route("project-overview", "/projects/:projectId"), path: PROJECT_ROOT, interactionState: "base route loaded", viewport: QA_VIEWPORTS.tablet }),
  defineQaScenario({ feature: "project-workspace", route: route("project-documents", "/projects/:projectId/documents"), path: `${PROJECT_ROOT}/documents`, interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "project-workspace", route: route("project-documents", "/projects/:projectId/documents"), path: `${PROJECT_ROOT}/documents`, interactionState: "base route loaded", viewport: QA_VIEWPORTS.mobile }),
  defineQaScenario({ feature: "engineering-documents", route: route("blueprint-viewer", "/projects/:projectId/documents"), path: `${PROJECT_ROOT}/documents`, interactionState: "demo drawing preview opened", viewport: QA_VIEWPORTS.desktop, action: openDemoDrawingPreview }),
  defineQaScenario({ feature: "documents", route: route("documents", "/documents"), path: "/demo/app/documents", interactionState: "unified document Library rendered", viewport: QA_VIEWPORTS.desktop, action: verifyDocumentsWorkspace }),
  defineQaScenario({ feature: "documents", route: route("documents", "/documents"), path: "/demo/app/documents", interactionState: "unified document Library rendered", viewport: QA_VIEWPORTS.tablet, action: verifyDocumentsWorkspace }),
  defineQaScenario({ feature: "documents", route: route("documents", "/documents"), path: "/demo/app/documents", interactionState: "unified document Library rendered", viewport: QA_VIEWPORTS.mobile, action: verifyDocumentsWorkspace }),
  defineQaScenario({ feature: "documents", route: route("documents", "/documents?managedId=:managedId"), path: "/demo/app/documents?managedId=demo-managed-warranty-001", interactionState: "managed document detail and immutable version history rendered", viewport: QA_VIEWPORTS.desktop, action: verifyManagedDocumentDetail }),
  defineQaScenario({ feature: "documents", route: route("documents", "/documents?managedId=:managedId"), path: "/demo/app/documents?managedId=demo-managed-warranty-001", interactionState: "managed document detail and immutable version history rendered", viewport: QA_VIEWPORTS.mobile, action: verifyManagedDocumentDetail }),
  defineQaScenario({ feature: "documents", route: route("documents", "/documents?managedId=:managedId"), path: "/demo/app/documents?managedId=demo-managed-artifact-001", interactionState: "managed generated artifact provenance and read-only state rendered", viewport: QA_VIEWPORTS.desktop, action: verifyManagedArtifactDetail }),
  defineQaScenario({ feature: "documents", route: route("documents", "/documents"), path: "/demo/app/documents", interactionState: "Document Center Create rendered", viewport: QA_VIEWPORTS.desktop, action: verifyDocumentsCreateWorkspace }),
  defineQaScenario({ feature: "documents", route: route("documents", "/documents"), path: "/demo/app/documents", interactionState: "Document Center Create rendered", viewport: QA_VIEWPORTS.mobile, action: verifyDocumentsCreateWorkspace }),
  defineQaScenario({ feature: "documents", route: route("documents", "/documents"), path: "/demo/app/documents", interactionState: "Document Center Templates rendered", viewport: QA_VIEWPORTS.desktop, action: verifyDocumentsTemplatesWorkspace }),
  defineQaScenario({ feature: "documents", route: route("documents", "/documents"), path: "/demo/app/documents", interactionState: "Document Center Templates rendered", viewport: QA_VIEWPORTS.mobile, action: verifyDocumentsTemplatesWorkspace }),
  defineQaScenario({ feature: "documents", route: route("documents", "/documents"), path: "/demo/app/documents", interactionState: "exact document handoff to Email / SMS compose", viewport: QA_VIEWPORTS.desktop, action: verifyDocumentsToEmailHandoff }),
  defineQaScenario({ feature: "engineering-documents", route: route("engineering-documents", "/documents"), path: "/demo/app/documents", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "rfis", route: route("rfis", "/projects/:projectId/rfis"), path: `${PROJECT_ROOT}/rfis`, interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "rfis", route: route("rfi-detail", "/projects/:projectId/rfis?rfiId=:rfiId"), path: `${PROJECT_ROOT}/rfis?rfiId=demo-rfi-missing-s3e`, interactionState: "missing-record recovery rendered", viewport: QA_VIEWPORTS.desktop, action: verifyRfiMissingRecordRecovery }),
  defineQaScenario({ feature: "submittals", route: route("submittals", "/projects/:projectId/submittals"), path: `${PROJECT_ROOT}/submittals`, interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "submittals", route: route("submittal-detail", "/projects/:projectId/submittals?submittalId=:submittalId&roundId=:roundId"), path: `${PROJECT_ROOT}/submittals?submittalId=demo-sub-missing-s3e&roundId=demo-round-missing-s3e`, interactionState: "missing-record recovery rendered", viewport: QA_VIEWPORTS.desktop, action: verifySubmittalMissingRecordRecovery }),
  defineQaScenario({ feature: "site-logs", route: route("site-logs", "/projects/:projectId/site-logs"), path: `${PROJECT_ROOT}/site-logs`, interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "site-logs", route: route("site-log-detail", "/projects/:projectId/site-logs?siteLogId=:siteLogId"), path: `${PROJECT_ROOT}/site-logs?siteLogId=demo-site-log-wh-concrete`, interactionState: "Site Log detail opened", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "site-logs", route: route("site-logs", "/projects/:projectId/site-logs"), path: `${PROJECT_ROOT}/site-logs`, interactionState: "base route loaded", viewport: QA_VIEWPORTS.tablet }),
  defineQaScenario({ feature: "site-logs", route: route("site-logs", "/projects/:projectId/site-logs"), path: `${PROJECT_ROOT}/site-logs`, interactionState: "base route loaded", viewport: QA_VIEWPORTS.mobile }),
  defineQaScenario({ feature: "cash-banking", route: route("cash", "/cash"), path: "/demo/app/cash", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "cash-banking", route: route("cash", "/cash"), path: "/demo/app/cash", interactionState: "cash browse with intentional allocation choice", viewport: QA_VIEWPORTS.desktop, action: verifyCashBrowseAndChoice }),
  defineQaScenario({ feature: "cash-banking", route: route("cash-settlement", "/cash?transactionId=:transactionId"), path: "/demo/app/cash?transactionId=demo-transaction-split-01", interactionState: "cash settlement workspace opened", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "cash-banking", route: route("cash", "/cash"), path: "/demo/app/cash", interactionState: "base route loaded", viewport: QA_VIEWPORTS.tablet }),
  defineQaScenario({ feature: "cash-banking", route: route("cash-settlement", "/cash?transactionId=:transactionId"), path: "/demo/app/cash?transactionId=demo-transaction-19", interactionState: "cash settlement result and return context verified", viewport: QA_VIEWPORTS.desktop, action: verifyCashSettlementResult }),
  defineQaScenario({ feature: "cash-banking", route: route("cash-settlement", "/cash?transactionId=:transactionId"), path: "/demo/app/cash?transactionId=demo-transaction-19", interactionState: "cash settlement result and return context verified", viewport: QA_VIEWPORTS.mobile, action: verifyCashSettlementResult }),
  defineQaScenario({ feature: "cash-banking", route: route("cash", "/cash"), path: "/demo/app/cash", interactionState: "cash internal transfer workflow kept separate", viewport: QA_VIEWPORTS.desktop, action: verifyCashTransferWorkflowSeparation }),
  defineQaScenario({ feature: "invoice-extraction", route: route("extract", "/extract"), path: "/demo/app/extract", interactionState: "extractor screen rendered", viewport: QA_VIEWPORTS.desktop, action: verifyExtractorScreen }),
  defineQaScenario({ feature: "email-sms", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms", interactionState: "Email / SMS workspace rendered with provider-gated compose and history", viewport: QA_VIEWPORTS.desktop, action: verifyEmailSmsWorkspace }),
  defineQaScenario({ feature: "email-sms", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms", interactionState: "Email / SMS workspace rendered with provider-gated compose and history", viewport: QA_VIEWPORTS.tablet, action: verifyEmailSmsWorkspace }),
  defineQaScenario({ feature: "email-sms", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms", interactionState: "Email / SMS workspace rendered with provider-gated compose and history", viewport: QA_VIEWPORTS.mobile, action: verifyEmailSmsWorkspace }),
  defineQaScenario({ feature: "email-sms", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms?view=compose", interactionState: "Email compose review surface rendered", viewport: QA_VIEWPORTS.desktop, action: verifyEmailComposeWorkspace }),
  defineQaScenario({ feature: "email-sms", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms?view=compose", interactionState: "Email compose review surface rendered", viewport: QA_VIEWPORTS.mobile, action: verifyEmailComposeWorkspace }),
  defineQaScenario({ feature: "email-sms", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms?view=compose&channel=sms", interactionState: "SMS compose review surface rendered", viewport: QA_VIEWPORTS.desktop, action: verifySmsComposeWorkspace }),
  defineQaScenario({ feature: "email-sms", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms?view=compose&channel=sms", interactionState: "SMS compose review surface rendered", viewport: QA_VIEWPORTS.mobile, action: verifySmsComposeWorkspace }),
  defineQaScenario({ feature: "email-sms", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms?view=sent", interactionState: "sent delivery history surface rendered", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "email-sms", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms?view=sms", interactionState: "SMS not-configured surface rendered", viewport: QA_VIEWPORTS.desktop, action: verifySmsNotConfigured }),
  defineQaScenario({ feature: "email-sms", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms?view=sms", interactionState: "SMS not-configured surface rendered", viewport: QA_VIEWPORTS.mobile, action: verifySmsNotConfigured }),
  defineQaScenario({ feature: "invoices", route: route("invoices", "/invoices"), path: "/demo/app/invoices", interactionState: "supplier invoice navigation and register verified", viewport: QA_VIEWPORTS.desktop, action: verifySupplierInvoiceNavigation }),
  defineQaScenario({ feature: "invoices", route: route("invoice-detail", "/invoices/:invoiceId"), path: "/demo/app/invoices/demo-invoice-01", interactionState: "invoice detail opened", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "supplier-payables", route: route("invoice-detail", "/invoices/:invoiceId"), path: "/demo/app/invoices/demo-invoice-02", interactionState: "inline supplier payment modal opened", viewport: QA_VIEWPORTS.desktop, action: verifySupplierPayableBridge }),
  defineQaScenario({ feature: "supplier-payables", route: route("invoice-detail", "/invoices/:invoiceId"), path: "/demo/app/invoices/demo-invoice-02", interactionState: "inline supplier payment modal opened", viewport: QA_VIEWPORTS.mobile, action: verifySupplierPayableBridge }),
  ...UX_EDIT_1A_VIEWPORTS.map((viewport) => defineQaScenario({ feature: "supplier-invoice-ux-edit-1a", route: route("review", "/review?invoiceId=:invoiceId"), path: "/demo/app/review?invoiceId=demo-invoice-07", interactionState: "Supplier Invoice source and extracted worksheet review", viewport, action: verifySupplierInvoiceReview })),
  ...([UX_EDIT_1A_VIEWPORTS[1], UX_EDIT_1A_VIEWPORTS[3]] as const).map((viewport) => defineQaScenario({ feature: "supplier-invoice-ux-edit-1a-readonly", route: route("review", "/review?invoiceId=:invoiceId"), path: "/demo/app/review?invoiceId=demo-invoice-01", interactionState: "Verified Supplier Invoice cells remain read-only after one pointer click", viewport, action: verifySupplierInvoiceReadOnlyCell })),
  defineQaScenario({ feature: "vendors", route: route("vendors", "/vendors"), path: "/demo/app/vendors", interactionState: "vendor directory rendered", viewport: QA_VIEWPORTS.desktop, action: verifyVendorsScreen }),
  defineQaScenario({ feature: "vendors", route: route("vendors", "/vendors"), path: "/demo/app/vendors", interactionState: "vendor master worksheet maintenance rendered", viewport: QA_VIEWPORTS.desktop, action: verifyVendorMasterWorksheet }),
  defineQaScenario({ feature: "vendors", route: route("vendors", "/vendors"), path: "/demo/app/vendors", interactionState: "vendor master worksheet maintenance rendered", viewport: QA_VIEWPORTS.mobile, action: verifyVendorMasterWorksheet }),
  defineQaScenario({ feature: "payroll", route: route("payroll", "/payroll"), path: "/demo/app/payroll", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "payroll", route: route("payroll", "/payroll"), path: "/demo/app/payroll", interactionState: "Payroll normal-cycle next step verified", viewport: QA_VIEWPORTS.desktop, action: verifyPayrollNormalCycleOverview }),
  defineQaScenario({ feature: "payroll", route: route("payroll", "/payroll"), path: "/demo/app/payroll", interactionState: "Payroll normal-cycle next step verified", viewport: QA_VIEWPORTS.mobile, action: verifyPayrollNormalCycleOverview }),
  defineQaScenario({ feature: "payroll", route: route("payroll-run", "/payroll?runId=:runId"), path: "/demo/app/payroll?runId=demo-payroll-run-9", interactionState: "payroll run opened", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "payroll", route: route("payroll-run", "/payroll?runId=:runId"), path: "/demo/app/payroll?runId=demo-payroll-run-9", interactionState: "approved Payroll Cash & Banking settlement handoff verified", viewport: QA_VIEWPORTS.desktop, action: verifyPayrollApprovedSettlementHandoff }),
  defineQaScenario({ feature: "payroll", route: route("payroll-run", "/payroll?runId=:runId"), path: "/demo/app/payroll?runId=demo-payroll-run-9", interactionState: "approved Payroll Cash & Banking settlement handoff verified", viewport: QA_VIEWPORTS.mobile, action: verifyPayrollApprovedSettlementHandoff }),
  defineQaScenario({ feature: "expenses", route: route("expenses", "/expenses"), path: "/demo/app/expenses", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "supplier-payables", route: route("expenses", "/expenses?expenseId=:expenseId"), path: "/demo/app/expenses?expenseId=demo-expense-supplier-bm-02", interactionState: "authoritative Expense payment surface opened", viewport: QA_VIEWPORTS.desktop, action: verifyExpensePaymentSurface }),
  defineQaScenario({ feature: "supplier-payables", route: route("expenses", "/expenses?expenseId=:expenseId"), path: "/demo/app/expenses?expenseId=demo-expense-supplier-bm-02", interactionState: "authoritative Expense payment surface opened", viewport: QA_VIEWPORTS.mobile, action: verifyExpensePaymentSurface }),
  defineQaScenario({ feature: "supplier-payables", route: route("invoice-detail", "/invoices/:invoiceId"), path: "/demo/app/invoices/demo-missing-invoice", interactionState: "stale supplier invoice recovery verified", viewport: QA_VIEWPORTS.desktop, action: verifyStaleSupplierInvoiceRecovery }),
  defineQaScenario({ feature: "supplier-payables", route: route("cash", "/cash?fromTargetType=:fromTargetType&fromTargetId=:fromTargetId&returnTo=:returnTo"), path: "/demo/app/cash?fromTargetType=EXPENSE&fromTargetId=demo-expense-supplier-bm-02&returnTo=%2Fexpenses%3FexpenseId%3Ddemo-expense-supplier-bm-02", interactionState: "Cash Expense target and return context opened", viewport: QA_VIEWPORTS.desktop, action: verifyCashExpenseTarget }),
  defineQaScenario({ feature: "supplier-payables", route: route("cash", "/cash?fromTargetType=:fromTargetType&fromTargetId=:fromTargetId&returnTo=:returnTo"), path: "/demo/app/cash?fromTargetType=EXPENSE&fromTargetId=demo-expense-supplier-bm-02&returnTo=%2Fexpenses%3FexpenseId%3Ddemo-expense-supplier-bm-02", interactionState: "Cash Expense target and return context opened", viewport: QA_VIEWPORTS.mobile, action: verifyCashExpenseTarget }),
  defineQaScenario({ feature: "client-receivables", route: route("project-billing", "/projects/:projectId/billing?billingId=:billingId"), path: "/demo/app/projects/demo-project-warehouse/billing?billingId=demo-client-billing-warehouse-02", interactionState: "client invoice collection lifecycle verified", viewport: QA_VIEWPORTS.desktop, action: verifyClientReceivableLifecycle }),
  defineQaScenario({ feature: "client-receivables", route: route("project-billing", "/projects/:projectId/billing?billingId=:billingId"), path: "/demo/app/projects/demo-project-warehouse/billing?billingId=demo-client-billing-warehouse-02", interactionState: "client invoice collection lifecycle verified", viewport: QA_VIEWPORTS.mobile, action: verifyClientReceivableLifecycle }),
  defineQaScenario({ feature: "client-receivables", route: route("project-billing", "/projects/:projectId/billing?billingId=:billingId"), path: "/demo/app/projects/demo-project-drainage/billing?billingId=demo-client-billing-drainage-02", interactionState: "Client Billing draft worksheet editing verified", viewport: QA_VIEWPORTS.desktop, action: verifyClientBillingDraftWorksheet }),
  defineQaScenario({ feature: "client-receivables", route: route("project-billing", "/projects/:projectId/billing?billingId=:billingId"), path: "/demo/app/projects/demo-project-drainage/billing?billingId=demo-client-billing-drainage-02", interactionState: "Client Billing draft worksheet editing verified", viewport: QA_VIEWPORTS.tablet, action: verifyClientBillingDraftWorksheet }),
  defineQaScenario({ feature: "client-receivables", route: route("project-billing", "/projects/:projectId/billing?billingId=:billingId"), path: "/demo/app/projects/demo-project-drainage/billing?billingId=demo-client-billing-drainage-02", interactionState: "Client Billing draft worksheet editing verified", viewport: QA_VIEWPORTS.mobile, action: verifyClientBillingDraftWorksheet }),
  defineQaScenario({ feature: "document-delivery", route: route("project-billing", "/projects/:projectId/billing?billingId=:billingId"), path: "/demo/app/projects/demo-project-warehouse/billing?billingId=demo-client-billing-warehouse-02", interactionState: "Client Invoice delivery preview and disconnected history verified", viewport: QA_VIEWPORTS.desktop, action: verifyClientInvoiceDocumentDeliverySurface }),
  defineQaScenario({ feature: "document-delivery", route: route("project-billing", "/projects/:projectId/billing?billingId=:billingId"), path: "/demo/app/projects/demo-project-warehouse/billing?billingId=demo-client-billing-warehouse-02", interactionState: "Client Invoice delivery preview and disconnected history verified", viewport: QA_VIEWPORTS.mobile, action: verifyClientInvoiceDocumentDeliverySurface }),
  defineQaScenario({ feature: "reports", route: route("reports", "/reports"), path: "/demo/app/reports", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "settings", route: route("settings", "/settings"), path: "/demo/app/settings", interactionState: "settings product surface verified", viewport: QA_VIEWPORTS.desktop, action: verifySettingsScreen }),
  defineQaScenario({ feature: "assistant", route: route("assistant", "/assistant"), path: "/demo/app/assistant", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "help", route: route("help", "/help"), path: "/help", interactionState: "Help Center index rendered", viewport: QA_VIEWPORTS.desktop, action: verifyHelpIndex }),
  defineQaScenario({ feature: "help", route: route("help", "/help"), path: "/help", interactionState: "Help Center index rendered", viewport: QA_VIEWPORTS.laptop, action: verifyHelpIndex }),
  defineQaScenario({ feature: "help", route: route("help", "/help"), path: "/help", interactionState: "Help Center index rendered", viewport: QA_VIEWPORTS.tablet, action: verifyHelpIndex }),
  defineQaScenario({ feature: "help", route: route("help", "/help"), path: "/help", interactionState: "Help Center index rendered", viewport: QA_VIEWPORTS.mobile, action: verifyHelpIndex }),
  defineQaScenario({ feature: "help", route: route("help", "/help?topic=invoice-review"), path: "/help?topic=invoice-review", interactionState: "Help Center invoice-review article rendered", viewport: QA_VIEWPORTS.desktop, action: verifyHelpArticle }),
  defineQaScenario({ feature: "help", route: route("help", "/help?topic=invoice-review"), path: "/help?topic=invoice-review", interactionState: "Help Center invoice-review article rendered", viewport: QA_VIEWPORTS.laptop, action: verifyHelpArticle }),
  defineQaScenario({ feature: "help", route: route("help", "/help?topic=invoice-review"), path: "/help?topic=invoice-review", interactionState: "Help Center invoice-review article rendered", viewport: QA_VIEWPORTS.tablet, action: verifyHelpArticle }),
  defineQaScenario({ feature: "help", route: route("help", "/help?topic=invoice-review"), path: "/help?topic=invoice-review", interactionState: "Help Center invoice-review article rendered", viewport: QA_VIEWPORTS.mobile, action: verifyHelpArticle }),
  defineQaScenario({ feature: "help", route: route("help", "/help"), path: "/help", interactionState: "Help navigation interactions verified", viewport: QA_VIEWPORTS.desktop, action: verifyHelpNavigation }),
  defineQaScenario({ feature: "help", route: route("help", "/help?topic=:topic"), path: "/help?topic=not-a-topic", interactionState: "unknown Help topic fallback verified", viewport: QA_VIEWPORTS.desktop, action: verifyHelpUnknownTopicFallback }),
  defineQaScenario({ feature: "help-navigation", route: route("projects", "/projects"), path: "/projects", interactionState: "Projects PageHeader Help action verified", viewport: QA_VIEWPORTS.desktop, action: verifyPageHeaderHelpAction }),
  defineQaScenario({ feature: "help-navigation", route: route("cash", "/cash"), path: "/cash", interactionState: "Cash & Banking PageHeader Help action verified", viewport: QA_VIEWPORTS.desktop, action: verifyPageHeaderHelpAction }),
  defineQaScenario({ feature: "contextual-help", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms?view=compose", interactionState: "Email attachment contextual help verified", viewport: QA_VIEWPORTS.desktop, action: verifyAttachmentContextualHelp }),
  defineQaScenario({ feature: "contextual-help", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms?view=compose", interactionState: "Email attachment contextual help verified", viewport: QA_VIEWPORTS.mobile, action: verifyAttachmentContextualHelp }),
  defineQaScenario({ feature: "demo", route: route("demo-tour", "/demo/app/dashboard"), path: "/demo/app/dashboard", interactionState: "demo tour opened", viewport: QA_VIEWPORTS.desktop, action: openDemoTour }),
  ...R4C_VIEWPORTS.flatMap((viewport) => [
    defineQaScenario({ feature: "dashboard", route: route("dashboard", "/dashboard"), path: "/demo/app/dashboard", interactionState: "R4C Home Light theme visual", viewport, action: applyLightTheme }),
    defineQaScenario({ feature: "dashboard", route: route("dashboard", "/dashboard"), path: "/demo/app/dashboard", interactionState: "R4C Home Dark theme visual", viewport, action: applyDarkTheme }),
    defineQaScenario({ feature: "projects", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "R4C Project Portfolio Light theme visual", viewport, action: applyLightTheme }),
    defineQaScenario({ feature: "projects", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "R4C Project Portfolio Dark theme visual", viewport, action: applyDarkTheme }),
  ]),
  defineQaScenario({ feature: "projects", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "R4C Project Portfolio Dark filters and attention visual", viewport: R4C_VIEWPORTS[1], action: verifyPortfolioAttentionDark }),
  defineQaScenario({ feature: "dashboard", route: route("dashboard", "/dashboard?view=insights"), path: "/demo/app/dashboard?view=insights", interactionState: "R4C Operations Insights Light theme visual", viewport: R4C_VIEWPORTS[0], action: applyLightTheme }),
  defineQaScenario({ feature: "dashboard", route: route("dashboard", "/dashboard?view=insights"), path: "/demo/app/dashboard?view=insights", interactionState: "R4C Operations Insights Dark theme visual", viewport: R4C_VIEWPORTS[0], action: applyDarkTheme }),
  defineQaScenario({ feature: "entity-media", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "R4D Project media and deterministic fallback · Light", viewport: QA_VIEWPORTS.desktop, action: verifyProjectMediaLight }),
  defineQaScenario({ feature: "entity-media", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "R4D Project media and deterministic fallback · Constrained laptop", viewport: R4D_CONSTRAINED_LAPTOP, action: verifyProjectMediaLight }),
  defineQaScenario({ feature: "entity-media", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "R4D Project media and deterministic fallback · Dark phone", viewport: QA_VIEWPORTS.mobile, action: verifyProjectMediaDark }),
  defineQaScenario({ feature: "entity-media", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "R4D Project image Replace/Remove controls · Dark", viewport: QA_VIEWPORTS.desktop, action: verifyProjectMediaControls }),
  defineQaScenario({ feature: "entity-media", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "R4D Project image Replace/Remove controls · Dark phone", viewport: QA_VIEWPORTS.mobile, action: verifyProjectMediaControls }),
  defineQaScenario({ feature: "entity-media", route: route("project-workspace", "/projects/:projectId"), path: "/demo/app/projects/demo-project-solar", interactionState: "R4D linked Project Material media and text context · Light", viewport: QA_VIEWPORTS.desktop, action: verifyProjectMaterialImage }),
  defineQaScenario({ feature: "entity-media", route: route("equipment", "/equipment"), path: "/demo/app/equipment", interactionState: "R4D canonical Equipment media and fallback · Light", viewport: QA_VIEWPORTS.desktop, action: verifyEquipmentMediaLight }),
  defineQaScenario({ feature: "entity-media", route: route("equipment", "/equipment"), path: "/demo/app/equipment", interactionState: "R4D canonical Equipment media and fallback · Constrained laptop", viewport: R4D_CONSTRAINED_LAPTOP, action: verifyEquipmentMediaDark }),
  defineQaScenario({ feature: "entity-media", route: route("equipment", "/equipment"), path: "/demo/app/equipment", interactionState: "R4D canonical Equipment media and fallback · Dark phone", viewport: QA_VIEWPORTS.mobile, action: verifyEquipmentMediaDark }),
  defineQaScenario({ feature: "entity-media", route: route("warehouse", "/warehouse"), path: "/demo/app/warehouse", interactionState: "R4D canonical Material media and fallback · Dark", viewport: QA_VIEWPORTS.desktop, action: verifyMaterialMediaDark }),
  defineQaScenario({ feature: "entity-media", route: route("warehouse", "/warehouse"), path: "/demo/app/warehouse", interactionState: "R4D canonical Material media and fallback · Tablet", viewport: R4D_TABLET, action: verifyMaterialMediaLight }),
  defineQaScenario({ feature: "entity-media", route: route("warehouse", "/warehouse"), path: "/demo/app/warehouse", interactionState: "R4D canonical Material media and fallback · Light phone", viewport: QA_VIEWPORTS.mobile, action: verifyMaterialMediaLight }),
  defineQaScenario({ feature: "ui-r4e-theme", route: route("payroll", "/payroll"), path: "/demo/app/payroll", interactionState: "R4E Dark surface and legacy neutral contrast inspected", viewport: QA_VIEWPORTS.desktop, action: verifyR4eLegacySurfaceContrast }),
  defineQaScenario({ feature: "ui-r4e-theme", route: route("procurement", "/procurement"), path: "/demo/app/procurement", interactionState: "R4E Dark procurement committed metric contrast inspected", viewport: QA_VIEWPORTS.desktop, action: verifyR4eProcurementMetricContrast }),
  defineQaScenario({ feature: "ui-r4e-responsive-density", route: route("expenses", "/expenses"), path: "/demo/app/expenses", interactionState: "R4E Expenses register fits or exposes the complete responsive record path", viewport: R4E_VIEWPORTS[0], action: verifyR4eExpenseRegisterFit }),
  defineQaScenario({ feature: "ui-r4e-theme", route: route("invoices", "/invoices"), path: "/demo/app/invoices", interactionState: "R4E Dark primary action contrast inspected", viewport: QA_VIEWPORTS.desktop, action: verifyR4ePrimaryButtonContrast }),
  defineQaScenario({ feature: "ui-r4e-invoice-directory", route: route("invoices", "/invoices"), path: "/demo/app/invoices", interactionState: "R4E compact invoice filters and removable active chip verified", viewport: QA_VIEWPORTS.desktop, action: verifyInvoiceRegisterCompactFilters }),
  defineQaScenario({ feature: "ui-r4e-invoice-directory", route: route("invoices", "/invoices"), path: "/demo/app/invoices", interactionState: "R4E readable invoice cards verified at phone width", viewport: QA_VIEWPORTS.mobile, action: verifyInvoiceRegisterPhoneCards }),
  defineQaScenario({ feature: "ui-r4e-invoice-directory", route: route("invoices", "/invoices"), path: "/demo/app/invoices", interactionState: "R4E filter disclosure opened at phone width", viewport: QA_VIEWPORTS.mobile, action: verifyInvoiceFilterSheetPhone }),
  defineQaScenario({ feature: "ui-r4e-theme-overlays", route: route("invoices", "/invoices"), path: "/demo/app/invoices", interactionState: "R4E Dark phone filter sheet contrast and focus inspected", viewport: R4E_VIEWPORTS[3], action: verifyDarkInvoiceFilterSheet }),
  defineQaScenario({ feature: "ui-r4e-payroll-hierarchy", route: route("payroll", "/payroll"), path: "/demo/app/payroll", interactionState: "R4E Payroll next step prioritized at phone width", viewport: QA_VIEWPORTS.mobile, action: verifyPayrollFirstView }),
  defineQaScenario({ feature: "ui-r4e-payroll-hierarchy", route: route("payroll", "/payroll"), path: "/demo/app/payroll", interactionState: "R4E secondary Payroll period details remain available by disclosure", viewport: R4E_VIEWPORTS[0], action: verifyPayrollSummaryDisclosure }),
  defineQaScenario({ feature: "ui-r4e-email-compose", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms?view=compose", interactionState: "R4E Email compose task-first phone view", viewport: QA_VIEWPORTS.mobile, action: verifyEmailComposeFirstView }),
  defineQaScenario({ feature: "ui-r4e-demo-chrome", route: route("dashboard", "/dashboard"), path: "/demo/app/dashboard", interactionState: "R4E safe-demo chrome compact at phone width", viewport: QA_VIEWPORTS.mobile, action: verifyDemoWorkspaceChrome }),
  defineQaScenario({ feature: "ui-r4e-demo-chrome", route: route("dashboard", "/dashboard"), path: "/demo/app/dashboard", interactionState: "R4E safe-demo chrome compact at desktop width", viewport: QA_VIEWPORTS.desktop, action: verifyDemoWorkspaceChrome }),
  defineQaScenario({ feature: "ui-r4e-action-grammar", route: route("cash", "/cash"), path: "/demo/app/cash", interactionState: "R4E Cash header action variants verified", viewport: QA_VIEWPORTS.desktop, action: verifyPageHeaderActionVariants([{ label: "Executive Dashboard", variant: "ghost" }, { label: "Add account", variant: "primary" }]) }),
  defineQaScenario({ feature: "ui-r4e-action-grammar", route: route("expenses", "/expenses"), path: "/demo/app/expenses", interactionState: "R4E Expenses header action variants verified", viewport: QA_VIEWPORTS.desktop, action: verifyPageHeaderActionVariants([{ label: "Upload supplier invoice", variant: "secondary" }, { label: "Add expense", variant: "primary" }]) }),
  defineQaScenario({ feature: "ui-r4e-action-grammar", route: route("equipment", "/equipment"), path: "/demo/app/equipment", interactionState: "R4E Equipment header action variant verified", viewport: QA_VIEWPORTS.desktop, action: verifyPageHeaderActionVariants([{ label: "Add Equipment", variant: "primary" }]) }),
  defineQaScenario({ feature: "ui-r4e-action-grammar", route: route("warehouse", "/warehouse"), path: "/demo/app/warehouse", interactionState: "R4E Warehouse header action variants verified", viewport: QA_VIEWPORTS.desktop, action: verifyPageHeaderActionVariants([{ label: "Add item", variant: "primary" }, { label: "Opening stock", variant: "secondary" }]) }),
  defineQaScenario({ feature: "ui-r4e-action-grammar", route: route("procurement", "/procurement"), path: "/demo/app/procurement", interactionState: "R4E Procurement header action variant verified", viewport: QA_VIEWPORTS.desktop, action: verifyPageHeaderActionVariants([{ label: "New Purchase Order", variant: "primary" }]) }),
  ...R4E_VISUAL_ROUTES.flatMap((visualRoute) => R4E_VIEWPORTS.flatMap((viewport) => (["light", "dark"] as const).map((theme) =>
    defineQaScenario({
      feature: "ui-r4e-visual-matrix",
      route: route(visualRoute.id, visualRoute.canonicalPath),
      path: visualRoute.path,
      interactionState: `R4E ${theme} theme visual · ${visualRoute.label}`,
      viewport,
      action: r4eThemeAction(theme),
    })
  ))),
  ...R4E_SYSTEM_THEME_ROUTES.flatMap((visualRoute) => R4E_VIEWPORTS.flatMap((viewport) => (["system-light", "system-dark"] as const).map((systemTheme) =>
    defineQaScenario({
      feature: "ui-r4e-visual-matrix",
      route: route(visualRoute.id, visualRoute.canonicalPath),
      path: visualRoute.path,
      interactionState: `R4E ${systemTheme === "system-light" ? "System/OS Light" : "System/OS Dark"} · ${visualRoute.label}`,
      viewport,
      action: r4eThemeAction(systemTheme),
    })
  ))),
  ...R4E_DARK_ROUTE_AUDIT.map((auditRoute) => defineQaScenario({
    feature: "ui-r4e-route-audit",
    route: route(auditRoute.id, auditRoute.canonicalPath),
    path: auditRoute.path,
    interactionState: `R4E Dark route audit · ${auditRoute.label}`,
    viewport: R4E_VIEWPORTS[0],
    action: verifyR4eDarkRouteAudit,
  })),
  defineQaScenario({ feature: "ui-r4e-keyboard-touch", route: route("dashboard", "/dashboard"), path: "/demo/app/dashboard", interactionState: "R4E desktop keyboard focus and account menu verified", viewport: R4E_VIEWPORTS[0], action: verifyR4eKeyboardAccountNavigation }),
  defineQaScenario({ feature: "ui-r4e-keyboard-touch", route: route("dashboard", "/dashboard"), path: "/demo/app/dashboard", interactionState: "R4E mobile navigation and account menu verified", viewport: R4E_VIEWPORTS[3], action: verifyR4eMobileNavigationAndAccount }),
];
