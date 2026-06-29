import * as vscode from "vscode";
import * as os from "node:os";
import * as fs from "node:fs";
import { join } from "node:path";
import { ApiClient } from "../core/apiClient";
import { Killswitch } from "../core/killswitch";
import { ViewTracker } from "../core/viewTracker";
import { Orchestrator } from "../core/orchestrator";
import { MockAdapter } from "../core/mockAdapter";
import { firstAvailable } from "../adapters/registry";
import type { SpinnerAdapter } from "../core/adapter";
import { ClaudeCodeAdapter } from "../adapters/claudeCode";
import { StatusBarSink } from "./statusBarSink";
import { createThinkingWaitSource, stateLineWithStaleness, type TranscriptLine } from "./thinkingWaitSource";
import { findNewestTranscript, type LocatorFs } from "./sessionLocator";
import { loadToken } from "../statusline/store";

const API_BASE = process.env.KICKBACKS_API ?? "http://localhost:3000";
const PORTAL_BASE = process.env.KICKBACKS_PORTAL ?? "http://localhost:3001";
const INSTALL_KEY = "kickbacks.installId";

/** Format paise as rupees, e.g. 12345 -> "₹123.45". */
function formatEarnings(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Stable per-install id.
  let installId = context.globalState.get<string>(INSTALL_KEY);
  if (!installId) {
    installId = `inst_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    await context.globalState.update(INSTALL_KEY, installId);
  }

  let cachedToken: string | undefined = await context.secrets.get("kickbacks.authToken");
  const tokenSub = context.secrets.onDidChange(async (e) => {
    if (e.key === "kickbacks.authToken") cachedToken = await context.secrets.get("kickbacks.authToken");
  });

  const api = new ApiClient(API_BASE, fetch, () => cachedToken ?? loadToken());
  const killswitch = new Killswitch(`${API_BASE}/config`, fetch);
  const tracker = new ViewTracker(() => Date.now());

  const isSignedIn = (): boolean => Boolean(cachedToken ?? loadToken());

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = "kickbacks.openDashboard";
  status.show();

  // Live earnings: read the real lifetime total from the ledger (persists across reopen),
  // and refresh it whenever an impression bills + on the periodic poll. When signed out, the
  // item becomes a sign-in call-to-action instead of showing a meaningless ₹0.00.
  const refreshEarnings = async (): Promise<void> => {
    if (!isSignedIn()) {
      status.text = "$(sign-in) Kickbacks · Sign in to earn";
      status.tooltip = "Sign in to attribute the sponsored line to you and start earning — click to sign in.";
      status.command = "kickbacks.signIn";
      return;
    }
    status.tooltip = "Your Kickbacks earnings — click to open your dashboard";
    status.command = "kickbacks.openDashboard";
    const stats = await api.fetchStats();
    status.text = `$(rocket) Kickbacks ${formatEarnings(stats?.lifetimePaise ?? 0)}`;
  };
  void refreshEarnings();

  const openDashboard = vscode.commands.registerCommand("kickbacks.openDashboard", () => {
    void vscode.env.openExternal(vscode.Uri.parse(PORTAL_BASE));
  });

  // The sponsored line gets its OWN status bar item, shown only while Claude is thinking.
  const adItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  adItem.tooltip = "Sponsored via Kickbacks — click to open. You earn while your AI works.";
  adItem.command = "kickbacks.openSponsor";
  const sink = new StatusBarSink(adItem);

  const openSponsor = vscode.commands.registerCommand("kickbacks.openSponsor", () => {
    const url = sink.currentUrl();
    if (url) void vscode.env.openExternal(vscode.Uri.parse(url));
  });

  // Dev: MockAdapter is the fallback so the pipeline is exercisable without a live agent.
  const mock = new MockAdapter();
  const adapter: SpinnerAdapter = buildInEditorAdapter(sink) ?? firstAvailable(mock);

  const ROTATION_CURSOR_KEY = "kickbacks.rotationCursor";
  const orch = new Orchestrator({
    adapter, api, tracker, killswitch, installId,
    now: () => Date.now(),
    // Loop the top 3 ads while Claude works: highest bid 45s, next 30s, next 15s, then repeat.
    rotationCount: 3,
    holdScheduleMs: [45_000, 30_000, 15_000],
    onEarn: () => { void refreshEarnings(); }, // each billed impression updates the live total
    // Resume rotation where it left off (round-robin) — persisted across turns AND reloads, so
    // short turns still cycle every advertiser instead of always re-showing the highest-bid ad.
    loadCursor: () => context.globalState.get<number>(ROTATION_CURSOR_KEY) ?? -1,
    saveCursor: (idx) => { void context.globalState.update(ROTATION_CURSOR_KEY, idx); },
  });
  orch.start();

  // Poll killswitch + flush queued events + refresh earnings periodically.
  const timer = setInterval(() => { void killswitch.poll(); void api.flushQueue(); void refreshEarnings(); }, 60_000);

  // Pause/resume view time with window focus.
  const focusSub = vscode.window.onDidChangeWindowState((s) => orch.onFocusChange(s.focused));

  // Dev commands to drive the MockAdapter for manual end-to-end testing.
  const simulate = vscode.commands.registerCommand("kickbacks.simulateWait", () => mock.fireWaitStart());
  const endWait = vscode.commands.registerCommand("kickbacks.endWait", () => mock.fireWaitEnd());

  // Sign in with an email + password (the same developer account used on the web portal).
  // No external OAuth setup needed; the token attributes the sponsored line to this dev.
  const signIn = vscode.commands.registerCommand("kickbacks.signIn", async () => {
    const mode = await vscode.window.showQuickPick(
      [
        { label: "$(sign-in) Log in", detail: "I already have a Kickbacks developer account", value: "login" as const },
        { label: "$(person-add) Create account", detail: "New here — sign up to start earning", value: "register" as const },
      ],
      { placeHolder: "Kickbacks — sign in to attribute your earnings", matchOnDetail: true },
    );
    if (!mode) return;
    const email = await vscode.window.showInputBox({
      prompt: "Email",
      ignoreFocusOut: true,
      validateInput: (v) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()) ? undefined : "Enter a valid email"),
    });
    if (!email) return;
    const minLen = mode.value === "register" ? 8 : 1;
    const password = await vscode.window.showInputBox({
      prompt: mode.value === "register" ? "Choose a password (min 8 characters)" : "Password",
      password: true,
      ignoreFocusOut: true,
      validateInput: (v) => (v.length >= minLen ? undefined : `At least ${minLen} character${minLen > 1 ? "s" : ""}`),
    });
    if (!password) return;
    try {
      const token =
        mode.value === "register"
          ? await api.devRegister(email.trim(), password)
          : await api.devLogin(email.trim(), password);
      await context.secrets.store("kickbacks.authToken", token);
      cachedToken = token; // update immediately (don't wait for the secrets change event)
      void refreshEarnings();
      void vscode.window.showInformationMessage("Kickbacks: signed in — you'll now earn while your AI works.");
    } catch (err) {
      void vscode.window.showErrorMessage(`Kickbacks: ${friendlyAuthError(err)}`);
    }
  });

  const signOut = vscode.commands.registerCommand("kickbacks.signOut", async () => {
    await context.secrets.delete("kickbacks.authToken");
    cachedToken = undefined;
    void refreshEarnings();
    void vscode.window.showInformationMessage("Kickbacks: signed out.");
  });

  // First-run nudge: if signed out, offer a one-click way into the sign-in flow.
  if (!isSignedIn()) {
    void vscode.window
      .showInformationMessage("Kickbacks: sign in to earn while your AI works.", "Sign in")
      .then((choice) => { if (choice === "Sign in") void vscode.commands.executeCommand("kickbacks.signIn"); });
  }

  context.subscriptions.push(status, adItem, openSponsor, openDashboard, focusSub, tokenSub, simulate, endWait, signIn, signOut, { dispose: () => { clearInterval(timer); orch.stop(); } });
}

/** Map an AuthError code (or unknown error) to a friendly, actionable message. */
function friendlyAuthError(err: unknown): string {
  const code = err instanceof Error ? (err as { code?: string }).code ?? err.message : String(err);
  switch (code) {
    case "email_taken":
      return "That email already has an account — choose “Log in” instead.";
    case "invalid_credentials":
      return "Wrong email or password.";
    case "network_error":
      return "Couldn’t reach Kickbacks — check your connection and try again.";
    default:
      return "Sign-in failed. Please try again.";
  }
}

/** True if Anthropic's Claude Code extension is installed (env vars don't reach the ext host). */
function claudeCodePresent(): boolean {
  try {
    return Boolean(
      vscode.extensions.getExtension("Anthropic.claude-code") ||
        vscode.extensions.getExtension("anthropic.claude-code"),
    );
  } catch {
    return false;
  }
}

const locatorFs: LocatorFs = {
  homedir: () => os.homedir(),
  listJsonl: (dir) => {
    try {
      return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((name) => ({ name, mtimeMs: fs.statSync(join(dir, name)).mtimeMs }));
    } catch {
      return [];
    }
  },
  listDirs: (dir) => {
    try {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      return [];
    }
  },
};

function readLastLine(workspaceDir: string): TranscriptLine | null {
  const file = findNewestTranscript(workspaceDir, locatorFs);
  if (!file) return null;
  try {
    // Derive state by position (latest prompt vs latest end_turn) — a turn stays "in progress"
    // through tool_use/tool_result lines — but also force-end when the transcript has gone idle
    // (some turns never write an explicit end_turn), so the ad never shows while Claude is idle.
    const mtimeMs = fs.statSync(file).mtimeMs;
    return stateLineWithStaleness(fs.readFileSync(file, "utf8"), mtimeMs, Date.now());
  } catch {
    return null;
  }
}

/**
 * Build the in-editor Claude Code adapter, or null if we shouldn't use it (no workspace,
 * or Claude Code extension not installed) — caller falls back to the dev MockAdapter.
 */
function buildInEditorAdapter(sink: StatusBarSink): SpinnerAdapter | null {
  const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  // No workspace folder => no transcript slug to resolve, so folderless windows
  // intentionally get no in-editor ads (caller falls back to the dev MockAdapter).
  if (!workspaceDir || !claudeCodePresent()) return null;

  const watch = (onChange: () => void): (() => void) => {
    let disposeWatcher: () => void = () => {};
    try {
      const base = vscode.Uri.file(join(os.homedir(), ".claude", "projects"));
      // Recursive: catch the active session regardless of the exact slug dir. Duplicate
      // events are harmless (onChange is idempotent).
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(base, "**/*.jsonl"),
        false,
        false,
        true,
      );
      watcher.onDidChange(onChange);
      watcher.onDidCreate(onChange);
      disposeWatcher = () => watcher.dispose();
    } catch {
      disposeWatcher = () => {};
    }
    // Belt-and-suspenders: VS Code file watchers are unreliable for paths OUTSIDE the
    // workspace (the transcripts live under ~/.claude, not the open folder), so also poll.
    // onChange is idempotent/level-triggered, so the extra calls are safe.
    const poll = setInterval(onChange, 1500);
    return () => {
      clearInterval(poll);
      disposeWatcher();
    };
  };

  const waitSource = createThinkingWaitSource({
    watch,
    readLastLine: () => readLastLine(workspaceDir),
    now: () => Date.now(),
  });
  // We already gated on claudeCodePresent(); force detect=true so the adapter is selected.
  return new ClaudeCodeAdapter({ detect: () => true, waitSource, sink });
}

export function deactivate(): void {}
