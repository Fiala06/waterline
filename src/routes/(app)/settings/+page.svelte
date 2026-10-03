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
</script>

<script lang="ts">
	// Settings (redesign README § 15): one page of sections, each a heading over a
	// 2px ink rule and rows with 1px dividers. Changes save as they're made.
	import { enhance } from '$app/forms';
	import SectionLink from '$lib/components/SectionLink.svelte';
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
	// the desktop menu: auto-hide (a rail that opens on hover) or kept open, as the shell stores it
	function setAutoHide(auto: boolean) {
		ui.navPinned = !auto;
		try {
			localStorage.setItem(`wl_nav:${u.id}`, auto ? 'auto' : 'pinned');
		} catch {
			/* storage blocked */
		}
	}
</script>

<svelte:head><title>Settings · Waterline</title></svelte:head>

<form id="settings-form" method="POST" action="?/save" use:enhance={autosave}></form>
<form id="notify-form" method="POST" action="?/notifications" use:enhance={autosave}></form>

<div class="page sub-page" {onchange}>
	<div class="phead hide-desk">
		<span class="kicker">{[u.displayName, u.email].filter(Boolean).join(' · ')}</span>
		<h1 class="title">Settings</h1>
	</div>
	<div class="sections">
		<section id="profile" class="sec" aria-labelledby="profile-h">
			<h2 id="profile-h">Profile<SectionLink id="profile" label="Profile" /></h2>
			<div class="rows">
				<div class="row photo-row"><ProfilePhoto user={u} error={form?.photoError} /></div>
			</div>
			<div class="field">
				<label class="label" for="displayName">Name</label>
				<input
					class="input"
					id="displayName"
					name="displayName"
					form="settings-form"
					defaultValue={u.displayName}
					required
					maxlength="80"
					autocomplete="name"
					aria-invalid={!!nameError}
					aria-describedby={nameError ? 'name-error' : undefined}
				/>
				{#if nameError}<span class="error-text" id="name-error" role="alert">✕ {nameError}</span>{/if}
			</div>
			<div class="field">
				<label class="label" for="notifyEmail">Notification email</label>
				<input
					class="input"
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
				{#if emailError}<span class="error-text" id="email-error" role="alert">✕ {emailError}</span>{/if}
				<span class="hint" id="email-hint">Leave empty to use {u.email}.</span>
			</div>
		</section>

		<section id="units" class="sec" aria-labelledby="units-h">
			<h2 id="units-h">Units<SectionLink id="units" label="Units" /></h2>
			<div class="rows">
				<div class="row pick">
					<label class="k" for="unitSystem">Unit system</label>
					<select class="input" id="unitSystem" name="unitSystem" form="settings-form" bind:value={unitSystem}>
						<option value="imperial">Imperial (gal · °F · in)</option>
						<option value="metric">Metric (L · °C · cm)</option>
					</select>
				</div>
				<div class="row pick">
					<label class="k" for="hardnessUnit">Hardness</label>
					<select class="input" id="hardnessUnit" name="hardnessUnit" form="settings-form" bind:value={hardnessUnit}>
						<option value="dgh">Degrees (dGH / dKH)</option>
						<option value="ppm">ppm</option>
					</select>
				</div>
				<div class="row pick">
					<label class="k" for="currency">Currency</label>
					<select class="input" id="currency" name="currency" form="settings-form" bind:value={currency}>
						{#each CURRENCIES as c (c)}<option value={c}>{currencyName(c)}</option>{/each}
					</select>
				</div>
				<div class="row pick">
					<label class="k" for="timeZone">Time zone</label>
					<select class="input" id="timeZone" name="timeZone" form="settings-form" bind:value={timeZone}>
						{#each zones as g (g.name)}
							<optgroup label={g.name}>
								{#each g.list as z (z.id)}<option value={z.id}>{z.city}</option>{/each}
							</optgroup>
						{/each}
					</select>
				</div>
			</div>
			<p class="hint">Changing units converts how readings are shown. Stored values stay exact.</p>
		</section>

		<section id="notifications" class="sec" aria-labelledby="notifications-h">
			<div class="sec-head">
				<h2 id="notifications-h">Notifications<SectionLink id="notifications" label="Notifications" /></h2>
				<p class="meta">Sent to {p.notifyEmail || u.email} · <label class="change" for="notifyEmail">Change</label></p>
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
			<div class="rows">
				<div class="row cols kicker" aria-hidden="true"><span></span><span>Email</span><span>Push</span></div>
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
				<div class="row pick seg-row">
					<span class="k" id="delivery-k">Delivery</span>
					<div class="segmented delivery" role="radiogroup" aria-labelledby="delivery-k">
						<label><input type="radio" name="delivery" value="individual" form="notify-form" bind:group={delivery} />Each</label>
						<label><input type="radio" name="delivery" value="daily" form="notify-form" bind:group={delivery} />Daily digest</label>
						<label><input type="radio" name="delivery" value="weekly" form="notify-form" bind:group={delivery} />Weekly</label>
					</div>
				</div>
				{#if delivery !== 'individual'}
					<div class="row note-row">
						<span class="hint">{delivery === 'weekly' ? 'Weekly digests go out on Mondays. ' : ''}Digests are by email; push still sends each one on its own.</span>
					</div>
				{/if}
				<div class="row pick">
					<label class="k" for="leadDays">Remind me</label>
					<select class="input" id="leadDays" name="leadDays" form="notify-form" bind:value={leadDays}>
						{#each LEAD_OPTIONS as o (o.days)}<option value={o.days}>{o.label}</option>{/each}
					</select>
				</div>
				<div class="row pick">
					<label class="k" for="sendTime">Send at</label>
					<select class="input" id="sendTime" name="sendTime" form="notify-form" bind:value={sendTime}>
						{#each SEND_TIMES as t (t.value)}<option value={t.value}>{t.label}</option>{/each}
					</select>
				</div>
			</div>
			<p class="hint">Every email includes a link back to these settings and a one-click unsubscribe.</p>
			<noscript><button class="btn btn-lg" form="notify-form">Save notifications</button></noscript>
			<PushSettings push={data.push} timeZone={u.timeZone} {form} />
		</section>

		<section id="calendar" class="sec" aria-labelledby="calendar-h">
			<h2 id="calendar-h">Calendar<SectionLink id="calendar" label="Calendar" /></h2>
			<p class="lede">See your tasks in Google Calendar, Apple Calendar or Outlook, each on the day it's due, and kept up to date.</p>
			{#if data.calendar}
				<div class="cal card">
					<div class="field">
						<label class="label" for="cal-url">Your tasks calendar</label>
						<div class="cal-line">
							<input id="cal-url" class="input mono cal-url" readonly value={calUrl} onfocus={(e) => e.currentTarget.select()} />
							<button type="button" class="btn cal-copy" onclick={copyCal}>{calCopied ? '✓ Copied' : 'Copy'}<span class="sr-only"> the calendar link</span></button>
						</div>
					</div>
					{#if data.calendarTanks.length > 1}
						<div class="field cal-for">
							<label class="label" for="cal-for">For</label>
							<select id="cal-for" class="input" bind:value={calTank}>
								<option value="">All tanks</option>
								{#each data.calendarTanks as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
							</select>
						</div>
					{/if}
					<div class="cal-acts">
						<a class="btn" href={calUrl.replace(/^https?:/, 'webcal:')}>Open in my calendar app</a>
						<form method="POST" action="?/calendarNew" use:enhance><button class="btn-text">Make a new link</button></form>
						<form method="POST" action="?/calendarOff" use:enhance><button class="btn-text cal-off">Turn off</button></form>
					</div>
					<p class="hint">
						In Google Calendar, choose Other calendars › From URL and paste the link. Apple Calendar and Outlook open it from Open in my calendar app. Calendars check
						for changes every few hours{data.calendar.lastFetchedAt ? `; yours last checked ${fmtWhen(data.calendar.lastFetchedAt, u.timeZone)}` : ''}. Anyone with the
						link can see your tasks, so keep it private.
					</p>
				</div>
			{:else}
				<form method="POST" action="?/calendarOn" use:enhance><button class="btn btn-primary cal-on">Make a calendar link</button></form>
			{/if}
		</section>

		<section id="theme" class="sec" aria-labelledby="theme-h">
			<h2 id="theme-h">Appearance<SectionLink id="theme" label="Appearance" /></h2>
			<div class="rows">
				<div class="row pick seg-row">
					<span class="k" id="theme-k">Theme</span>
					<div class="segmented theme" role="radiogroup" aria-labelledby="theme-k">
						<label><input type="radio" name="theme" value="light" form="settings-form" defaultChecked={u.theme === 'light'} />Light</label>
						<label><input type="radio" name="theme" value="dark" form="settings-form" defaultChecked={u.theme === 'dark'} />Dark</label>
						<label><input type="radio" name="theme" value="system" form="settings-form" defaultChecked={u.theme === 'system'} />System</label>
					</div>
				</div>
				<div class="row toggle hide-phone">
					<label class="ttext" for="nav-auto"
						><span class="tt">Auto-hide the side menu</span><span class="td">Shrinks to icons and opens on hover. Press [ anywhere to switch.</span></label
					>
					<span class="switch">
						<input id="nav-auto" type="checkbox" checked={ui.navPinned === false} onchange={(e) => setAutoHide(e.currentTarget.checked)} />
						<span></span>
					</span>
				</div>
			</div>
			<noscript><button class="btn btn-lg" form="settings-form">Save settings</button></noscript>
		</section>

		<section id="products" class="sec" aria-labelledby="products-h">
			<h2 id="products-h">Products<SectionLink id="products" label="Products" /></h2>
			<div class="rows">
				<a class="row link" href="/settings/products">
					<span class="ttext"><span class="tt">Saved product links</span><span class="td">Fertilizers, conditioner and food you buy again, one tap to reorder</span></span>
					{#if data.products}<span class="v">{data.products}</span>{/if}<span class="chev" aria-hidden="true">›</span>
				</a>
				<a class="row link" href="/settings/test-kits">
					<span class="ttext"><span class="tt">Test kits</span><span class="td">Each test's steps and waits, run with a timer on the water test form</span></span>
					{#if data.kits}<span class="v">{data.kits}</span>{/if}<span class="chev" aria-hidden="true">›</span>
				</a>
			</div>
		</section>

		<section id="data" class="sec" aria-labelledby="data-h">
			<h2 id="data-h">Data<SectionLink id="data" label="Data" /></h2>
			<div class="rows">
				<a class="row link" href="/settings/export">
					<span class="ttext"><span class="tt">Import & export</span><span class="td">A full backup, CSV, a summary to share, or a spreadsheet in</span></span>
					<span class="chev" aria-hidden="true">›</span>
				</a>
				<a class="row link" href="/settings/assistant">
					<!-- the name reads "AI assistant Off": the state follows the title -->
					<span class="ttext"><span class="tt">AI assistant</span></span>
					<span class="v">{data.assistants ? `${data.assistants} connected` : 'Off'}</span><span class="chev" aria-hidden="true">›</span>
				</a>
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
						<span class="ttext"><span class="tt">Install app</span><span class="td">Opens full screen, works offline at the tank</span></span>
						<span class="chev" aria-hidden="true">›</span>
					</button>
				{/if}
				{#if u.isAdmin}
					<a class="row link" href="/settings/server">
						<span class="ttext"><span class="tt">Server settings<span class="tag tag-outline admin">ADMIN</span></span><span class="td">Sign-in, email, public pages, features and logs</span></span>
						<span class="chev" aria-hidden="true">›</span>
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

		<section id="account" class="sec" aria-labelledby="account-h">
			<h2 id="account-h">Account<SectionLink id="account" label="Account" /></h2>
			<div class="rows">
				<form method="POST" action="?/signout" class="row toggle">
					<input type="hidden" name="redirectTo" value="/signin" />
					<span class="ttext"><span class="tt">Sign out</span><span class="td">Clears this device. Entries still waiting to sync may be lost.</span></span>
					<button class="btn signout">Sign out</button>
				</form>
				{#if unsynced}<p class="row unsynced status-warn">{unsynced}</p>{/if}
				<div class="row toggle hide-phone">
					<span class="ttext"><span class="tt">Keyboard shortcuts</span><span class="td">Press ? anywhere to see them</span></span>
					<button type="button" class="btn" onclick={() => (ui.keys = true)}>Show shortcuts</button>
				</div>
				<div class="row toggle">
					<a class="version" href="/settings/changelog"
						>Waterline v{data.app.version} · self-hosted · What's new{#if data.app.update}<span class="status-bad"
								>{` · Update to ${data.app.update.version} available`}</span
							>{/if}</a
					>
				</div>
			</div>
		</section>
	</div>
</div>

<style>
	.page {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.phead {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding-bottom: 12px;
		border-bottom: 2px solid var(--divider);
	}
	.title {
		margin: 0;
		font-size: 28px;
	}
	.sections {
		display: flex;
		flex-direction: column;
		gap: 36px;
	}
	.sec {
		display: flex;
		flex-direction: column;
		gap: 14px;
		scroll-margin-top: 24px;
	}
	.sec h2 {
		margin: 0;
		font-size: 22px;
	}
	.sec-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}
	.meta,
	.lede {
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
	}
	.lede {
		font-size: 14px;
		color: var(--text);
		max-width: 620px;
	}
	.change {
		position: relative;
		color: var(--accent-text);
		font-weight: 800;
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
		color: var(--text-muted);
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

	/* Rows under a 2px ink rule, 1px dividers between them */
	.rows {
		display: flex;
		flex-direction: column;
		border-top: 2px solid var(--ink);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 14px;
		width: 100%;
		min-height: 52px;
		padding: 8px 0;
		margin: 0;
		border-bottom: 1px solid var(--divider);
		color: var(--text);
		font-size: 15px;
		text-align: left;
	}
	.row.photo-row {
		padding: 14px 0;
	}
	/* a label, then its control */
	.pick {
		display: grid;
		grid-template-columns: 140px minmax(0, 1fr);
		gap: 12px;
	}
	.pick .k {
		font-size: 15px;
	}
	.pick select.input {
		max-width: 360px;
	}
	.seg-row .segmented {
		justify-self: start;
		max-width: 100%;
	}
	.segmented.delivery label,
	.segmented.theme label {
		min-height: 40px;
		min-width: 84px;
		padding: 0 12px;
		font-size: 14px;
	}
	.note-row {
		min-height: 0;
	}
	.toggle {
		padding: 12px 0;
	}
	.ttext {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	label.ttext {
		cursor: pointer;
	}
	.tt {
		font-size: 15px;
		font-weight: 600;
	}
	.td {
		font-size: 13px;
		color: var(--text-muted);
	}
	/* Email and Push, over each kind's two switches */
	.cols {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 44px 44px;
		gap: 14px;
		min-height: 36px;
	}
	.link {
		cursor: pointer;
	}
	.link .v {
		font-size: 13px;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.chev {
		font-size: 18px;
		color: var(--neutral-600);
	}
	.admin {
		margin-left: 8px;
		font-size: 10px;
		font-weight: 800;
		vertical-align: 2px;
	}
	.link:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	@media (hover: hover) {
		.link:hover {
			background: var(--surface);
			color: var(--text);
		}
	}
	/* the tasks calendar */
	.cal {
		padding-top: 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.cal-line {
		display: flex;
		gap: 8px;
	}
	.cal-url {
		font-size: 13px;
	}
	.cal-copy {
		flex-shrink: 0;
	}
	.cal-for select {
		max-width: 280px;
	}
	.cal-acts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 10px;
	}
	.cal-off {
		color: var(--text-muted);
	}
	.cal-on {
		align-self: flex-start;
	}
	.signout {
		color: var(--accent-700);
	}
	.unsynced {
		font-size: 14px;
	}

	/* phones: a segmented control gets the row to itself, under its label */
	@media (max-width: 1023px) {
		.seg-row {
			grid-template-columns: 1fr;
			gap: 8px;
		}
		.seg-row .segmented {
			width: 100%;
		}
	}
	@media (min-width: 1024px) {
		.page {
			gap: 0;
		}
		.sections {
			gap: 40px;
		}
		.pick {
			grid-template-columns: 200px minmax(0, 1fr);
			gap: 16px;
		}
		.cols {
			grid-template-columns: minmax(0, 1fr) 44px 44px;
		}
	}
	.version {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px;
		font-weight: 700;
		color: var(--text);
	}
	.version:hover {
		color: var(--accent-text);
	}
</style>
