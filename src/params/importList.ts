import type { ParamMatcher } from '@sveltejs/kit';

// The lists a spreadsheet can be imported into: /tanks/[id]/import/plants
export const match = ((v: string) => v === 'livestock' || v === 'plants' || v === 'equipment') satisfies ParamMatcher;
