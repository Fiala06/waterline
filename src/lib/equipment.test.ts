import { describe, expect, it } from "vitest";
import {
  parseServiceCadence,
  scheduleHours,
  scheduleText,
  serviceCadenceValue,
  serviceDueText,
} from "./equipment";

describe("service cadence", () => {
  it("maps a task interval to the select and back", () => {
    expect(serviceCadenceValue(null)).toBe("off");
    expect(serviceCadenceValue(30)).toBe("30");
    expect(serviceCadenceValue(28)).toBe("custom");
    expect(parseServiceCadence("off", "")).toBeNull();
    expect(parseServiceCadence("90", "")).toBe(90);
    expect(parseServiceCadence("custom", "28")).toBe(28);
    expect(parseServiceCadence("custom", "0")).toBeNull();
    expect(parseServiceCadence("nonsense", "")).toBeNull();
  });
  it("says when a service is due", () => {
    expect(serviceDueText(12)).toEqual({
      text: "Service due in 12 days",
      level: "ok",
    });
    expect(serviceDueText(0)).toEqual({
      text: "▲ Service due today",
      level: "warn",
    });
    expect(serviceDueText(-3)).toEqual({
      text: "✕ Service overdue 3 days",
      level: "bad",
    });
    expect(serviceDueText(-1).text).toBe("✕ Service overdue 1 day");
  });
});

describe("lighting and CO₂ schedule", () => {
  it("counts the hours, across midnight too", () => {
    expect(scheduleHours("08:00", "16:00")).toBe(8);
    expect(scheduleHours("22:00", "06:00")).toBe(8);
    expect(scheduleHours("08:30", "16:00")).toBe(7.5);
    expect(scheduleHours("08:00", null)).toBeNull();
    expect(scheduleHours("8:00", "16:00")).toBeNull();
  });
  it("writes the line for the dashboard", () => {
    expect(
      scheduleText({
        lightsOn: "08:00",
        lightsOff: "16:00",
        co2On: "07:00",
        co2Off: "15:00",
      }),
    ).toBe("Lights 08:00–16:00 · CO₂ 07:00–15:00");
    expect(
      scheduleText({
        lightsOn: "08:00",
        lightsOff: "16:00",
        co2On: null,
        co2Off: null,
      }),
    ).toBe("Lights 08:00–16:00");
    expect(
      scheduleText({
        lightsOn: null,
        lightsOff: null,
        co2On: null,
        co2Off: null,
      }),
    ).toBe("");
  });
});
