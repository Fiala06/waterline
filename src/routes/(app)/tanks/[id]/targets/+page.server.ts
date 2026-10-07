import { fail, redirect } from "@sveltejs/kit";
import { paramTip, whenToTest } from "$lib/tips";
import { parseTestEvery } from "$lib/status";
import {
  defaultParameters,
  fmtTarget,
  paramDecimals,
  paramUnit,
  storedValue,
} from "$lib/params";
import { setFlash } from "$lib/server/flash";
import { num, str } from "$lib/server/forms";
import {
  addCustomParam,
  deleteCustomParam,
  getTank,
  listParams,
  readingCounts,
  reusableCustomParams,
  resetParamDefaults,
  updateParams,
} from "$lib/server/tanks";
import { checkSection } from "$lib/server/review";
import { safeReturn } from "$lib/server/redirect";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals, params, url }) => {
  const user = locals.user!;
  const tank = getTank(user.id, params.id, 'owner');
  const defaults = new Map(
    defaultParameters(user, tank.type).map((d) => [d.key, d]),
  );
  const counts = readingCounts(tank.id);
  return {
    tank: { id: tank.id, name: tank.name, type: tank.type },
    reusable: reusableCustomParams(user.id, tank.id),
    fromReview: url.searchParams.get("from") === "review",
    // from the water test form: Save (and the back link) go back to it
    returnTo: safeReturn(url.searchParams.get("from"), "") || null,
    rows: listParams(tank.id, { all: true }).map((p) => {
      const d = defaults.get(p.key);
      return {
        id: p.id,
        name: p.name,
        unit: paramUnit(p, user),
        isCustom: p.isCustom,
        tip: p.isCustom ? null : paramTip(p.key, tank.type),
        when: p.isCustom ? null : whenToTest(p.key, tank.type),
        readings: counts.get(p.id) ?? 0,
        tracked: p.tracked,
        testEvery: p.testEveryDays == null ? "" : String(p.testEveryDays),
        decimals: paramDecimals(p, user),
        min: p.min == null ? "" : fmtTarget(p, p.min, user),
        max: p.max == null ? "" : fmtTarget(p, p.max, user),
        defaultText:
          d && !p.isCustom
            ? `Default ${fmtTarget(p, d.min, user)}–${fmtTarget(p, d.max, user)}${paramUnit(p, user) ? " " + paramUnit(p, user) : ""}`
            : p.isCustom
              ? "Custom parameter"
              : `Not in the ${tank.type} preset`,
      };
    }),
  };
};

export const actions: Actions = {
  save: async ({ request, locals, params, cookies }) => {
    const user = locals.user!;
    getTank(user.id, params.id, 'owner');
    const form = await request.formData();
    const existing = listParams(params.id, { all: true });
    const errors: Record<string, string> = {};
    // A field left as shown keeps its exact stored value (the page shows it rounded).
    const limit = (p: (typeof existing)[number], field: "min" | "max") => {
      const old = p[field];
      if (
        old != null &&
        str(form, `${field}_${p.id}`) === fmtTarget(p, old, user)
      )
        return old;
      const v = num(form, `${field}_${p.id}`);
      return v == null ? null : storedValue(p, v, user);
    };
    const rows = existing.map((p) => {
      const min = limit(p, "min");
      const max = limit(p, "max");
      if (min != null && max != null && min > max)
        errors[p.id] = "Min must be below max.";
      return {
        id: p.id,
        min,
        max,
        tracked: form.get(`tracked_${p.id}`) === "on",
        // "Test every": a reading older than this is due on the dashboard
        testEveryDays: parseTestEvery(form.get(`testEvery_${p.id}`)),
      };
    });
    if (Object.keys(errors).length) return fail(400, { errors });
    updateParams(user.id, params.id, rows);
    setFlash(cookies, "✓ Targets saved");
    // from the setup review (#30): the ranges are right now, and back to it
    if (form.get("from") === "review") {
      checkSection(user.id, params.id, "targets");
      redirect(303, `/tanks/${params.id}/review#targets`);
    }
    // from the water test: back to the readings, which the form kept as a draft
    const back = safeReturn(form.get("from"), "");
    if (back) redirect(303, back);
    redirect(303, `/tanks/${params.id}/targets`);
  },
  reset: async ({ locals, params, cookies }) => {
    resetParamDefaults(locals.user!, params.id);
    setFlash(cookies, "Targets reset to defaults");
    redirect(303, `/tanks/${params.id}/targets`);
  },
  addCustom: async ({ request, locals, params, cookies }) => {
    const form = await request.formData();
    const name = str(form, "name").slice(0, 40);
    const unitChoice = str(form, "unit");
    const unit = (
      unitChoice === "custom" ? str(form, "customUnit") : unitChoice
    ).slice(0, 12);
    const min = num(form, "min");
    const max = num(form, "max");
    const decimals = Math.min(
      3,
      Math.max(0, Math.round(num(form, "decimals") ?? 2)),
    );
    const values = Object.fromEntries(
      [...form].map(([k, v]) => [k, String(v)]),
    );
    if (!name)
      return fail(400, {
        custom: { error: "Give the parameter a name.", values },
      });
    if (min != null && max != null && min > max)
      return fail(400, { custom: { error: "Min must be below max.", values } });
    addCustomParam(locals.user!.id, params.id, {
      name,
      unit,
      min,
      max,
      decimals,
    });
    setFlash(cookies, `✓ ${name} added`);
    redirect(303, `/tanks/${params.id}/targets`);
  },
  deleteCustom: async ({ request, locals, params, cookies }) => {
    const id = String((await request.formData()).get("paramId") ?? "");
    deleteCustomParam(locals.user!.id, params.id, id);
    setFlash(cookies, "Custom parameter removed");
    redirect(303, `/tanks/${params.id}/targets`);
  },
};
