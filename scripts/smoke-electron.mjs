#!/usr/bin/env node
// Electron smoke check (M1 T6): launches the actual `electron-vite build`
// output through Playwright's Electron support and asserts the window
// comes up for real, instead of only trusting vitest's jsdom-mocked
// renderer tests (which never exercise the real main process, preload
// bridge, or a genuine BrowserWindow). Plain `playwright` (not
// `@playwright/test`) is enough — this is one linear check, not a suite
// that needs the test runner's fixtures/reporters.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const mainEntry = path.join(projectRoot, "out", "main", "index.js");

async function main() {
  // A throwaway userData dir (src/main/index.ts honors
  // GENTLE_SHELL_SMOKE_USERDATA before app ready) so this run never reads
  // or writes a real developer's config.json.
  const userDataDir = mkdtempSync(path.join(tmpdir(), "gentle-shell-smoke-"));

  const spawnMarker = path.join(userDataDir, "spawned");
  const fakeLauncher = path.join(userDataDir, "fake-launcher.mjs");
  writeFileSync(fakeLauncher, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(spawnMarker)}, "spawned");`);

  const app = await electron.launch({
    args: [mainEntry],
    cwd: projectRoot,
    env: { ...process.env, HOME: userDataDir, USERPROFILE: userDataDir, PI_CODING_AGENT_DIR: path.join(userDataDir, "pi"), GENTLE_SHELL_SMOKE_USERDATA: userDataDir, GENTLE_SHELL_BIN: fakeLauncher },
  });

  try {
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    // App.tsx resolves setupStatus() asynchronously before choosing
    // between the first-run screen and the normal chat layout, so either
    // heading is a valid "the app actually came up" signal — wait for
    // whichever one wins instead of racing a fixed render.
    await window.waitForFunction(
      () => {
        const text = document.body.innerText || "";
        return text.includes("Welcome to Gentle Shell Desktop") || text.includes("Start a chat in any folder");
      },
      undefined,
      { timeout: 15_000 },
    );

    // Keep first-run unchanged, then prove reaching the folder prompt starts no launcher.
    if (await window.getByRole("button", { name: "Keep it separate" }).isVisible()) {
      await window.getByRole("button", { name: "Keep it separate" }).click();
    }
    await window.getByText("Start a chat in any folder").waitFor();
    await window.waitForTimeout(250);
    if (existsSync(spawnMarker)) throw new Error("launcher spawned at startup before a folder was chosen");
    if (await window.getByRole("textbox", { name: "Message" }).count()) throw new Error("composer visible before choosing a folder");

    const title = await window.title();
    if (title !== "Gentle Shell Desktop") {
      throw new Error(`expected window title "Gentle Shell Desktop", got "${title}"`);
    }

    // No native File/Edit/View/Window bar outside macOS.
    if (process.platform !== "darwin") {
      const hasMenu = await app.evaluate(({ Menu }) => Menu.getApplicationMenu() !== null);
      if (hasMenu) throw new Error("expected no application menu on this platform");
    }

    // build/icon.png is the window icon (src/main/index.ts) and the packaging icon: it must exist and decode.
    const iconPath = path.join(projectRoot, "build", "icon.png");
    const iconLoads = await app.evaluate(({ nativeImage }, file) => !nativeImage.createFromPath(file).isEmpty(), iconPath);
    if (!iconLoads) throw new Error("expected build/icon.png to load as the window icon");

    const bodyText = await window.locator("body").innerText();
    if (!bodyText.includes("Start a chat in any folder")) {
      throw new Error(`expected the folder start screen, got:\n${bodyText.slice(0, 500)}`);
    }

    const screenshotDir = path.join(projectRoot, "release");
    mkdirSync(screenshotDir, { recursive: true });
    const screenshotPath = path.join(screenshotDir, "smoke.png");
    await window.screenshot({ path: screenshotPath });

    console.log(`smoke:electron OK — title "${title}" and folder prompt verified, zero launcher starts; screenshot at ${screenshotPath}`);
  } finally {
    await app.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("smoke:electron FAILED:", error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
