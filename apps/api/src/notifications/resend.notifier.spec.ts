import { ResendNotifier } from "./resend.notifier";

describe("ResendNotifier", () => {
  const OLD = process.env;
  beforeEach(() => { process.env = { ...OLD, RESEND_API_KEY: "re_test", EMAIL_FROM: "vibearning <noreply@vibearning.in>" }; });
  afterEach(() => { process.env = OLD; });

  it("POSTs the email to the Resend API with auth + from/to/subject/text", async () => {
    const http = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    const n = new ResendNotifier();
    n.setHttp(http as unknown as typeof fetch);
    await n.send("dev@x.com", "Verify your email", "click here");
    expect(http).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ authorization: "Bearer re_test", "content-type": "application/json" }),
    }));
    const body = JSON.parse((http.mock.calls[0][1] as { body: string }).body);
    expect(body).toMatchObject({ from: "vibearning <noreply@vibearning.in>", to: "dev@x.com", subject: "Verify your email", text: "click here" });
  });

  it("throws when the API responds non-ok", async () => {
    const http = jest.fn().mockResolvedValue({ ok: false, status: 422 });
    const n = new ResendNotifier();
    n.setHttp(http as unknown as typeof fetch);
    await expect(n.send("a@b.com", "s", "b")).rejects.toThrow(/email_send_failed_422/);
  });

  it("throws a clear error when no API key is configured", async () => {
    delete process.env.RESEND_API_KEY;
    const n = new ResendNotifier();
    n.setHttp((async () => ({ ok: true, status: 200 })) as unknown as typeof fetch);
    await expect(n.send("a@b.com", "s", "b")).rejects.toThrow(/resend_not_configured/);
  });
});
