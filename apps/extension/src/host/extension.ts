import * as vscode from "vscode";
import { ApiClient } from "../core/apiClient";
import { Killswitch } from "../core/killswitch";
import { ViewTracker } from "../core/viewTracker";
import { Orchestrator } from "../core/orchestrator";
import { MockAdapter } from "../core/mockAdapter";
import { firstAvailable } from "../adapters/registry";

const API_BASE = process.env.KICKBACKS_API ?? "http://localhost:3000";
const INSTALL_KEY = "kickbacks.installId";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Stable per-install id.
  let installId = context.globalState.get<string>(INSTALL_KEY);
  if (!installId) {
    installId = `inst_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    await context.globalState.update(INSTALL_KEY, installId);
  }

  let cachedToken: string | undefined;
  context.secrets.get("kickbacks.authToken").then((t) => { cachedToken = t; });

  const api = new ApiClient(API_BASE, fetch, () => cachedToken);
  const killswitch = new Killswitch(`${API_BASE}/config`, fetch);
  const tracker = new ViewTracker(() => Date.now());

  // Dev: MockAdapter is the fallback so the pipeline is exercisable without a live agent.
  const mock = new MockAdapter();
  const adapter = firstAvailable(mock);

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.text = "$(rocket) Kickbacks ₹0.00";
  status.show();

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

  context.subscriptions.push(status, focusSub, simulate, endWait, { dispose: () => { clearInterval(timer); orch.stop(); } });
}

export function deactivate(): void {}
