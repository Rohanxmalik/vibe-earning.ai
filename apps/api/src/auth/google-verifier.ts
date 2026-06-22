import { Injectable } from "@nestjs/common";
import { OAuth2Client } from "google-auth-library";

export interface GoogleProfile { sub: string; email: string | null }

/** Abstract DI token — tests/e2e override this with a fake. */
export abstract class GoogleVerifier {
  abstract verify(idToken: string): Promise<GoogleProfile>;
}

@Injectable()
export class GoogleVerifierImpl extends GoogleVerifier {
  private client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  async verify(idToken: string): Promise<GoogleProfile> {
    const ticket = await this.client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    if (!p?.sub) throw new Error("invalid google id token");
    return { sub: p.sub, email: p.email ?? null };
  }
}
