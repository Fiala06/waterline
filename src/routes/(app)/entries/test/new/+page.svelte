<script lang="ts">
	import TestForm from '$lib/components/TestForm.svelte';
	import { ui } from '$lib/ui.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Water test · {data.tank.name}</title></svelte:head>

{#key data.tank.id}
	<TestForm
		tankName={data.tank.name}
		params={data.params}
		values={form?.values ?? data.filled ?? {}}
		initialWhen={data.when}
		timeZone={data.user.timeZone}
		closeHref="/?tank={data.tank.id}"
		task={data.task}
		error={form?.error}
		fieldErrors={form?.errors}
		ontankclick={() => (ui.tankSwitcher = true)}
		targetsHref="/tanks/{data.tank.id}/targets"
		draftKey="{data.user.id}:test:{data.tank.id}"
		waterChange={form?.wc ? { ...data.waterChange, ...form.wc } : data.waterChange}
	/>
{/key}
