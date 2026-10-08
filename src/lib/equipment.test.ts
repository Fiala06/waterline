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

describe('schedules on equipment (#25)', async () => {
	const { isOnAt, lightingText, onNowText, parseSchedule, scheduleLabel, scheduleTotalHours, tankLighting } = await import('./equipment');
	const siesta = { periods: [{ on: '08:00', off: '12:00' }, { on: '14:00', off: '18:00' }], rampMin: 30 };

	it('reads a stored schedule and drops junk', () => {
		expect(parseSchedule(siesta)).toEqual(siesta);
		expect(parseSchedule({ periods: [{ on: '8:00', off: '12:00' }] })).toBeNull();
		expect(parseSchedule({ periods: [], rampMin: 30 })).toBeNull();
		expect(parseSchedule(null)).toBeNull();
		expect(parseSchedule({ periods: [{ on: '22:00', off: '06:00' }], rampMin: -5 })).toEqual({ periods: [{ on: '22:00', off: '06:00' }], rampMin: null });
	});

	it('adds the periods up, across midnight too', () => {
		expect(scheduleTotalHours(siesta)).toBe(8);
		expect(scheduleTotalHours({ periods: [{ on: '22:00', off: '06:00' }], rampMin: null })).toBe(8);
		expect(scheduleTotalHours(null)).toBeNull();
		expect(scheduleLabel(siesta)).toBe('08:00–12:00, 14:00–18:00 · 8 h · ramps 30 min');
		expect(scheduleLabel(null)).toBe('All day');
	});

	it('knows when it is on', () => {
		expect(isOnAt(siesta, '09:00')).toBe(true);
		expect(isOnAt(siesta, '13:00')).toBe(false);
		expect(isOnAt(siesta, '18:00')).toBe(false);
		expect(isOnAt({ periods: [{ on: '22:00', off: '06:00' }], rampMin: null }, '02:00')).toBe(true);
		expect(isOnAt(null, '02:00')).toBe(true);
		expect(onNowText(siesta, '09:00')).toEqual({ on: true, text: '● On now · off at 12:00' });
		expect(onNowText(siesta, '13:00')).toEqual({ on: false, text: '○ Off · on at 14:00' });
		expect(onNowText(siesta, '19:00')).toEqual({ on: false, text: '○ Off · on at 08:00' });
	});

	it("takes the light's schedule over the tank's times, and falls back to them", () => {
		const tank = { lightsOn: '09:00', lightsOff: '17:00', co2On: '08:00', co2Off: '16:00', photoperiodH: 8 };
		const light = { id: 'l', type: 'light' as const, name: 'Lumora', schedule: siesta };
		const l = tankLighting(tank, [light]);
		expect(l.lights?.item?.id).toBe('l');
		expect(l.lights?.hours).toBe(8);
		expect(l.co2?.item).toBeNull();
		expect(l.co2?.schedule.periods).toEqual([{ on: '08:00', off: '16:00' }]);
		expect(lightingText(tank, [light])).toBe('Lights 08:00–12:00, 14:00–18:00 · CO₂ 08:00–16:00');
		expect(lightingText({ lightsOn: null, lightsOff: null, co2On: null, co2Off: null, photoperiodH: null }, [])).toBe('');
		expect(tankLighting({ lightsOn: null, lightsOff: null, co2On: null, co2Off: null, photoperiodH: 7 }, []).photoperiodH).toBe(7);
	});
});

describe('a light period the form previews and the server saves (#120)', () => {
	it('needs two real times that differ', async () => {
		const { isCompletePeriod } = await import('./equipment');
		expect(isCompletePeriod({ on: '08:00', off: '16:00' })).toBe(true);
		expect(isCompletePeriod({ on: '22:00', off: '06:00' })).toBe(true);
		expect(isCompletePeriod({ on: '08:00', off: '08:00' })).toBe(false);
		expect(isCompletePeriod({ on: '25:00', off: '06:00' })).toBe(false);
		expect(isCompletePeriod({ on: '8:00', off: '16:00' })).toBe(false);
		expect(isCompletePeriod({ on: '', off: '16:00' })).toBe(false);
	});
});
