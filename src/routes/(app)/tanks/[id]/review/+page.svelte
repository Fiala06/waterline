<script lang="ts">
	// Review tank setup (#30): the four parts, each with ✓ Still right and Edit,
	// and All still right at the end. Every button is a form, so it works
	// without scripts too.
	import { enhance } from '$app/forms';

	let { data } = $props();

	const edit: Record<string, string> = $derived({
		details: `/tanks/${data.tank.id}/settings?from=review`,
		equipment: `/tanks/${data.tank.id}/equipment`,
		targets: `/tanks/${data.tank.id}/targets?from=review`,
		livestock: `/tanks/${data.tank.id}/livestock`
	});
	const left = $derived(data.sections.filter((s) => !s.checked).length);
	// keep the page where it is after a ✓ (its section moves on to "Checked")
	const stay = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
</script>

<svelte:head><title>Review tank setup · {data.tank.name}</title></svelte:head>

<div class="wrap">
	<div class="top">
		<!-- on desktop the header has "Tanks › {tank} › Review tank setup" -->
		<a class="back hide-desk" href="/tanks/{data.tank.id}">‹ {data.tank.name}</a>
		<h1 class="hide-desk">Review tank setup</h1>
		<p class="intro">
			Is this still right? Light timers move, heaters get swapped and fish get rehomed, and Waterline only knows what it's told. Check each part, or fix it here.
		</p>
		<p class="when muted">
			{data.lastReview ? `Last reviewed ${data.lastReview}.` : 'Not reviewed yet.'}
			{#if data.task}Comes up {data.task.every}.{:else}It's off, so it won't come up on its own: <a href="/tanks/{data.tank.id}/settings#review">turn it on</a>.{/if}
		</p>
	</div>

	{#each data.sections as s (s.key)}
		<section class="card part" id={s.key} aria-labelledby="{s.key}-h">
			<div class="head">
				<h2 id="{s.key}-h">{s.label}</h2>
				<span class="state" class:status-ok={s.checked} class:muted={!s.checked}>
					{#if s.checked}✓ Checked {s.checkedOn}{:else if s.checkedOn}– Last checked {s.checkedOn}{:else}– Not checked yet{/if}
				</span>
			</div>
			{#if s.changed}<p class="changed muted">Changed since {data.lastReview ? 'the last review' : 'the tank was added'}: see <a href="/history">History</a>.</p>{/if}

			{#if s.key === 'details'}
				<dl class="facts">
					{#each data.details as [k, v] (k)}
						<div><dt>{k}</dt><dd class:faint={!v}>{v ?? 'Not set'}</dd></div>
					{/each}
				</dl>
			{:else if s.key === 'equipment'}
				{#if data.equipment.length}
					<ul class="items">
						{#each data.equipment as e (e.id)}
							<li>
								<a class="it-text" href="/tanks/{data.tank.id}/equipment/{e.id}">
									<span class="it-name">{e.name}</span>
									<span class="it-meta muted">{[e.type, e.installed && `Installed ${e.installed}`, e.serviced && `Serviced ${e.serviced}`].filter(Boolean).join(' · ')}</span>
									{#if e.flag}<span class="it-flag status-warn">{e.flag}</span>{/if}
								</a>
								{#if !e.serviceable}<span class="chev" aria-hidden="true">›</span>{/if}
								{#if e.serviceable}
									<form method="POST" action="?/serviced" use:enhance={stay}>
										<input type="hidden" name="equipmentId" value={e.id} />
										<button class="btn sm-btn" aria-label="{e.name} serviced today">Serviced today</button>
									</form>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="none muted">No equipment listed. A filter, a heater and a light are a good start.</p>
				{/if}
			{:else if s.key === 'targets'}
				{#if data.targets.length}
					<dl class="facts">
						{#each data.targets as t (t.name)}
							<div><dt>{t.name}</dt><dd class:faint={!t.range}>{t.range ?? 'No range set'}</dd></div>
						{/each}
					</dl>
				{:else}
					<p class="none muted">No parameters tracked.</p>
				{/if}
			{:else}
				{#if data.livestock.length}
					<ul class="items">
						{#each data.livestock as l (l.id)}
							<li>
								<a class="it-text" href="/tanks/{data.tank.id}/livestock/{l.id}">
									<span class="it-name">{l.name}{l.count > 1 ? ` × ${l.count}` : ''}</span>
									{#if l.quarantine}<span class="it-meta muted">In quarantine</span>{/if}
								</a>
								<span class="chev" aria-hidden="true">›</span>
							</li>
						{/each}
					</ul>
				{/if}
				{#if data.plants.length}
					<p class="plants"><span class="muted">Plants:</span> {data.plants.map((p) => p.name).join(', ')}</p>
				{/if}
				{#if !data.livestock.length && !data.plants.length}<p class="none muted">No livestock or plants listed.</p>{/if}
			{/if}

			<div class="acts">
				{#if !s.checked}
					<form method="POST" action="?/check" use:enhance={stay}>
						<input type="hidden" name="section" value={s.key} />
						<button class="btn" aria-label="{s.label} still right">✓ Still right</button>
					</form>
				{/if}
				<a class="btn" href={edit[s.key]} aria-label="Edit {s.label.toLowerCase()}">Edit</a>
			</div>
		</section>
	{/each}

	<form method="POST" action="?/finish" class="finish">
		<button class="btn btn-primary btn-lg">All still right</button>
		<p class="muted sm">
			{left ? (left === 1 ? 'The part not checked yet counts as checked.' : `The ${left} parts not checked yet count as checked.`) : 'Every part is checked.'}
			{#if data.task}The next review comes up {data.task.every}.{/if}
		</p>
	</form>
</div>

<style>
	.wrap {
		max-width: 640px;
		padding: 0 20px calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.top {
		padding: 8px 0 4px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}
	.intro {
		margin: 8px 0 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.when {
		margin: 0;
		font-size: 13px;
	}
	.when a {
		color: var(--accent);
	}
	.part {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		scroll-margin-top: 80px;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}
	h2 {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
	}
	.state {
		font-size: 13px;
		font-weight: 600;
	}
	.changed {
		margin: -6px 0 0;
		font-size: 13px;
	}
	.facts {
		margin: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 8px 16px;
	}
	.facts div {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	dt {
		font-size: 12px;
		color: var(--text-muted);
	}
	dd {
		margin: 0;
		font-size: 15px;
		font-weight: 500;
		overflow-wrap: anywhere;
	}
	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.items li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 0;
	}
	.items li + li {
		border-top: 1px solid var(--border);
	}
	.it-text {
		flex: 1;
		min-width: 0;
		min-height: 44px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 2px;
		color: inherit;
		text-decoration: none;
	}
	.it-name {
		font-size: 15px;
		font-weight: 600;
	}
	.it-meta,
	.it-flag {
		font-size: 13px;
	}
	.it-flag {
		font-weight: 600;
	}
	.chev {
		flex: none;
		font-size: 20px;
		color: var(--text-faint);
		padding: 0 4px;
	}
	.changed a {
		color: var(--accent);
	}
	.sm-btn {
		flex: none;
		font-size: 14px;
	}
	.plants {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
	}
	.none {
		margin: 0;
		font-size: 14px;
	}
	.acts {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.acts form {
		display: contents;
	}
	.acts .btn {
		flex: 1;
	}
	.finish {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 4px;
	}
	.finish p {
		margin: 0;
		text-align: center;
	}
	.sm {
		font-size: 13px;
	}
	@media (min-width: 1024px) {
		.wrap {
			padding-top: 8px;
		}
		.acts .btn {
			flex: none;
			min-width: 140px;
		}
		.finish {
			flex-direction: row;
			align-items: center;
			gap: 16px;
		}
		.finish .btn-lg {
			width: auto;
			height: 48px;
			padding: 0 28px;
			font-size: 16px;
			border-radius: 12px;
		}
		.finish p {
			text-align: left;
		}
	}
</style>
