import { Test } from "@nestjs/testing";
import { MetricsService } from "./metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { RateLimitService } from "./rate-limit.service";
import { LedgerService } from "../ledger/ledger.service";

const prismaMock = { adEvent: { findUnique: jest.fn(), create: jest.fn() } };
const rateMock = { takeSpacingSlot: jest.fn(), incrCaps: jest.fn() };
const ledgerMock = { postForEvent: jest.fn() };

const impression = {
  installId: "i1", campaignId: "c1", surface: "codex-panel" as const,
  type: "impression" as const, nonce: "nonce_aaaa", visibleMs: 6000,
};

describe("MetricsService", () => {
  let svc: MetricsService;
  beforeEach(async () => {
    jest.resetAllMocks();
    rateMock.takeSpacingSlot.mockResolvedValue(true);
    rateMock.incrCaps.mockResolvedValue({ withinHourly: true, withinDaily: true });
    prismaMock.adEvent.findUnique.mockResolvedValue(null);
    prismaMock.adEvent.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({ id: "ev1", ...args.data }));
    const mod = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RateLimitService, useValue: rateMock },
        { provide: LedgerService, useValue: ledgerMock },
      ],
    }).compile();
    svc = mod.get(MetricsService);
  });

  it("records a valid impression", async () => {
    const r = await svc.ingest(impression);
    expect(r).toEqual({ deduped: false, valid: true, reason: null });
    expect(prismaMock.adEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ valid: true, reason: null }) }),
    );
    expect(ledgerMock.postForEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "ev1", valid: true }));
  });

  it("is idempotent on a duplicate (installId, nonce)", async () => {
    prismaMock.adEvent.findUnique.mockResolvedValue({ valid: true, reason: null });
    const r = await svc.ingest(impression);
    expect(r).toEqual({ deduped: true, valid: true, reason: null });
    expect(prismaMock.adEvent.create).not.toHaveBeenCalled();
  });

  it("marks an impression under the 5s threshold invalid", async () => {
    const r = await svc.ingest({ ...impression, nonce: "nonce_bbbb", visibleMs: 1000 });
    expect(r).toMatchObject({ valid: false, reason: "view_too_short" });
    expect(rateMock.takeSpacingSlot).not.toHaveBeenCalled(); // no slot/cap spend on short views
    expect(ledgerMock.postForEvent).not.toHaveBeenCalled();
  });

  it("marks an impression invalid when spacing is refused", async () => {
    rateMock.takeSpacingSlot.mockResolvedValue(false);
    const r = await svc.ingest({ ...impression, nonce: "nonce_cccc" });
    expect(r).toMatchObject({ valid: false, reason: "spacing" });
  });

  it("marks an impression invalid when over the hourly cap", async () => {
    rateMock.incrCaps.mockResolvedValue({ withinHourly: false, withinDaily: true });
    const r = await svc.ingest({ ...impression, nonce: "nonce_dddd" });
    expect(r).toMatchObject({ valid: false, reason: "hourly_cap" });
  });

  it("counts a click as valid without view/spacing checks", async () => {
    const r = await svc.ingest({ ...impression, type: "click", nonce: "nonce_eeee", visibleMs: 0 });
    expect(r).toEqual({ deduped: false, valid: true, reason: null });
    expect(rateMock.takeSpacingSlot).not.toHaveBeenCalled();
  });
});
