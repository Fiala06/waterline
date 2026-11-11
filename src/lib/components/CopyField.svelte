<script lang="ts">
	// A label, a Copy button and the text in a box that one tap selects whole, so it
	// copies without scripts too (#268: AI assistant and Sensors).
	import { Copier } from '$lib/copy.svelte';

	let { id, label, text, pre = false }: { id: string; label: string; text: string; /** keep its line breaks and indents (YAML, a shell command) */ pre?: boolean } = $props();
	const copier = new Copier();
</script>

<div class="field">
	<div class="label-row copy-row">
		<span class="label">{label}</span>
		<button type="button" class="btn-text copy" onclick={() => copier.copy(id, text)}>{copier.which === id ? '✓ Copied' : 'Copy'}<span class="sr-only"> {label}</span></button>
	</div>
	<code class="code mono" class:pre {id}>{text}</code>
</div>

<style>
	.copy-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.copy {
		min-height: 44px;
		min-width: 44px;
		padding: 0 6px;
		font-size: 12px;
	}
	.code {
		display: block;
		padding: 10px 12px;
		background: var(--surface);
		border: 1px solid var(--divider);
		font-size: 12.5px;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-all;
		user-select: all;
		-webkit-user-select: all;
	}
	/* JSON and YAML keep their indents, and wrap between words */
	.code.pre {
		white-space: pre-wrap;
		word-break: normal;
		overflow-wrap: anywhere;
	}
</style>
