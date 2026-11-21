<script lang="ts">
	// A test of a source (#315): the tank's parameters in its units, any of them.
	import { enhance } from '$app/forms';
	import { refusal, keepValues } from '$lib/forms';
	let { data, form } = $props();
	const r = $derived(refusal(form, 'test'));
	const v = (k: string) => String(r.values[k] ?? '');
</script>

<svelte:head><title>Test {data.source.name} · Waterline</title></svelte:head>

<div class="page">
	<div class="bar hide-desk">
		<a class="back" href={data.back}>‹ Source water</a>
		<h1>Test {data.source.name}</h1>
	</div>
	<p class="lede">{data.source.kind}. Enter what you tested; the rest can stay blank. These stay with the source and never count as the tank's readings.</p>
	<form method="POST" use:enhance={keepValues}>
		<div class="field">
			<label class="label" for="st-date">Tested on</label>
			<input class="input" id="st-date" type="date" name="date" max={data.today} defaultValue={v('date') || data.today} />
		</div>
		<div class="readings">
			{#each data.params as p (p.id)}
				<div class="field">
					<label class="label" for="v_{p.id}">{p.name}{p.unit ? ` · ${p.unit}` : ''}</label>
					<input class="input" id="v_{p.id}" name="v_{p.id}" inputmode="decimal" autocomplete="off" defaultValue={v(`v_${p.id}`)} aria-invalid={!!r.errors[p.id]} />
					{#if r.errors[p.id]}<span class="error-text">✕ {r.errors[p.id]}</span>{/if}
				</div>
			{/each}
		</div>
		<div class="field">
			<label class="label" for="st-note">Note · optional</label>
			<textarea class="input" id="st-note" name="note" rows="2" maxlength="2000" placeholder="Strip test, after the softener">{v('note')}</textarea>
		</div>
		{#if r.message}<p class="error-text" role="alert">✕ {r.message}</p>{/if}
		<div class="actions">
			<button class="btn btn-primary">Save source test</button>
			<a class="btn" href={data.back}>Cancel</a>
		</div>
	</form>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 16px;
		max-width: 640px;
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
	.lede {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.readings {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		padding-top: 12px;
		border-top: 2px solid var(--ink);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.field .input {
		min-height: 44px;
	}
	.actions {
		display: flex;
		gap: 8px;
	}
	.actions .btn {
		min-height: 44px;
	}
</style>
