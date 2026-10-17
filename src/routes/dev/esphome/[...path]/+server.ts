import { error, json, text } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

// DEVELOPMENT ONLY (AUTH_DEV_LOGIN=true): an ESPHome device's web server as
// Waterline reads it when a device is polled: the event stream that lists its
// sensors on connecting, and a sensor's value on request, for the end-to-end
// tests. Shaped like an Apollo TEMP-1: a probe in the water, the board's own
// temperature and humidity, and a second probe with nothing plugged in.
const TITLE = 'Apollo TEMP-1 20f0ac';
const SENSORS = [
	{ id: 'temperature_probe', name: 'Temperature Probe', value: 23.6, uom: '°C' },
	{ id: 'board_temperature', name: 'Board Temperature', value: 34.91, uom: '°C' },
	{ id: 'board_humidity', name: 'Board Humidity', value: 29.23, uom: '%' },
	{ id: 'food_probe', name: 'Food Probe', value: NaN, uom: '°C' }
];

// ESPHome writes a sensor without a value as "NaN" with the state "NA"
const sensorJson = (s: (typeof SENSORS)[number], all: boolean) => ({
	id: `sensor-${s.id}`,
	value: Number.isNaN(s.value) ? 'NaN' : s.value,
	state: Number.isNaN(s.value) ? 'NA' : `${s.value} ${s.uom}`,
	...(all ? { name: s.name, icon: '', entity_category: 0, uom: s.uom } : {})
});

export const GET: RequestHandler = ({ params, url }) => {
	if (env.AUTH_DEV_LOGIN !== 'true') error(404);
	const path = params.path;
	if (path === 'events') {
		const lines = [`event: ping\ndata: ${JSON.stringify({ title: TITLE, comment: '', ota: true, log: true, lang: 'en' })}\n`];
		for (const s of SENSORS) lines.push(`event: state\ndata: ${JSON.stringify(sensorJson(s, true))}\n`);
		return text(lines.join('\n') + '\n', { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } });
	}
	const m = /^sensor\/([a-z0-9_]+)$/.exec(path);
	if (m) {
		const s = SENSORS.find((x) => x.id === m[1]);
		if (!s) error(404, 'Not found');
		return json(sensorJson(s, url.searchParams.get('detail') === 'all'), { headers: { 'cache-control': 'no-store' } });
	}
	error(404, 'Not found');
};
