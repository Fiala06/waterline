<script lang="ts">
	// "?": every keyboard shortcut, in groups. Shortcuts are ignored while typing in a field.
	let { open = $bindable(false) }: { open?: boolean } = $props();
	let dialog: HTMLDialogElement | undefined = $state();
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});
	const groups: { name: string; keys: [string, string][] }[] = [
		{
			name: 'Anywhere',
			keys: [
				['⌘K', 'Search tanks and actions'],
				['/', 'Search'],
				['?', 'This list'],
				['[', 'Keep the menu open, or auto-hide it'],
				['Alt ↑ / ↓', 'Previous or next tank']
			]
		},
		{
			name: 'Go to',
			keys: [
				['G then O', 'Overview'],
				['G then C', 'Charts'],
				['G then H', 'History'],
				['G then P', 'Photos'],
				['G then L', 'Livestock'],
				['G then E', 'Equipment'],
				['G then S', 'Setup']
			]
		},
		{
			name: 'Log',
			keys: [
				['T', 'Water test'],
				['W', 'Water change'],
				['D', 'Dose'],
				['N', 'Note']
			]
		},
		{
			name: 'Forms',
			keys: [
				['⌘↵', 'Save the open form'],
				['Esc', 'Close the top sheet or menu']
			]
		}
	];
</script>

<dialog
	bind:this={dialog}
	class="keys"
	aria-label="Keyboard shortcuts"
	onclose={() => (open = false)}
	onclick={(e) => {
		if (e.target === dialog) open = false;
	}}
>
	<div class="panel">
		<div class="head">
			<h2>Keyboard shortcuts</h2>
			<button type="button" class="btn-text" onclick={() => (open = false)}>Esc</button>
		</div>
		<div class="grid">
			{#each groups as g (g.name)}
				<section>
					<h3>{g.name}</h3>
					<dl>
						{#each g.keys as [k, what] (k)}
							<div><dt><kbd>{k}</kbd></dt><dd>{what}</dd></div>
						{/each}
					</dl>
				</section>
			{/each}
		</div>
		<p class="note">Shortcuts are ignored while you're typing in a field.</p>
	</div>
</dialog>

<style>
	.keys {
		padding: 0;
		border: none;
		background: transparent;
		color: var(--text);
		max-width: none;
		max-height: none;
		width: 100%;
		height: 100%;
		margin: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.keys:not([open]) {
		display: none;
	}
	.keys::backdrop {
		background: var(--scrim);
	}
	.panel {
		width: min(680px, calc(100vw - 32px));
		max-height: calc(100vh - 32px);
		overflow-y: auto;
		background: var(--bg);
		border: 2px solid var(--ink);
		box-shadow: var(--shadow-lg);
		padding: 20px 24px 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: 10px;
		border-bottom: 2px solid var(--ink);
	}
	h2 {
		margin: 0;
		font-size: 22px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 20px 32px;
	}
	h3 {
		margin: 0 0 6px;
		font-size: 11px;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	dl {
		margin: 0;
	}
	dl div {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		min-height: 36px;
		border-top: 1px solid var(--divider-soft);
		font-size: 14px;
	}
	dt {
		order: 2;
	}
	dd {
		margin: 0;
	}
	kbd {
		font: inherit;
		font-size: 13px;
		font-weight: 800;
		padding: 2px 8px;
		border: 1px solid var(--divider);
		white-space: nowrap;
	}
	.note {
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
	}
</style>
