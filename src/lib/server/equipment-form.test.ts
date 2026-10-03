import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "wl-equipment-form-"));
vi.mock("$env/dynamic/private", () => ({ env: { DATA_DIR: dir } }));
const { db } = await import("./db");
const { equipment, tanks, tasks, users } = await import("./db/schema");
const { syncServiceTask } = await import("./equipment-form");

describe("equipment service reminders", () => {
  it("renames an existing reminder when the equipment name changes", () => {
    const user = db
      .insert(users)
      .values({ email: "keeper@example.com", displayName: "Keeper" })
      .returning()
      .get();
    const tank = db
      .insert(tanks)
      .values({ userId: user.id, name: "River", type: "freshwater" })
      .returning()
      .get();
    const item = db
      .insert(equipment)
      .values({
        tankId: tank.id,
        type: "filter",
        brand: "Fluval",
        model: "107",
      })
      .returning()
      .get();
    const reminder = db
      .insert(tasks)
      .values({
        tankId: tank.id,
        equipmentId: item.id,
        name: "Clean Fluval 107",
        kind: "maintenance",
        recurring: true,
        intervalDays: 30,
        nextDue: "2026-10-20",
        snoozedUntil: "2026-10-22",
      })
      .returning()
      .get();

    const renamed = db
      .update(equipment)
      .set({ model: "207" })
      .where(eq(equipment.id, item.id))
      .returning()
      .get();
    syncServiceTask(user, renamed, 30);

    expect(db.select().from(tasks).get()).toMatchObject({
      id: reminder.id,
      name: "Clean Fluval 207",
      nextDue: "2026-10-20",
      snoozedUntil: "2026-10-22",
    });
  });
});
