import { describe, expect, it } from 'vitest';
import { formValues } from './forms';

describe('formValues (#361)', () => {
	it('keeps each field as typed, lists for the fields named, and leaves files out', () => {
		const form = new FormData();
		form.append('note', 'Cloudy');
		form.append('tags', 'Algae');
		form.append('tags', 'Smell');
		form.append('photos', new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
		expect(formValues(form)).toEqual({ note: 'Cloudy', tags: 'Algae' });
		expect(formValues(form, ['tags'])).toEqual({ note: 'Cloudy', tags: ['Algae', 'Smell'] });
	});
});
