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
import { createThinkingWaitSource, lastMeaningfulLine, type TranscriptLine } from "./thinkingWaitSource";
import { findNewestTranscript, type LocatorFs } from "./sessionLocator";
import { loadToken } from "../statusline/store";

const API_BASE = process.env.KICKBACKS_API ?? "http://localhost:3000";
const INSTALL_KEY = "kickbacks.installId";

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

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.text = "$(rocket) Kickbacks ₹0.00";
  status.show();

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

  const orch = new Orchestrator({
    adapter, api, tracker, killswitch, installId,
    now: () => Date.now(),
    onEarn: () => { status.text = "$(rocket) Kickbacks (ad shown)"; },
  });
  orch.start();

  // Poll killswitch + flush queued events periodically.
  const timer = setInterval(() => { void killswitch.poll(); void api.flushQueue(); }, 60_000);

  // Pause/resume view time with window focus.
  const focusSub = vscode.window.onDidChangeWindowState((s) => orch.onFocusChange(s.focused));

  // Dev commands to drive the MockAdapter for manual end-to-end testing.
  const simulate = vscode.commands.registerCommand("kickbacks.simulateWait", () => mock.fireWaitStart());
  const endWait = vscode.commands.registerCommand("kickbacks.endWait", () => mock.fireWaitEnd());

  // Dev sign-in: paste a Google ID token, exchange for a KBI token, store it.
  // Real OAuth consent UI is a follow-up (see MANUAL-TEST.md).
  const signIn = vscode.commands.registerCommand("kickbacks.signIn", async () => {
    const idToken = await vscode.window.showInputBox({ prompt: "Paste a Google ID token", password: true });
    if (!idToken) return;
    try {
      const token = await api.loginWithGoogle(idToken);
      await context.secrets.store("kickbacks.authToken", token);
      void vscode.window.showInformationMessage("Kickbacks: signed in.");
    } catch (err) {
      void vscode.window.showErrorMessage(`Kickbacks sign-in failed: ${String(err)}`);
    }
  });

  context.subscriptions.push(status, adItem, openSponsor, focusSub, tokenSub, simulate, endWait, signIn, { dispose: () => { clearInterval(timer); orch.stop(); } });
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
    // Scan for the last user/assistant line (Claude Code interleaves many bookkeeping
    // lines, so the physically-last line is usually not the state-determining one).
    return lastMeaningfulLine(fs.readFileSync(file, "utf8"));
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
