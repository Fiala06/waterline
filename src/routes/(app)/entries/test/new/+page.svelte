<script lang="ts">
	import TestForm from '$lib/components/TestForm.svelte';
	import { ui } from '$lib/ui.svelte';
	import { refusal } from '$lib/forms';
	import { refusedReadings } from '$lib/components/test-form';
	let { data, form } = $props();
	const r = $derived(refusal(form, 'test'));
	const v = (k: string) => String(r.values[k] ?? '');
</script>

<svelte:head><title>Water test · {data.tank.name}</title></svelte:head>

{#key data.tank.id}
	<TestForm
		tankName={data.tank.name}
		params={data.params}
		kits={data.kits}
		values={r.form ? refusedReadings(r.values) : (data.filled ?? {})}
		initialNote={v('note')}
		initialWhen={data.when}
		timeZone={data.user.timeZone}
		closeHref={data.returnTo ?? `/?tank=${data.tank.id}`}
		returnTo={data.returnTo}
		task={data.task}
		error={r.message || null}
		fieldErrors={r.errors}
		ontankclick={() => (ui.tankSwitcher = true)}
		targetsHref="/tanks/{data.tank.id}/targets"
		reusable={data.reusable}
		draftKey="{data.user.id}:test:{data.tank.id}"
		waterChange={r.form ? { ...data.waterChange, on: v('wc') === '1', amountMode: v('amountMode'), amount: v('amount'), source: v('source') } : data.waterChange}
	/>
{/key}
