import * as vscode from "vscode";

const TOKEN_KEY = "kickbacks.authToken";

export class SecretStore {
  constructor(private readonly secrets: vscode.SecretStorage) {}
  async getToken(): Promise<string | undefined> { return this.secrets.get(TOKEN_KEY); }
  async setToken(token: string): Promise<void> { await this.secrets.store(TOKEN_KEY, token); }
  async clear(): Promise<void> { await this.secrets.delete(TOKEN_KEY); }
}
