import type { ParamMatcher } from '@sveltejs/kit';
import { importKindOf } from '$lib/imports';

// What a spreadsheet can be imported as: /tanks/[id]/import/plants, /tanks/[id]/import/water-changes
export const match = ((v: string) => importKindOf(v) !== null) satisfies ParamMatcher;
