import { describe, expect, it } from 'vitest';
import { refusal } from '$lib/forms';
import { refuse } from './forms';

// #269: every refused form answers in one shape, read the same way on every page
describe('refuse / refusal', () => {
	it('builds one shape for a message or for fields, and reads it back for the form it was', () => {
		const whole = refuse('name', 'Enter a name.');
		expect(whole.status).toBe(400);
		expect(whole.data).toEqual({ refused: { form: 'name', message: 'Enter a name.', errors: {}, values: {} } });
		expect(refusal(whole.data, 'name').message).toBe('Enter a name.');

		const fields = refuse('par', { value: 'Enter the PAR reading (0–5000).' }, { spot: 'Left' }, 422);
		expect(fields.status).toBe(422);
		const r = refusal(fields.data, 'par');
		expect(r.message).toBe('');
		expect(r.errors.value).toBe('Enter the PAR reading (0–5000).');
		expect(r.values).toEqual({ spot: 'Left' });
	});

	it('is empty for another form, or none', () => {
		const other = refuse('photo', 'Choose a photo.');
		expect(refusal(other.data, 'name')).toEqual({ form: '', message: '', errors: {}, values: {} });
		expect(refusal(null, 'name').errors).toEqual({});
		expect(refusal(undefined, 'name').message).toBe('');
		expect(refusal({ error: 'an older shape' }, 'name').message).toBe('');
	});
});
