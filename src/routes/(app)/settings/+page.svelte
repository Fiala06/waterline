<script module lang="ts">
	const REGIONS: Record<string, string> = { America: 'Americas', Indian: 'Indian Ocean' };

	/** The time zone picker: cities grouped by region ("Americas › Los Angeles"). */
	function zoneGroups(zones: string[], current: string) {
		const groups = new Map<string, { id: string; city: string }[]>();
		for (const id of zones.includes(current) ? zones : [current, ...zones]) {
			const [region, ...rest] = id.split('/');
			const name = rest.length ? (REGIONS[region] ?? region) : 'Other';
			const city = (rest.length ? rest.reverse().join(', ') : id).replace(/_/g, ' ');
			if (!groups.has(name)) groups.set(name, []);
			groups.get(name)!.push({ id, city });
		}
		return [...groups]
			.map(([name, list]) => ({ name, list: list.sort((a, b) => a.city.localeCompare(b.city)) }))
			.sort((a, b) => (a.name === 'Other' ? 1 : b.name === 'Other' ? -1 : a.name.localeCompare(b.name)));
	}

	/** "Pacific Time" for America/Los_Angeles (as in Setup); the city where there's no name. */
	function zoneName(tz: string) {
		try {
			const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longGeneric' })
				.formatToParts(new Date())
				.find((p) => p.type === 'timeZoneName')?.value;
			if (name && !name.startsWith('GMT')) return name;
		} catch {
			/* a zone this browser doesn't know */
		}
		return (tz.split('/').pop() ?? tz).replace(/_/g, ' ');
	}
</script>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { untrack } from 'svelte';
	import ProfilePhoto from '$lib/components/ProfilePhoto.svelte';
	import PushSettings from '$lib/components/PushSettings.svelte';
	import { CURRENCIES, currencyName } from '$lib/money';
	import { LEAD_OPTIONS, SEND_TIMES } from '$lib/notify-options';
	import { install, promptInstall } from '$lib/install.svelte';
	import { toast, ui } from '$lib/ui.svelte';
	import { fmtWhen } from '$lib/time';
	let installHelp = $state(false);
	let { data, form } = $props();
	const u = $derived(data.user);
	const p = $derived(data.prefs);
	// the tasks calendar (#23): all tanks, or one
	let calTank = $state('');
	const calUrl = $derived(data.calendar ? data.calendar.url + (calTank ? `?tank=${calTank}` : '') : '');
	let calCopied = $state(false);
	async function copyCal() {
		try {
			await navigator.clipboard.writeText(calUrl);
			calCopied = true;
			setTimeout(() => (calCopied = false), 2000);
		} catch {
			/* clipboard blocked: the field can still be selected */
		}
	}

	const unsubscribedOn = $derived(
		p.unsubscribedAt
			? new Date(p.unsubscribedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: u.timeZone })
			: null
	);

	// 16 shows values, not controls: each picker row draws its value over an invisible native select.
	let unitSystem = $state(untrack(() => u.unitSystem));
	let hardnessUnit = $state(untrack(() => u.hardnessUnit));
	let currency = $state(untrack(() => u.currency));
	let timeZone = $state(untrack(() => u.timeZone));
	let leadDays = $state(untrack(() => p.leadDays));
	let sendTime = $state(untrack(() => p.sendTime));
	let delivery = $state(untrack(() => p.delivery));
	const zones = $derived(zoneGroups(data.timeZones, u.timeZone));
	// each kind by email and by push (#16), on its own switches
	const toggles = [
		{ k: 'taskReminders', pk: 'pushTaskReminders', t: 'Task reminders', d: 'Before a task is due' },
		{ k: 'overdueAlerts', pk: 'pushOverdueAlerts', t: 'Overdue alerts', d: 'When a task passes its due date' },
		{ k: 'outOfRangeAlerts', pk: 'pushOutOfRangeAlerts', t: 'Out-of-range alerts', d: 'When a logged reading is outside its target' }
	] as const;

	// Changes save right away, one request per form at a time; the server's flash
	// ("✓ Settings saved") comes back as the toast. Without JS, the <noscript>
	// buttons submit the same two forms.
	let errs = $state({ error: '', notifyError: '' });
	const nameError = $derived(errs.error || form?.error || '');
	const emailError = $derived(errs.notifyError || form?.notifyError || '');
	const saving: Record<string, { busy: boolean; again: boolean; sent: string }> = {};
	const autosave: SubmitFunction = ({ formElement, formData, action, cancel }) => {
		const key = action.search.includes('notifications') ? 'notifyError' : 'error';
		const s = (saving[key] ??= { busy: false, again: false, sent: '' });
		const body = JSON.stringify([...formData]);
		if (s.busy) {
			s.again = true;
			return cancel();
		}
		if (body === s.sent) return cancel();
		s.busy = true;
		s.sent = body;
		return async ({ result, update }) => {
			s.busy = false;
			if (result.type === 'redirect') {
				errs[key] = '';
				await invalidateAll();
			} else {
				s.sent = '';
				if (result.type === 'failure') errs[key] = String(result.data?.[key] ?? '');
				else if (result.type === 'error' && result.status === undefined) toast("✕ Couldn't save. You're offline.");
				else await update({ reset: false });
			}
			if (s.again && formElement.isConnected) {
				s.again = false;
				formElement.requestSubmit();
			}
		};
	};
	function onchange(e: Event) {
		const f = (e.target as HTMLInputElement).form;
		if (f?.id === 'settings-form' || f?.id === 'notify-form') f.requestSubmit();
	}
	// Signing out clears this device, including entries still waiting to sync.
	const unsynced = $derived.by(() => {
		const n = ui.queue.length;
		if (!n) return '';
		return n === 1
			? "▲ 1 entry hasn't synced yet. Sign out once it has, or it may be lost."
			: `▲ ${n} entries haven't synced yet. Sign out once they have, or they may be lost.`;
	});
</script>

<svelte:head><title>Settings · Waterline</title></svelte:head>

<form id="settings-form" method="POST" action="?/save" use:enhance={autosave}></form>
<form id="notify-form" method="POST" action="?/notifications" use:enhance={autosave}></form>

<div class="page sub-page" {onchange}>
	<h1 class="title hide-desk">Settings</h1>
	<div class="sections">
		<section id="profile" class="sec" aria-labelledby="profile-h">
			<h2 id="profile-h">Profile</h2>
			<div class="group">
				<div class="row photo-row"><ProfilePhoto user={u} error={form?.photoError} /></div>
				<label class="row edit">
					<span class="k">Name</span>
					<input
						class="v"
						name="displayName"
						form="settings-form"
						defaultValue={u.displayName}
						required
						maxlength="80"
						autocomplete="name"
						aria-invalid={!!nameError}
						aria-describedby={nameError ? 'name-error' : undefined}
					/>
					<span class="chev" aria-hidden="true"></span>
				</label>
				<label class="row edit">
					<span class="k">Notification email</span>
					<input
						class="v"
						id="notifyEmail"
						name="notifyEmail"
						form="notify-form"
						type="email"
						defaultValue={p.notifyEmail}
						placeholder={u.email}
						autocomplete="email"
						aria-invalid={!!emailError}
						aria-describedby="{emailError ? 'email-error ' : ''}email-hint"
					/>
					<span class="chev" aria-hidden="true"></span>
				</label>
			</div>
			{#if nameError}<p class="error-text" id="name-error" role="alert">✕ {nameError}</p>{/if}
			{#if emailError}<p class="error-text" id="email-error" role="alert">✕ {emailError}</p>{/if}
			<p class="hint" id="email-hint">Leave empty to use {u.email}.</p>
		</section>

		<section id="units" class="sec" aria-labelledby="units-h">
			<h2 id="units-h">Units</h2>
			<div class="group">
				<div class="row pick">
					<label class="k" for="unitSystem">Unit system</label>
					<span class="v" aria-hidden="true">{unitSystem === 'metric' ? 'Metric' : 'Imperial'}</span>
					<span class="chev" aria-hidden="true"></span>
					<select id="unitSystem" name="unitSystem" form="settings-form" bind:value={unitSystem}>
						<option value="imperial">Imperial (gal · °F · in)</option>
						<option value="metric">Metric (L · °C · cm)</option>
					</select>
				</div>
				<div class="row pick">
					<label class="k" for="hardnessUnit">Hardness</label>
					<span class="v" aria-hidden="true">{hardnessUnit === 'ppm' ? 'ppm' : 'dGH / dKH'}</span>
					<span class="chev" aria-hidden="true"></span>
					<select id="hardnessUnit" name="hardnessUnit" form="settings-form" bind:value={hardnessUnit}>
						<option value="dgh">dGH / dKH</option>
						<option value="ppm">ppm</option>
					</select>
				</div>
				<div class="row pick">
					<label class="k" for="currency">Currency</label>
					<span class="v" aria-hidden="true">{currencyName(currency)}</span>
					<span class="chev" aria-hidden="true"></span>
					<select id="currency" name="currency" form="settings-form" bind:value={currency}>
						{#each CURRENCIES as c (c)}<option value={c}>{currencyName(c)}</option>{/each}
					</select>
				</div>
				<div class="row pick">
					<label class="k" for="timeZone">Time zone</label>
					<span class="v" aria-hidden="true">{zoneName(timeZone)}</span>
					<span class="chev" aria-hidden="true"></span>
					<select id="timeZone" name="timeZone" form="settings-form" bind:value={timeZone}>
						{#each zones as g (g.name)}
							<optgroup label={g.name}>
								{#each g.list as z (z.id)}<option value={z.id}>{z.city}</option>{/each}
							</optgroup>
						{/each}
					</select>
				</div>
			</div>
		</section>

		<section id="notifications" class="sec" aria-labelledby="notifications-h">
			<div class="sec-head">
				<h2 id="notifications-h">Notifications</h2>
				<p class="sub hide-phone">Sent to {p.notifyEmail || u.email} · <label class="change" for="notifyEmail">Change</label></p>
			</div>
			{#if !data.emailReady}
				<p class="banner banner-warn">
					▲ Email isn't set up on this server yet{u.isAdmin ? '.' : ', so nothing will be sent. Ask the server owner to set it up.'}
					{#if u.isAdmin}<a href="/settings/server">Set up email delivery ›</a>{/if}
				</p>
			{/if}
			{#if unsubscribedOn}
				<p class="banner banner-warn">▲ You unsubscribed from all emails on {unsubscribedOn}. Turn any of these on to start again.</p>
			{/if}
			<div class="group">
				<div class="row cols" aria-hidden="true"><span class="col">Email</span><span class="col">Push</span></div>
				{#each toggles as row (row.k)}
					<div class="row toggle">
						<span class="ttext"><span class="tt">{row.t}</span><span class="td" id="n-{row.k}-d">{row.d}</span></span>
						<span class="switch">
							<input
								id="n-{row.k}"
								type="checkbox"
								name={row.k}
								form="notify-form"
								aria-label="{row.t} by email"
								aria-describedby="n-{row.k}-d"
								defaultChecked={!p.unsubscribedAt && p[row.k]}
							/>
							<span></span>
						</span>
						<span class="switch">
							<input id="n-{row.pk}" type="checkbox" name={row.pk} form="notify-form" aria-label="{row.t} by push" aria-describedby="n-{row.k}-d" defaultChecked={p[row.pk]} />
							<span></span>
						</span>
					</div>
				{/each}
				<div class="row stack">
					<span class="k" id="delivery-k">Delivery</span>
					<div class="segmented sm" role="radiogroup" aria-labelledby="delivery-k">
						<label><input type="radio" name="delivery" value="individual" form="notify-form" bind:group={delivery} />Each</label>
						<label><input type="radio" name="delivery" value="daily" form="notify-form" bind:group={delivery} />Daily digest</label>
						<label><input type="radio" name="delivery" value="weekly" form="notify-form" bind:group={delivery} />Weekly</label>
					</div>
					{#if delivery !== 'individual'}<span class="hint"
							>{delivery === 'weekly' ? 'Weekly digests go out on Mondays. ' : ''}Digests are by email; push still sends each one on its own.</span
						>{/if}
				</div>
				<div class="row pick">
					<label class="k" for="leadDays">Remind me</label>
					<span class="v" aria-hidden="true">{LEAD_OPTIONS.find((o) => o.days === Number(leadDays))?.label}</span>
					<span class="chev" aria-hidden="true"></span>
					<select id="leadDays" name="leadDays" form="notify-form" bind:value={leadDays}>
						{#each LEAD_OPTIONS as o (o.days)}<option value={o.days}>{o.label}</option>{/each}
					</select>
				</div>
				<div class="row pick">
					<label class="k" for="sendTime">Send at</label>
					<span class="v" aria-hidden="true">{SEND_TIMES.find((t) => t.value === sendTime)?.label}</span>
					<span class="chev" aria-hidden="true"></span>
					<select id="sendTime" name="sendTime" form="notify-form" bind:value={sendTime}>
						{#each SEND_TIMES as t (t.value)}<option value={t.value}>{t.label}</option>{/each}
					</select>
				</div>
			</div>
			<p class="hint">Every email includes a link back to these settings and a one-click unsubscribe.</p>
			<noscript><button class="btn btn-lg" form="notify-form">Save notifications</button></noscript>
			<PushSettings push={data.push} timeZone={u.timeZone} {form} />
		</section>

		<section id="calendar" class="sec" aria-labelledby="calendar-h">
			<h2 id="calendar-h">Calendar</h2>
			{#if data.calendar}
				<div class="group">
					<div class="row stack">
						<div class="cal-head">
							<label class="k" for="cal-url">Your tasks calendar</label>
							<button type="button" class="btn-text cal-copy" onclick={copyCal}>{calCopied ? '✓ Copied' : 'Copy'}<span class="sr-only"> the calendar link</span></button>
						</div>
						<input id="cal-url" class="input mono cal-url" readonly value={calUrl} onfocus={(e) => e.currentTarget.select()} />
						{#if data.calendarTanks.length > 1}
							<label class="cal-for"
								><span>For</span>
								<select class="input" bind:value={calTank}>
									<option value="">All tanks</option>
									{#each data.calendarTanks as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
								</select></label
							>
						{/if}
					</div>
					<a class="row link" href={calUrl.replace(/^https?:/, 'webcal:')}><span class="k">Open in my calendar app</span><span class="chev" aria-hidden="true"></span></a>
				</div>
				<p class="hint">
					In Google Calendar, choose Other calendars › From URL and paste the link. Apple Calendar and Outlook open it from Open in my calendar app. Calendars check for
					changes every few hours{data.calendar.lastFetchedAt ? `; yours last checked ${fmtWhen(data.calendar.lastFetchedAt, u.timeZone)}` : ''}. Anyone with the link can
					see your tasks, so keep it private.
				</p>
				<div class="cal-acts">
					<form method="POST" action="?/calendarNew" use:enhance><button class="btn">Make a new link</button></form>
					<form method="POST" action="?/calendarOff" use:enhance><button class="btn-text cal-off">Turn off</button></form>
				</div>
			{:else}
				<p class="sub">See your tasks in Google Calendar, Apple Calendar or Outlook, each on the day it's due, and kept up to date.</p>
				<form method="POST" action="?/calendarOn" use:enhance><button class="btn cal-on">Make a calendar link</button></form>
			{/if}
		</section>

		<section id="theme" class="sec" aria-labelledby="theme-h">
			<h2 id="theme-h">Theme</h2>
			<div class="segmented theme" role="radiogroup" aria-labelledby="theme-h">
				<label><input type="radio" name="theme" value="light" form="settings-form" defaultChecked={u.theme === 'light'} />Light</label>
				<label><input type="radio" name="theme" value="dark" form="settings-form" defaultChecked={u.theme === 'dark'} />Dark</label>
				<label><input type="radio" name="theme" value="system" form="settings-form" defaultChecked={u.theme === 'system'} />System</label>
			</div>
			<noscript><button class="btn btn-lg" form="settings-form">Save settings</button></noscript>
		</section>

		<section id="products" class="sec" aria-labelledby="products-h">
			<h2 id="products-h">Products</h2>
			<div class="group">
				<a class="row link" href="/settings/products"
					><span class="k">Saved product links</span>{#if data.products}<span class="v">{data.products}</span>{/if}<span class="chev" aria-hidden="true"
					></span></a
				>
			</div>
		</section>

		<section id="data" class="sec" aria-labelledby="data-h">
			<h2 id="data-h">Data</h2>
			<div class="group">
				<a class="row link" href="/settings/export"><span class="k">Import & export</span><span class="chev" aria-hidden="true"></span></a>
				<a class="row link" href="/settings/assistant"
					><span class="k">AI assistant</span><span class="v">{data.assistants ? `${data.assistants} connected` : 'Off'}</span><span class="chev" aria-hidden="true"
					></span></a
				>
				{#if !install.installed}
					<button
						type="button"
						class="row link"
						aria-expanded={install.available ? undefined : installHelp}
						onclick={async () => {
							if (install.available) await promptInstall();
							else installHelp = !installHelp;
						}}
					>
						<span class="k">Install app</span><span class="chev" aria-hidden="true"></span>
					</button>
				{/if}
				{#if u.isAdmin}
					<a class="row link" href="/settings/server">
						<span class="k">Server settings<span class="badge">Admin</span></span><span class="chev" aria-hidden="true"></span>
					</a>
				{/if}
			</div>
			{#if installHelp}
				<p class="hint">
					{install.ios
						? 'In Safari, tap Share, then Add to Home Screen.'
						: "Use your browser's menu and choose Install app or Add to Home screen. On iPhone, open this site in Safari first."}
				</p>
			{/if}
		</section>

		<form method="POST" action="?/signout" class="hide-desk">
			<input type="hidden" name="redirectTo" value="/signin" />
			<button class="btn signout">Sign out</button>
			{#if unsynced}<p class="unsynced status-warn">{unsynced}</p>{/if}
		</form>
		<a class="version mono" href="/settings/changelog"
			>Waterline v{data.app.version} · self-hosted · What's new{#if data.app.update}<span class="update-note"
					>{` · Update to ${data.app.update.version} available`}</span
				>{/if}</a
		>
	</div>
</div>

<style>
	.page {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.title {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}
	.sections {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.sec {
		display: flex;
		flex-direction: column;
		gap: 8px;
		scroll-margin-top: 24px;
	}
	.sec h2 {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.sub {
		margin: 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	.change {
		position: relative;
		color: var(--accent);
		font-weight: 600;
		cursor: pointer;
	}
	/* a 44px target without a taller line */
	.change::after {
		content: '';
		position: absolute;
		inset: -13px -8px;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--text-faint);
	}
	.error-text {
		margin: 0;
	}
	.banner {
		margin: 0;
	}
	.banner a {
		margin-left: 4px;
	}

	/* Grouped rows (16): label on the left, value or control on the right. */
	.group {
		display: flex;
		flex-direction: column;
		border-radius: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.row {
		position: relative;
		display: flex;
		align-items: center;
		width: 100%;
		min-height: 50px;
		padding: 0 16px;
		font-size: 16px;
		color: var(--text);
		text-align: left;
	}
	.row + .row {
		border-top: 1px solid var(--border);
	}
	.row.photo-row {
		padding-top: 14px;
		padding-bottom: 14px;
	}
	.row:first-child {
		border-radius: 15px 15px 0 0;
	}
	.row:last-child {
		border-radius: 0 0 15px 15px;
	}
	.row:only-child {
		border-radius: 15px;
	}
	.k {
		flex-shrink: 0;
		margin-right: 12px;
	}
	.v {
		margin-left: auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-muted);
	}
	.chev {
		flex-shrink: 0;
		margin-left: 5px;
		color: var(--text-muted);
	}
	.chev::before {
		content: '›';
	}
	.link .chev {
		margin-left: auto;
	}
	/* a text field that reads as the row's value */
	input.v {
		flex: 1;
		align-self: stretch;
		padding: 0;
		border: 0;
		background: transparent;
		font-size: 16px;
		text-align: right;
		outline: none;
	}
	input.v:focus {
		color: var(--text);
	}
	/* the sign-in address, used while the field is empty */
	input.v::placeholder {
		color: var(--text-faint);
	}
	.edit {
		cursor: text;
	}
	/* the row shows the value; the transparent select on top takes the tap */
	.pick select {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
		font-size: 16px;
	}
	.edit:focus-within,
	.pick:has(select:focus-visible),
	.link:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	@media (hover: hover) {
		.edit:hover,
		.pick:hover,
		.link:hover {
			background: var(--surface-hi);
			color: var(--text);
		}
	}
	.toggle {
		min-height: 56px;
		padding: 12px 16px;
		gap: 12px;
	}
	.ttext {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		cursor: pointer;
	}
	.td {
		font-size: 13px;
		color: var(--text-muted);
	}
	/* Email and Push, over each kind's two switches */
	.cols {
		min-height: 36px;
		justify-content: flex-end;
		gap: 12px;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.col {
		width: 52px;
		text-align: center;
	}
	/* the tasks calendar */
	.cal-head {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.cal-copy {
		font-weight: 600;
	}
	.cal-url {
		font-size: 13px;
	}
	.cal-for {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 15px;
	}
	.cal-for select {
		flex: 1;
	}
	.cal-acts {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.cal-off {
		color: var(--text-muted);
	}
	.cal-on {
		align-self: flex-start;
	}
	.stack {
		flex-direction: column;
		align-items: stretch;
		gap: 10px;
		padding: 14px 16px;
	}
	.segmented.sm {
		border-radius: 12px;
		background: var(--surface-2);
	}
	.segmented.sm label {
		min-height: 36px;
		border-radius: 8px;
		font-size: 14px;
	}
	/* 36px segments as drawn, 44px to tap */
	.segmented.sm label::after {
		content: '';
		position: absolute;
		inset: -4px -2px;
	}
	.segmented.theme label {
		min-height: 44px;
		font-size: 15px;
	}
	.badge {
		margin-left: 8px;
		padding: 1px 6px;
		border-radius: 5px;
		border: 1px solid var(--border-strong);
		color: var(--text-muted);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		vertical-align: 1px;
	}

	.signout {
		width: 100%;
		height: 52px;
		border-radius: 14px;
		font-size: 16px;
		color: var(--bad);
	}
	.unsynced {
		margin: 10px 0 0;
		font-size: 14px;
		font-weight: 600;
		text-align: center;
	}
	/* the running version, a link to What's new */
	.version {
		align-self: center;
		display: flex;
		align-items: center;
		min-height: 44px;
		margin: 0;
		font-size: 12px;
		color: var(--text-faint);
	}
	@media (hover: hover) {
		.version:hover {
			color: var(--text-muted);
			text-decoration: underline;
		}
	}
	.update-note {
		font-weight: 600;
		color: var(--accent);
	}

	@media (min-width: 1024px) {
		.page {
			gap: 0;
		}
		.sections {
			gap: 40px;
		}
		.sec {
			gap: 14px;
		}
		.sec h2 {
			font-size: 22px;
			letter-spacing: normal;
			text-transform: none;
			color: var(--text);
		}
		.sec-head {
			display: flex;
			flex-direction: column;
			gap: 4px;
		}
		.row {
			min-height: 52px;
			padding: 0 18px;
		}
		/* desktop: pickers open a dropdown (D9 ▾) and names edit in place */
		.pick .chev::before {
			content: '▾';
		}
		.edit .chev {
			display: none;
		}
		.toggle,
		.stack {
			padding: 14px 18px;
		}
		/* Delivery fits on one line at desktop width */
		.stack {
			flex-direction: row;
			flex-wrap: wrap;
			align-items: center;
			column-gap: 12px;
		}
		.stack .segmented {
			width: 360px;
			margin-left: auto;
		}
		.stack .hint {
			flex-basis: 100%;
			text-align: right;
		}
		.version {
			align-self: flex-start;
		}
	}
</style>
