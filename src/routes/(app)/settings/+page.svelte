<script lang="ts">
	import { enhance } from '$app/forms';
	import { LEAD_OPTIONS, SEND_TIMES } from '$lib/notify-options';
	let { data, form } = $props();
	const u = $derived(data.user);
	const p = $derived(data.prefs);

	const sections = [
		{ id: 'profile', label: 'Profile' },
		{ id: 'units', label: 'Units' },
		{ id: 'notifications', label: 'Notifications' },
		{ id: 'theme', label: 'Theme' },
		{ id: 'data', label: 'Export', href: '/settings/export' }
	];
	const unsubscribedOn = $derived(
		p.unsubscribedAt
			? new Date(p.unsubscribedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: u.timeZone })
			: null
	);
</script>

<svelte:head><title>Settings · Waterline</title></svelte:head>

<div class="page">
	<h1>Settings</h1>
	<div class="layout">
		<nav class="side" aria-label="Settings sections">
			{#each sections as s (s.id)}<a href={'href' in s ? s.href : `#${s.id}`}>{s.label}</a>{/each}
			{#if u.isAdmin}<a href="/settings/server" class="admin">Server <span class="badge">Admin</span></a>{/if}
			<form method="POST" action="?/signout"><button class="signout-link">Sign out</button></form>
		</nav>

		<div class="content">
			<form method="POST" action="?/save" use:enhance class="stack">
				{#if form?.error}<p class="banner banner-bad" role="alert">✕ {form.error}</p>{/if}
				<section id="profile" class="stack">
					<h2 class="caps">Profile</h2>
					<div class="field">
						<label class="label" for="displayName">Name</label>
						<input class="input" id="displayName" name="displayName" defaultValue={u.displayName} required maxlength="80" />
					</div>
					<div class="field">
						<span class="label">Signed in as</span>
						<div class="input static">{u.email}</div>
					</div>
				</section>

				<section id="units" class="stack">
					<h2 class="caps">Units</h2>
					<fieldset class="field">
						<legend class="label">Unit system</legend>
						<div class="segmented">
							<label><input type="radio" name="unitSystem" value="imperial" defaultChecked={u.unitSystem === 'imperial'} />Imperial<small>gal · °F · in</small></label>
							<label><input type="radio" name="unitSystem" value="metric" defaultChecked={u.unitSystem === 'metric'} />Metric<small>L · °C · cm</small></label>
						</div>
					</fieldset>
					<fieldset class="field">
						<legend class="label">Hardness</legend>
						<div class="segmented">
							<label><input type="radio" name="hardnessUnit" value="dgh" defaultChecked={u.hardnessUnit === 'dgh'} />dGH / dKH</label>
							<label><input type="radio" name="hardnessUnit" value="ppm" defaultChecked={u.hardnessUnit === 'ppm'} />ppm</label>
						</div>
					</fieldset>
					<div class="field">
						<label class="label" for="timeZone">Time zone</label>
						<select class="input" id="timeZone" name="timeZone">
							{#each data.timeZones as tz (tz)}<option value={tz} selected={tz === u.timeZone}>{tz.replace(/_/g, ' ')}</option>{/each}
						</select>
					</div>
				</section>

				<section id="theme" class="stack">
					<h2 class="caps">Theme</h2>
					<div class="segmented">
						<label><input type="radio" name="theme" value="light" defaultChecked={u.theme === 'light'} />Light</label>
						<label><input type="radio" name="theme" value="dark" defaultChecked={u.theme === 'dark'} />Dark</label>
						<label><input type="radio" name="theme" value="system" defaultChecked={u.theme === 'system'} />System</label>
					</div>
				</section>

				<button class="btn btn-primary btn-lg">Save settings</button>
			</form>

			<form method="POST" action="?/notifications" use:enhance class="stack" id="notifications">
				<h2 class="caps">Notifications</h2>
				{#if !data.emailReady}
					<p class="banner banner-bad">
						Email isn't set up on this server yet{u.isAdmin ? '.' : ', so nothing will be sent. Ask the server owner to set it up.'}
						{#if u.isAdmin}<a href="/settings/server">Set up email delivery ›</a>{/if}
					</p>
				{/if}
				{#if unsubscribedOn}
					<p class="banner banner-bad">You unsubscribed from all emails on {unsubscribedOn}. Turn any of these on and save to start again.</p>
				{/if}
				<div class="field">
					<label class="label" for="notifyEmail">Send to</label>
					<input class="input" id="notifyEmail" name="notifyEmail" type="email" defaultValue={p.notifyEmail} placeholder={u.email} autocomplete="email" />
					<span class="hint">Leave empty to use {u.email}.</span>
					{#if form?.notifyError}<span class="error-text">✕ {form.notifyError}</span>{/if}
				</div>

				<div class="card toggles">
					{#each [{ k: 'taskReminders', t: 'Task reminders', d: 'Before a task is due' }, { k: 'overdueAlerts', t: 'Overdue alerts', d: 'When a task passes its due date' }, { k: 'outOfRangeAlerts', t: 'Out-of-range alerts', d: 'When a logged reading is outside its target' }] as row (row.k)}
						<div class="trow">
							<label for="n-{row.k}" class="ttext"><span class="tt">{row.t}</span><span class="td">{row.d}</span></label>
							<span class="switch">
								<input id="n-{row.k}" type="checkbox" name={row.k} defaultChecked={!p.unsubscribedAt && p[row.k as 'taskReminders']} />
								<span></span>
							</span>
						</div>
					{/each}
				</div>

				<fieldset class="field">
					<legend class="label">Delivery</legend>
					<div class="segmented">
						<label><input type="radio" name="delivery" value="individual" defaultChecked={p.delivery === 'individual'} />Each</label>
						<label><input type="radio" name="delivery" value="daily" defaultChecked={p.delivery === 'daily'} />Daily digest</label>
						<label><input type="radio" name="delivery" value="weekly" defaultChecked={p.delivery === 'weekly'} />Weekly</label>
					</div>
					<span class="hint">Weekly digests go out on Mondays.</span>
				</fieldset>

				<div class="pair">
					<div class="field">
						<label class="label" for="leadDays">Remind me</label>
						<select class="input" id="leadDays" name="leadDays">
							{#each LEAD_OPTIONS as o (o.days)}<option value={o.days} selected={o.days === p.leadDays}>{o.label}</option>{/each}
						</select>
					</div>
					<div class="field">
						<label class="label" for="sendTime">Send at</label>
						<select class="input" id="sendTime" name="sendTime">
							{#each SEND_TIMES as t (t.value)}<option value={t.value} selected={t.value === p.sendTime}>{t.label}</option>{/each}
						</select>
					</div>
				</div>
				<p class="hint">Every email includes a link back to these settings and a one-click unsubscribe.</p>
				<button class="btn btn-lg">Save notifications</button>
			</form>

			<section id="data" class="stack">
				<h2 class="caps">Data</h2>
				<a class="card row-link" href="/settings/export"><span>Export data</span><span aria-hidden="true">›</span></a>
				{#if u.isAdmin}
					<a class="card row-link" href="/settings/server"><span>Server settings <span class="badge">Admin</span></span><span aria-hidden="true">›</span></a>
				{/if}
			</section>

			<form method="POST" action="?/signout" class="phone-only">
				<button class="btn btn-lg signout">Sign out</button>
			</form>
			<p class="faint version">Waterline v1.0 · self-hosted</p>
		</div>
	</div>
</div>

<style>
	.page {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	h1 {
		margin: 8px 0 0;
		font-size: 28px;
		font-weight: 600;
	}
	.side {
		display: none;
	}
	.content {
		display: flex;
		flex-direction: column;
		gap: 32px;
		max-width: 600px;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 16px;
		scroll-margin-top: 24px;
	}
	.caps {
		margin: 0;
		font-size: 13px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
		font-weight: 600;
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
	}
	legend {
		padding: 0;
		margin-bottom: 8px;
	}
	.static {
		display: flex;
		align-items: center;
		color: var(--text-muted);
		background: var(--surface-2);
	}
	.hint {
		font-size: 13px;
		color: var(--text-faint);
		margin: 0;
	}
	.toggles {
		display: flex;
		flex-direction: column;
	}
	.trow {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px;
	}
	.trow + .trow {
		border-top: 1px solid var(--border);
	}
	.ttext {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		cursor: pointer;
	}
	.tt {
		font-size: 16px;
		font-weight: 600;
	}
	.td {
		font-size: 13px;
		color: var(--text-muted);
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.row-link {
		padding: 16px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		color: var(--text);
		font-size: 15px;
	}
	.badge {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 2px 6px;
		border-radius: 6px;
		background: var(--selected);
		color: var(--accent);
		margin-left: 6px;
	}
	.signout {
		color: var(--bad);
		border-color: var(--bad-border);
	}
	.version {
		text-align: center;
		font-size: 13px;
		margin: 0;
	}
	.banner a {
		margin-left: 4px;
	}

	@media (min-width: 1024px) {
		.page {
			padding: 28px 32px;
		}
		.layout {
			display: grid;
			grid-template-columns: 200px minmax(0, 600px);
			gap: 32px;
			align-items: start;
		}
		.side {
			display: flex;
			flex-direction: column;
			gap: 2px;
			position: sticky;
			top: 24px;
		}
		.side a,
		.signout-link {
			height: 40px;
			padding: 0 12px;
			border-radius: 10px;
			display: flex;
			align-items: center;
			color: var(--text-2);
			font-size: 15px;
			width: 100%;
			text-align: left;
		}
		.side a:hover,
		.signout-link:hover {
			background: var(--surface);
		}
		.signout-link {
			color: var(--bad);
			margin-top: 12px;
		}
		.phone-only {
			display: none;
		}
	}
</style>
