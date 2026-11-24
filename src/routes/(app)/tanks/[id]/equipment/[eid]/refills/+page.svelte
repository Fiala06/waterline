<script lang="ts">
	// Cylinder refills (#368): when the CO₂ cylinder was last refilled, how long
	// a fill lasts, a form to log a refill, the alert, and the refills logged.
	import { enhance } from '$app/forms';
	import DateField from '$lib/components/DateField.svelte';
	import { busyEnhance, refusal } from '$lib/forms';
	let { data, form } = $props();
	let busy = $state(false);
	const refused = $derived(refusal(form, 'refill'));
	const back = $derived(`/tanks/${data.item.tankId}/equipment/${data.item.id}`);
	const ago = (days: number) => (days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`);
</script>

<svelte:head><title>Cylinder refills · {data.item.name}</title></svelte:head>

<div class="page">
	<!-- phones; on desktop the header has the title -->
	<div class="bar hide-desk">
		<a class="cancel" href={back}>Back</a>
		<h1>Cylinder refills</h1>
		<span aria-hidden="true"></span>
	</div>
	<div class="body">
		<p class="lede">{data.item.name}{#if data.item.cylinder}<span class="size">{` · ${data.item.cylinder} cylinder`}</span>{/if}</p>

		<section aria-labelledby="cyl-h">
			<h2 class="kicker" id="cyl-h">Cylinder</h2>
			{#if data.stats}
				<div class="row"><span class="k">Last refilled</span><span class="v">{data.stats.last} · {ago(data.stats.ago)}</span></div>
				{#if data.stats.fill}
					<div class="row"><span class="k">How long</span><span class="v fill">{data.stats.fill}</span></div>
				{/if}
				{#if data.stats.due}
					<div class="row"><span class="k">Next</span><span class="v status-{data.stats.due.level}">{data.stats.due.text}</span></div>
				{:else}
					<p class="hint pad">Log the next refill too, and Waterline works out how long a fill lasts.</p>
				{/if}
			{:else}
				<p class="hint pad">No refill logged yet. Log each refill, and from the second one Waterline works out how long a fill lasts.</p>
			{/if}
		</section>

		{#if data.canLog}
			<form method="POST" action="?/refill" class="log-form" use:enhance={busyEnhance((b) => (busy = b))}>
				<h2 class="kicker">Log a refill</h2>
				<div class="field">
					<label class="label" for="refill-day">Refilled on</label>
					<DateField name="day" id="refill-day" value={String(refused.values.day ?? data.today)} label="Refilled on" today={data.today} max={data.today} invalid={!!refused.errors.day} />
					{#if refused.errors.day}<span class="error-text" role="alert">✕ {refused.errors.day}</span>{/if}
				</div>
				{#if data.canSpend}
					<div class="field">
						<label class="label" for="refill-cost">Cost · optional</label>
						<div class="unit-input cost">
							<input id="refill-cost" name="cost" inputmode="decimal" autocomplete="off" placeholder="12.50" value={String(refused.values.cost ?? '')} aria-invalid={!!refused.errors.cost} />
							<span class="unit">{data.currency}</span>
						</div>
						{#if refused.errors.cost}<span class="error-text" role="alert">✕ {refused.errors.cost}</span>{:else}<span class="hint">Added to Spending as a consumable, linked to this item.</span>{/if}
					</div>
				{/if}
				<div class="field">
					<label class="label" for="refill-note">Note · optional</label>
					<input class="input" id="refill-note" name="note" maxlength="500" autocomplete="off" placeholder="Where you had it filled, the pressure before" value={String(refused.values.note ?? '')} />
				</div>
				<button class="btn btn-primary btn-lg" disabled={busy}>Log refill</button>
			</form>

			<form method="POST" action="?/alert" class="alert-form" use:enhance>
				<h2 class="kicker">Alert</h2>
				<label class="check-row">
					<input type="checkbox" name="alert" checked={data.item.alert} />
					<span>Tell me under Alerts when the cylinder is likely running low</span>
				</label>
				<span class="hint">From the second refill on, about two weeks before a fill usually runs out (sooner for a short fill), until you log the next refill.</span>
				<button class="btn">Save</button>
			</form>
		{/if}

		<section aria-labelledby="refills-h">
			<h2 class="kicker" id="refills-h">Refills · {data.refills.length}</h2>
			{#each data.refills as r (r.id)}
				<a class="refill" href="/entries/event/{r.id}">
					<span class="top"><b>{r.day}</b>{#if r.lasted}<span class="lasted">{r.lasted}</span>{/if}</span>
					{#if r.note}<span class="note">{r.note}</span>{/if}
				</a>
			{/each}
			{#if !data.refills.length}
				<p class="hint pad">Nothing here yet.</p>
			{:else}
				<p class="hint pad">Each refill is an entry in History. Open one to delete it.</p>
			{/if}
		</section>
	</div>
</div>

<style>
	.page {
		max-width: 560px;
	}
	.bar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		padding: 8px 20px;
	}
	.cancel {
		font-size: 15px;
		color: var(--text-muted);
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-self: start;
	}
	h1 {
		margin: 0;
		font-size: 17px;
		font-weight: 800;
	}
	.body {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 28px;
	}
	.lede {
		margin: 0;
		font-size: 20px;
		font-weight: 800;
	}
	.size {
		font-weight: 500;
		color: var(--text-muted);
	}
	section,
	form {
		display: flex;
		flex-direction: column;
	}
	form {
		gap: 16px;
	}
	.kicker {
		margin: 0;
		padding-bottom: 8px;
		border-bottom: 2px solid var(--ink);
		color: var(--text);
	}
	form .kicker {
		margin-bottom: -4px;
	}
	.row {
		display: grid;
		grid-template-columns: 104px minmax(0, 1fr);
		gap: 12px;
		min-height: 44px;
		padding: 8px 0;
		align-items: center;
		border-bottom: 1px solid var(--divider);
		font-size: 15px;
	}
	.k {
		font-size: 13px;
		color: var(--text-muted);
	}
	.v {
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.fill::first-letter {
		text-transform: uppercase;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.cost {
		max-width: 200px;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.pad {
		padding: 10px 0;
	}
	.alert-form .btn {
		align-self: flex-start;
	}
	.refill {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 2px;
		min-height: 44px;
		padding: 9px 0;
		border-bottom: 1px solid var(--divider);
		font-size: 15px;
		color: var(--text);
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
	}
	.top b {
		font-weight: 700;
	}
	.lasted,
	.note {
		font-size: 13px;
		color: var(--text-2);
	}
	.lasted {
		text-align: right;
	}
	@media (hover: hover) {
		.refill:hover b {
			color: var(--accent-text);
		}
	}
	@media (min-width: 1024px) {
		.page {
			max-width: 880px;
			padding: 24px 32px 48px;
		}
		.body {
			padding: 0;
			max-width: 560px;
		}
	}
</style>
