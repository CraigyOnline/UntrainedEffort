// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: vi.fn() },
}));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: { writeFile: vi.fn() },
  Directory: { Cache: "CACHE" },
  Encoding: { UTF8: "utf8" },
}));
vi.mock("@capacitor/share", () => ({
  Share: { share: vi.fn() },
}));

// Imported after the mocks above so exportBackup picks up the mocked
// modules rather than the real Capacitor/sonner packages.
const { toast } = await import("sonner");
const { Capacitor } = await import("@capacitor/core");
const { Filesystem } = await import("@capacitor/filesystem");
const { Share } = await import("@capacitor/share");
const { exportBackup } = await import("@/lib/backup");

beforeEach(async () => {
  const db = getDb();
  await db.routines.clear();
  await db.workouts.clear();
  await db.prHistory.clear();
  await db.exerciseSettings.clear();
  vi.clearAllMocks();
});

describe("exportBackup — web (non-native) platform", () => {
  it("downloads a Blob containing the full backup and reports success", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    await getDb().workouts.add({
      name: "Leg Day",
      startedAt: 1000,
      endedAt: 2000,
      durationSec: 1000,
      exercises: [],
    });
    await getDb().routines.add({ name: "Push", exercises: [], createdAt: 1000 });

    let capturedBlob: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      capturedBlob = blob as Blob;
      return "blob:mock-url";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const appendSpy = vi.spyOn(document.body, "appendChild");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const result = await exportBackup();

    expect(result).toBe(true);
    expect(capturedBlob).toBeDefined();
    const payload = JSON.parse(await capturedBlob!.text());
    expect(payload.schemaVersion).toBe(1);
    expect(payload.workouts).toHaveLength(1);
    expect(payload.routines).toHaveLength(1);

    const anchor = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.download).toMatch(/^untrained-effort-backup-.*\.json$/);
    expect(anchor.href).toBe("blob:mock-url");

    expect(toast.success).toHaveBeenCalledWith("Backup downloaded", { duration: 4000 });
    expect(Filesystem.writeFile).not.toHaveBeenCalled();
  });

  it("exports only the selected categories", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    await getDb().workouts.add({
      name: "Leg Day",
      startedAt: 1000,
      endedAt: 2000,
      durationSec: 1000,
      exercises: [],
    });
    await getDb().routines.add({ name: "Push", exercises: [], createdAt: 1000 });

    let capturedBlob: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      capturedBlob = blob as Blob;
      return "blob:mock-url";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(document.body, "appendChild");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await exportBackup({ workouts: true });

    const payload = JSON.parse(await capturedBlob!.text());
    expect(payload.workouts).toHaveLength(1);
    expect(payload.routines).toHaveLength(0);
    expect(payload.prHistory).toHaveLength(0);
    expect(payload.exerciseSettings).toHaveLength(0);
  });
});

describe("exportBackup — native platform", () => {
  it("writes to the filesystem and shares it", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Filesystem.writeFile).mockResolvedValue({ uri: "file://mock/backup.json" });
    vi.mocked(Share.share).mockResolvedValue({});

    const result = await exportBackup();

    expect(result).toBe(true);
    expect(Filesystem.writeFile).toHaveBeenCalledTimes(1);
    const writeArgs = vi.mocked(Filesystem.writeFile).mock.calls[0][0];
    expect(writeArgs.path).toMatch(/^untrained-effort-backup-.*\.json$/);
    const payload = JSON.parse(writeArgs.data as string);
    expect(payload.schemaVersion).toBe(1);

    expect(Share.share).toHaveBeenCalledWith(
      expect.objectContaining({ url: "file://mock/backup.json" }),
    );
    expect(toast.success).toHaveBeenCalledWith("Backup exported", { duration: 4000 });
  });

  it("returns false without an error toast when the user cancels the share sheet", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Filesystem.writeFile).mockResolvedValue({ uri: "file://mock/backup.json" });
    const abortError = new Error("cancelled");
    abortError.name = "AbortError";
    vi.mocked(Share.share).mockRejectedValue(abortError);

    const result = await exportBackup();

    expect(result).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("reports failure and shows an error toast on an unexpected error", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Filesystem.writeFile).mockRejectedValue(new Error("disk full"));

    const result = await exportBackup();

    expect(result).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Export failed", { duration: 4000 });
  });
});
