import { Test } from "@nestjs/testing";
import { AuditService } from "./audit.service";
import { PrismaService } from "../prisma/prisma.service";

const prismaMock = { adminAudit: { create: jest.fn(), findMany: jest.fn() } };

describe("AuditService", () => {
  let svc: AuditService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    svc = mod.get(AuditService);
  });

  it("records an action with a serialized detail blob", async () => {
    await svc.record("admin1", "killswitch.set", "global", { active: true });
    expect(prismaMock.adminAudit.create).toHaveBeenCalledWith({
      data: { actor: "admin1", action: "killswitch.set", target: "global", detail: JSON.stringify({ active: true }) },
    });
  });

  it("records without a target or detail", async () => {
    await svc.record("apikey", "audit.read");
    expect(prismaMock.adminAudit.create).toHaveBeenCalledWith({
      data: { actor: "apikey", action: "audit.read", target: null, detail: null },
    });
  });

  it("recent() returns newest-first, limited", async () => {
    prismaMock.adminAudit.findMany.mockResolvedValue([{ id: "x" }]);
    await svc.recent(50);
    expect(prismaMock.adminAudit.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: "desc" }, take: 50 });
  });
});
