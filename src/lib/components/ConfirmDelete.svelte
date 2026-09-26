<script lang="ts">
	// 7.10 · Confirmation dialog. Uses the popover API, so it works without JS.
	let { id, title, body, action = '?/delete' }: { id: string; title: string; body: string; action?: string } =
		$props();
</script>

<button type="button" class="btn btn-danger" popovertarget={id}>Delete</button>
<div {id} popover class="confirm" role="alertdialog" aria-labelledby="{id}-t">
	<h2 id="{id}-t">{title}</h2>
	<p>{body}</p>
	<div class="actions">
		<button type="button" class="btn" popovertarget={id} popovertargetaction="hide">Cancel</button>
		<form method="POST" {action}><button class="btn btn-danger solid">Delete</button></form>
	</div>
</div>

<style>
	.btn-danger {
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
