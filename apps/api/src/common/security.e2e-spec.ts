import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";
import { configureApp } from "./configure-app";

describe("security hardening (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app); // exact production helmet + CORS config
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it("sets helmet security headers and hides x-powered-by", async () => {
    const res = await request(app.getHttpServer()).get("/health").expect(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("returns the consistent error envelope (status preserved) for a 400", async () => {
    const res = await request(app.getHttpServer()).get("/serve?surface=cursor").expect(400);
    expect(res.body).toEqual(expect.objectContaining({ statusCode: 400, error: expect.any(String) }));
  });
});
