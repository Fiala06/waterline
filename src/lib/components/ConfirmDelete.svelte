<script lang="ts">
	// 7.10 · Confirmation dialog. Uses the popover API, so it works without JS.
	// Forms can't nest: when the opening button sits inside another form, pass
	// trigger={false}, render this after that form, and give the button
	// popovertarget={id}.
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
		tone?: 'danger' | 'primary';
	} = $props();
</script>

{#if trigger}<button type="button" class="btn btn-danger trigger" popovertarget={id}>{label}</button>{/if}
<div {id} popover class="confirm" role="alertdialog" aria-labelledby="{id}-t">
	<h2 id="{id}-t">{title}</h2>
	<p>{body}</p>
	<div class="actions">
		<button type="button" class="btn" popovertarget={id} popovertargetaction="hide">Cancel</button>
		<form method="POST" {action}>
			{#each Object.entries(fields) as [name, value] (name)}<input type="hidden" {name} {value} />{/each}
			<button class="btn {tone === 'danger' ? 'btn-danger solid' : 'btn-primary'}">{label}</button>
		</form>
	</div>
</div>

<style>
	.trigger {
		flex: 1;
	}
	.confirm {
		border: 1px solid var(--border-strong);
		border-radius: 20px;
		background: var(--surface);
		color: var(--text);
		padding: 22px;
		width: min(400px, calc(100vw - 40px));
		box-shadow: var(--shadow-modal);
	}
	.confirm::backdrop {
		background: var(--scrim);
	}
	h2 {
		margin: 0 0 8px;
		font-size: 19px;
	}
	p {
		margin: 0 0 18px;
		color: var(--text-muted);
		line-height: 1.5;
	}
	.actions {
		display: flex;
		gap: 10px;
		justify-content: flex-end;
	}
	.solid {
		background: var(--bad);
		border-color: var(--bad);
		color: var(--bg);
	}
</style>
