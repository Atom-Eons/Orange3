#!/usr/bin/env node
/* chromium-proof-runner.mjs - Windows-safe screenshot/DOM helper for proof gates. */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function compact(value, max = 1400) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

export async function chromiumExecutable(label = "visual proof") {
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ];
  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) return candidate;
  }
  throw new Error(`No Microsoft Edge or Google Chrome executable found for ${label}.`);
}

async function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    await execFileAsync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      timeout: 5000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    }).catch(() => {});
    return;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {}
}

function profileFromArgs(args) {
  const entry = args.find((arg) => String(arg).startsWith("--user-data-dir="));
  return entry ? String(entry).slice("--user-data-dir=".length).replace(/^"|"$/g, "") : null;
}

async function killProcessesUsingProfile(profile) {
  if (!profile || process.platform !== "win32") return;
  const escaped = profile.replace(/'/g, "''");
  await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `$profile='${escaped}'; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like ('*' + $profile + '*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
  ], {
    timeout: 8000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  }).catch(() => {});
}

async function runChromium(browser, args, {
  cwd,
  timeoutMs = 20000,
  maxBuffer = 4 * 1024 * 1024,
  successFile = null,
  successMinBytes = 10000,
  successPollMs = 150,
} = {}) {
  return new Promise((resolve) => {
    const child = spawn(browser, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let timer = null;
    let successTimer = null;

    function append(kind, chunk) {
      const text = chunk.toString("utf8");
      if (kind === "stdout") stdout += text;
      else stderr += text;
      if (stdout.length + stderr.length > maxBuffer) {
        stdout = stdout.slice(-Math.floor(maxBuffer / 2));
        stderr = stderr.slice(-Math.floor(maxBuffer / 2));
      }
    }

    function finish(code = null, signal = null, error = null) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (successTimer) clearInterval(successTimer);
      resolve({
        ok: !error && !timedOut && code === 0,
        code,
        signal,
        timed_out: timedOut,
        error: error?.message || null,
        stdout,
        stderr,
      });
    }

    child.stdout.on("data", (chunk) => append("stdout", chunk));
    child.stderr.on("data", (chunk) => append("stderr", chunk));
    child.on("error", (err) => finish(null, null, err));
    child.on("exit", (code, signal) => finish(code, signal, null));

    if (successFile) {
      successTimer = setInterval(async () => {
        if (settled) return;
        try {
          const stat = fsSync.statSync(successFile);
          if (stat.size > successMinBytes) {
            await killProcessTree(child.pid);
            await killProcessesUsingProfile(profileFromArgs(args));
            finish(0, null, null);
          }
        } catch {}
      }, successPollMs);
    }

    timer = setTimeout(async () => {
      timedOut = true;
      await killProcessTree(child.pid);
      await killProcessesUsingProfile(profileFromArgs(args));
      setTimeout(() => {
        child.stdout?.destroy();
        child.stderr?.destroy();
        finish(null, "timeout", new Error(`Chromium proof command timed out after ${timeoutMs}ms`));
      }, 500);
    }, timeoutMs);
  });
}

function baseChromiumArgs(profile) {
  return [
    ...baseChromiumSwitches(),
    `--user-data-dir=${profile}`,
  ];
}

function baseChromiumSwitches() {
  return [
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-extensions",
    "--disable-sync",
    "--disable-crash-reporter",
    "--disable-crashpad",
    "--disable-breakpad",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=CalculateNativeWinOcclusion,OptimizationGuideModelExecution,OptimizationGuideOnDeviceModel,AutofillEnableAi,TabOrganization",
    "--run-all-compositor-stages-before-draw",
  ];
}

async function importPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}

async function capturePlaywrightShot(browserExecutable, url, shot, profileBase, {
  minBytes = 10000,
  timeoutMs = 22000,
  readySelector = null,
  readyTimeoutMs = 12000,
} = {}) {
  const playwright = await importPlaywright();
  if (!playwright?.chromium) {
    return null;
  }
  const profile = `${profileBase}-${shot.name}-playwright`;
  await fs.mkdir(profile, { recursive: true });
  await fs.rm(shot.path, { force: true }).catch(() => {});
  let context = null;
  try {
    context = await playwright.chromium.launchPersistentContext(profile, {
      headless: true,
      executablePath: browserExecutable,
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: 1,
      reducedMotion: "no-preference",
      ignoreHTTPSErrors: true,
      timeout: timeoutMs,
      args: baseChromiumSwitches(),
    });
    const page = context.pages()[0] || await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: Math.min(5000, timeoutMs) }).catch(() => {});
    if (readySelector) {
      await page.waitForSelector(readySelector, { state: "visible", timeout: readyTimeoutMs });
    }
    await page.waitForTimeout(1400);
    await page.screenshot({ path: shot.path, fullPage: false, animations: "allow" });
    const stat = await waitForMinSize(shot.path, minBytes, { timeoutMs: 4000 });
    return {
      name: shot.name,
      width: shot.width,
      height: shot.height,
      path: shot.path,
      exists: Boolean(stat),
      bytes: stat?.size || 0,
      ok: Boolean(stat && stat.size > minBytes),
      browser_exit_ok: true,
      browser_error: null,
      runner: "playwright",
    };
  } catch (err) {
    return {
      name: shot.name,
      width: shot.width,
      height: shot.height,
      path: shot.path,
      exists: fsSync.existsSync(shot.path),
      bytes: fsSync.existsSync(shot.path) ? fsSync.statSync(shot.path).size : 0,
      ok: false,
      browser_exit_ok: false,
      browser_error: {
        mode: "playwright",
        message: err?.message || String(err),
        timed_out: /timeout/i.test(err?.message || ""),
      },
      runner: "playwright",
    };
  } finally {
    await context?.close().catch(() => {});
    await killProcessesUsingProfile(profile);
  }
}

async function waitForMinSize(file, minBytes, { timeoutMs = 5000, intervalMs = 150 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastStat = null;
  while (Date.now() < deadline) {
    try {
      lastStat = fsSync.statSync(file);
      if (lastStat.size > minBytes) return lastStat;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  try {
    lastStat = fsSync.statSync(file);
  } catch {}
  return lastStat;
}

export async function captureChromiumShot(browser, url, shot, profileBase, {
  cwd,
  minBytes = 10000,
  timeoutMs = 22000,
  readySelector = null,
  readyTimeoutMs = 12000,
  requireReady = false,
} = {}) {
  const playwrightShot = await capturePlaywrightShot(browser, url, shot, profileBase, { minBytes, timeoutMs, readySelector, readyTimeoutMs });
  if (playwrightShot?.ok) return playwrightShot;
  if (requireReady && playwrightShot) return playwrightShot;

  const profile = `${profileBase}-${shot.name}`;
  await fs.mkdir(profile, { recursive: true });
  await fs.rm(shot.path, { force: true }).catch(() => {});
  let browserError = null;
  let lastStat = null;
  const attempts = [
    { mode: "--headless=new", profile, suffix: "new" },
    { mode: "--headless", profile: `${profile}-classic`, suffix: "classic" },
  ];
  for (const attempt of attempts) {
    await fs.mkdir(attempt.profile, { recursive: true });
    const attemptPath = `${shot.path}.${attempt.suffix}.tmp.png`;
    await fs.rm(attemptPath, { force: true }).catch(() => {});
    const result = await runChromium(browser, [
      attempt.mode,
      ...baseChromiumArgs(attempt.profile),
      `--window-size=${shot.width},${shot.height}`,
      "--virtual-time-budget=7000",
      `--screenshot=${attemptPath}`,
      url,
    ], {
      cwd,
      timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
      successFile: attemptPath,
      successMinBytes: minBytes,
    });
    browserError = result.ok ? null : {
      mode: attempt.mode,
      message: result.error || `Chromium exited ${result.code ?? "without code"}`,
      code: result.code ?? null,
      signal: result.signal ?? null,
      timed_out: result.timed_out,
      stderr_tail: compact(result.stderr, 1400),
    };
    const stat = await waitForMinSize(attemptPath, minBytes, { timeoutMs: result.timed_out ? 15000 : 7000 });
    lastStat = stat;
    if (stat && stat.size > minBytes) {
      await fs.copyFile(attemptPath, shot.path);
      await fs.rm(attemptPath, { force: true }).catch(() => {});
      return {
        name: shot.name,
        width: shot.width,
        height: shot.height,
        path: shot.path,
        exists: true,
        bytes: stat.size,
        ok: true,
        browser_exit_ok: result.ok,
        browser_error: browserError,
      };
    }
    await fs.rm(attemptPath, { force: true }).catch(() => {});
  }
  const fallbackAttempts = [`${shot.path}.new.tmp.png`, `${shot.path}.classic.tmp.png`];
  for (const attemptPath of fallbackAttempts) {
    const stat = await waitForMinSize(attemptPath, minBytes, { timeoutMs: 12000 });
    if (stat && stat.size > minBytes) {
      await fs.copyFile(attemptPath, shot.path);
      await fs.rm(attemptPath, { force: true }).catch(() => {});
      return {
        name: shot.name,
        width: shot.width,
        height: shot.height,
        path: shot.path,
        exists: true,
        bytes: stat.size,
        ok: true,
        browser_exit_ok: false,
        browser_error: browserError,
        recovered_from_late_tmp: true,
      };
    }
  }
  const stat = fsSync.existsSync(shot.path) ? fsSync.statSync(shot.path) : null;
  return {
    name: shot.name,
    width: shot.width,
    height: shot.height,
    path: shot.path,
    exists: Boolean(stat),
    bytes: stat?.size || lastStat?.size || 0,
    ok: Boolean(stat && stat.size > minBytes),
    browser_exit_ok: browserError === null,
    browser_error: browserError,
  };
}

export async function dumpChromiumDom(browser, url, profile, {
  cwd,
  timeoutMs = 22000,
} = {}) {
  const playwright = await importPlaywright();
  if (playwright?.chromium) {
    let context = null;
    try {
      await fs.mkdir(profile, { recursive: true });
      context = await playwright.chromium.launchPersistentContext(profile, {
        headless: true,
        executablePath: browser,
        viewport: { width: 1440, height: 1000 },
        reducedMotion: "no-preference",
        ignoreHTTPSErrors: true,
        timeout: timeoutMs,
        args: baseChromiumSwitches(),
      });
      const page = context.pages()[0] || await context.newPage();
      page.setDefaultTimeout(timeoutMs);
      page.setDefaultNavigationTimeout(timeoutMs);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForLoadState("networkidle", { timeout: Math.min(5000, timeoutMs) }).catch(() => {});
      await page.waitForTimeout(900);
      const html = await page.content();
      if (html && html.trim().length > 0) return html;
    } catch {
      // Fall back to Chromium CLI DOM dump below.
    } finally {
      await context?.close().catch(() => {});
      await killProcessesUsingProfile(profile);
    }
  }

  await fs.mkdir(profile, { recursive: true });
  const result = await runChromium(browser, [
    "--headless=new",
    ...baseChromiumArgs(profile),
    "--virtual-time-budget=7000",
    "--dump-dom",
    url,
  ], { cwd, timeoutMs, maxBuffer: 4 * 1024 * 1024 });
  if (result.stdout && result.stdout.trim().length > 0) return result.stdout;
  return null;
}
