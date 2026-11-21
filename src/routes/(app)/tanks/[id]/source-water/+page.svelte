<script lang="ts">
	// Source water (#315): the tank's tap, well, RO or mix, each with its latest
	// test beside the tank's latest readings and targets. A source's readings are
	// never the tank's: no status, no alerts, not on shared pages.
	import { enhance } from '$app/forms';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import { refusal, keepValues } from '$lib/forms';
	let { data, form } = $props();
	const add = $derived(refusal(form, 'add'));
	const base = $derived(`/tanks/${data.tank.id}/source-water`);
</script>

<svelte:head><title>Source water · {data.tank.name}</title></svelte:head>

<div class="page">
	<div class="bar hide-desk">
		<a class="back" href="/tanks/{data.tank.id}/settings">‹ Tank setup</a>
		<h1>Source water</h1>
	</div>
	<p class="lede">
		Test the water you use for water changes, your tap, well, RO or a remineralized mix, and see it beside the tank's own readings. Source tests stay here: they aren't the tank's
		readings, don't raise alerts and aren't on shared pages.
	</p>

	{#each data.sources as s (s.id)}
		{@const edit = refusal(form, `edit-${s.id}`)}
		<section class="source" aria-labelledby="src-{s.id}">
			<div class="head">
				<div>
					<h2 id="src-{s.id}">{s.name}</h2>
					<span class="meta">{s.kindLabel} · {s.tested}</span>
				</div>
				<a class="btn btn-primary" href="{base}/{s.id}/test">Log a test</a>
			</div>
			{#if s.note}<p class="note">{s.note}</p>{/if}
			{#if s.rows.length}
				<table class="compare">
					<caption class="sr-only">{s.name} beside {data.tank.name}</caption>
					<thead>
						<tr><th scope="col">Parameter</th><th scope="col">{s.name}</th><th scope="col">Tank now</th><th scope="col">Tank target</th></tr>
					</thead>
					<tbody>
						{#each s.rows as r (r.id)}
							<tr>
								<th scope="row">{r.name}{#if r.unit}<span class="unit">{` · ${r.unit}`}</span>{/if}</th>
								<td class="num">
									{r.source}
									{#if r.outside}<span class="flag">▲ Outside tank target</span>{/if}
									{#if r.sourceDay}<span class="when">{r.sourceDay}</span>{/if}
								</td>
								<td class="num">{r.tank}</td>
								<td class="num">{r.target}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="none">No readings yet. Log a test to see {s.name} beside the tank.</p>
			{/if}
			{#if s.tests.length}
				<details class="tests">
					<summary class="btn-text">Tests · {s.tests.length}</summary>
					<ul>
						{#each s.tests as t (t.id)}
							<li>
								<span>{t.day} · {t.count} reading{t.count === 1 ? '' : 's'}{t.note ? ` · ${t.note}` : ''}</span>
								<form method="POST" action="?/deleteTest" use:enhance>
									<input type="hidden" name="id" value={t.id} />
									<button class="btn-text" aria-label="Delete the test of {t.day}">Delete</button>
								</form>
							</li>
						{/each}
					</ul>
				</details>
			{/if}
			<details class="tests" open={!!edit.message}>
				<summary class="btn-text">Edit source</summary>
				<form class="src-form" method="POST" action="?/edit" use:enhance={keepValues}>
					<input type="hidden" name="id" value={s.id} />
					<div class="field">
						<label class="label" for="name-{s.id}">Name</label>
						<input class="input" id="name-{s.id}" name="name" maxlength="60" defaultValue={s.name} />
					</div>
					<div class="field">
						<label class="label" for="kind-{s.id}">Kind</label>
						<select class="input" id="kind-{s.id}" name="kind">
							{#each data.kinds as k (k.value)}<option value={k.value} selected={k.value === s.kind}>{k.label}</option>{/each}
						</select>
					</div>
					<div class="field wide">
						<label class="label" for="note-{s.id}">Note · optional</label>
						<input class="input" id="note-{s.id}" name="note" maxlength="500" defaultValue={s.note ?? ''} placeholder="Treated with chloramine; softener on" />
					</div>
					{#if edit.message}<p class="error-text wide" role="alert">✕ {edit.message}</p>{/if}
					<div class="actions wide">
						<button class="btn">Save</button>
						<ConfirmDelete id="delete-{s.id}" title="Delete {s.name}?" body="Its tests go too. The tank's own readings aren't touched." action="?/delete" fields={{ id: s.id }} />
					</div>
				</form>
			</details>
		</section>
	{/each}

	<section class="add" aria-labelledby="add-h">
		<h2 id="add-h" class="kicker rule">{data.sources.length ? 'Add another source' : 'Add a source'}</h2>
		<form class="src-form" method="POST" action="?/add" use:enhance={keepValues}>
			<div class="field">
				<label class="label" for="add-name">Name</label>
				<input class="input" id="add-name" name="name" maxlength="60" placeholder="Kitchen tap" defaultValue={String(add.values.name ?? '')} aria-invalid={!!add.message} />
			</div>
			<div class="field">
				<label class="label" for="add-kind">Kind</label>
				<select class="input" id="add-kind" name="kind">
					{#each data.kinds as k (k.value)}<option value={k.value} selected={k.value === (add.values.kind ?? 'tap')}>{k.label}</option>{/each}
				</select>
			</div>
			<div class="field wide">
				<label class="label" for="add-note">Note · optional</label>
				<input class="input" id="add-note" name="note" maxlength="500" placeholder="Treated with chloramine; softener on" defaultValue={String(add.values.note ?? '')} />
			</div>
			{#if add.message}<p class="error-text wide" role="alert">✕ {add.message}</p>{/if}
			<div class="actions wide"><button class="btn btn-primary">Add source</button></div>
		</form>
	</section>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 24px;
		max-width: 880px;
		padding: 16px 16px 40px;
	}
	@media (min-width: 1024px) {
		.page {
			padding: 24px 32px 48px;
		}
	}
	.bar {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.bar h1 {
		margin: 0;
		font-size: 28px;
	}
	.back {
		font-weight: 700;
		color: var(--accent-text);
	}
	.lede,
	.note,
	.none {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.source {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px;
		padding-bottom: 8px;
		border-bottom: 2px solid var(--ink);
	}
	.head h2 {
		margin: 0;
		font-size: 20px;
	}
	.meta {
		font-size: 13px;
		color: var(--text-muted);
	}
	.head .btn {
		min-height: 44px;
		white-space: nowrap;
	}
	.compare {
		width: 100%;
		border-collapse: collapse;
		font-size: 14px;
	}
	.compare th,
	.compare td {
		padding: 10px 8px 10px 0;
		border-bottom: 1px solid var(--divider);
		text-align: left;
		vertical-align: top;
	}
	.compare thead th {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-muted);
	}
	.unit,
	.when {
		font-weight: 400;
		color: var(--text-muted);
	}
	.when,
	.flag {
		display: block;
		font-size: 12px;
	}
	.flag {
		font-weight: 700;
	}
	.tests summary {
		list-style: none;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		cursor: pointer;
	}
	.tests summary::-webkit-details-marker {
		display: none;
	}
	.tests ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.tests li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 44px;
		border-bottom: 1px solid var(--divider);
		font-size: 14px;
	}
	.rule {
		display: block;
		margin: 0;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		color: var(--text);
	}
	.add {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.src-form {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		align-items: end;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.wide {
		grid-column: 1 / -1;
	}
	.actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.actions .btn {
		min-height: 44px;
	}
</style>
