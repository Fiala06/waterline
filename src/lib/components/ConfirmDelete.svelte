<script lang="ts">
	// 7.10 · Confirmation dialog. Uses the popover API, so it works without JS.
	// Forms can't nest: when the opening button sits inside another form, pass
	// trigger={false}, render this after that form, and give the button
	// popovertarget={id}. `tone="warn"` for reversible actions such as Archive.
	let {
		id,
		title,
		body,
		action = '?/delete',
		label = 'Delete',
		fields = {},
		trigger = true,
		tone = 'danger'
	}: {
		id: string;
		title: string;
		body: string;
		action?: string;
		label?: string;
		fields?: Record<string, string>;
		trigger?: boolean;
		tone?: 'danger' | 'warn' | 'primary';
	} = $props();
</script>

{#if trigger}<button type="button" class="btn {tone === 'warn' ? 'btn-warn' : 'btn-danger'} trigger" popovertarget={id}>{label}</button>{/if}
<div {id} popover class="confirm" role="alertdialog" aria-labelledby="{id}-t">
	<h2 id="{id}-t">{title}</h2>
	<p>{body}</p>
	<div class="buttons">
		<button type="button" class="btn cancel" popovertarget={id} popovertargetaction="hide">Cancel</button>
		<form method="POST" {action}>
			{#each Object.entries(fields) as [name, value] (name)}<input type="hidden" {name} {value} />{/each}
			<button class="btn go {tone}">{label}</button>
		</form>
	</div>
</div>

<style>
	.trigger {
		flex: 1;
	}
	/* Selectors are deliberately specific: the dialog renders inside other
	   components' button rows, and their `.actions .btn` rules must not restyle it. */
	.confirm {
		border: 1px solid var(--border-strong);
		border-radius: 20px;
		background: var(--surface);
		color: var(--text);
		padding: 20px;
		width: min(400px, calc(100vw - 40px));
		box-shadow: var(--shadow-modal);
	}
	.confirm::backdrop {
		background: var(--scrim);
	}
	.confirm h2 {
		margin: 0 0 8px;
		font-size: 18px;
		font-weight: 600;
	}
	.confirm p {
		margin: 0 0 18px;
		font-size: 14px;
		color: var(--text-muted);
		line-height: 1.5;
	}
	.confirm .buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.confirm .buttons .btn {
		width: 100%;
		height: 44px;
		min-height: 44px;
		padding: 0 16px;
		border-radius: 12px;
		font-size: 15px;
		font-weight: 700;
	}
	.confirm .buttons .btn.cancel {
		background: transparent;
		border-color: var(--border-strong);
		color: var(--text);
	}
	.confirm .buttons .btn.go.danger {
		background: var(--bad);
		border-color: var(--bad);
		color: var(--bg);
	}
	.confirm .buttons .btn.go.warn {
		background: var(--warn);
		border-color: var(--warn);
		color: var(--bg);
	}
	.confirm .buttons .btn.go.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
	}
	@media (hover: hover) {
		.confirm .buttons .btn.cancel:hover {
			background: var(--surface-hi);
		}
		.confirm .buttons .btn.go:hover {
			filter: brightness(1.06);
		}
	}
</style>
