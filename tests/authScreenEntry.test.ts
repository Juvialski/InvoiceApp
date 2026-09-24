import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthScreen } from "../src/components/auth/AuthScreen.tsx";
import { workspacePresentationFor } from "../src/config/workspacePresentation.ts";

test("QA AuthScreen uses neutral identity and keeps the isolated demo entry", () => {
  const markup = renderToStaticMarkup(createElement(AuthScreen, {
    workspacePresentation: workspacePresentationFor("qa"),
    allowBrowserOnly: true,
  } as never));
  assert.match(markup, /Engineering Operations Platform/);
  assert.match(markup, /QA Workspace/);
  assert.match(markup, /href="\/demo"/);
  assert.doesNotMatch(markup, /Hydroqualisense/i);
  assert.doesNotMatch(markup, /HydroQualiSense/i);
});

test("production AuthScreen keeps Hydroqualisense identity and password recovery mode", () => {
  const productionMarkup = renderToStaticMarkup(createElement(AuthScreen, { allowBrowserOnly: true } as never));
  assert.match(productionMarkup, /Hydroqualisense/);
  assert.match(productionMarkup, /hydroqualisense-logo\.png/);

  const recoveryMarkup = renderToStaticMarkup(createElement(AuthScreen, {
    initialMode: "reset-password",
    allowBrowserOnly: true,
  } as never));
  assert.match(recoveryMarkup, /Choose a new password/);
});
