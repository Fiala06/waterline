<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	const u = $derived(data.user);
</script>

<svelte:head><title>Settings · Waterline</title></svelte:head>

<div class="page">
	<h1>Settings</h1>
	<p class="muted note">Notifications, export and server settings arrive in later milestones.</p>

	<form method="POST" action="?/save" use:enhance class="stack">
		{#if form?.error}<p class="banner banner-bad" role="alert">✕ {form.error}</p>{/if}
		<section class="stack">
			<h2 class="caps">Profile</h2>
			<div class="field">
				<label class="label" for="displayName">Name</label>
				<input class="input" id="displayName" name="displayName" defaultValue={u.displayName} required maxlength="80" />
			</div>
			<div class="field">
				<span class="label">Email</span>
				<div class="input static">{u.email}</div>
			</div>
		</section>

		<section class="stack">
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
				<select class="input" id="timeZone" name="timeZone" value={u.timeZone}>
					{#each data.timeZones as tz (tz)}<option value={tz} selected={tz === u.timeZone}>{tz.replace(/_/g, ' ')}</option>{/each}
				</select>
			</div>
		</section>

		<section class="stack">
			<h2 class="caps">Theme</h2>
			<div class="segmented">
				<label><input type="radio" name="theme" value="light" defaultChecked={u.theme === 'light'} />Light</label>
				<label><input type="radio" name="theme" value="dark" defaultChecked={u.theme === 'dark'} />Dark</label>
				<label><input type="radio" name="theme" value="system" defaultChecked={u.theme === 'system'} />System</label>
			</div>
		</section>

		<button class="btn btn-primary btn-lg">Save settings</button>
	</form>

	<form method="POST" action="?/signout">
		<button class="btn btn-lg signout">Sign out</button>
	</form>
	<p class="faint version">Waterline v1.0 · self-hosted</p>
</div>

<style>
	.page {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-width: 600px;
	}
	h1 {
		margin: 8px 0 0;
		font-size: 28px;
		font-weight: 600;
	}
	.note {
		margin: -12px 0 0;
		font-size: 14px;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 16px;
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
	.signout {
		color: var(--bad);
		border-color: var(--bad-border);
	}
	.version {
		text-align: center;
		font-size: 13px;
		margin: 0;
	}
	@media (min-width: 1024px) {
		.page {
			padding: 28px 32px;
		}
	}
</style>
