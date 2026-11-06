<script lang="ts">
	// Run for… (#205): a plug-linked item on for a while; the plug switches
	// itself off after it. A popover, so it works without scripts.
	let {
		id,
		name,
		action = '?/run',
		doses = false,
		from = null
	}: {
		/** the item */
		id: string;
		name: string;
		action?: string;
		/** a doser: its run is logged as a dose */
		doses?: boolean;
		from?: string | null;
	} = $props();
</script>

<button type="button" class="ghost" popovertarget="run-{id}">Run for…<span class="sr-only"> {name}</span></button>
<div id="run-{id}" popover class="sheet" role="dialog" aria-labelledby="run-{id}-t">
	<h2 id="run-{id}-t">Run {name} for…</h2>
	<form method="POST" {action}>
		<input type="hidden" name="id" value={id} />
		{#if from}<input type="hidden" name="from" value={from} />{/if}
		<div class="how">
			<input class="input num" name="amount" inputmode="decimal" required value="30" aria-label="How long" autocomplete="off" />
			<select class="input" name="unit" aria-label="Seconds or minutes">
				<option value="s">seconds</option>
				<option value="min">minutes</option>
			</select>
		</div>
		<p>Its plug switches on, then off by itself after that{doses ? ', and the run is logged as a dose' : ''}. Up to 60 minutes.</p>
		<div class="buttons">
			<button type="button" class="btn" popovertarget="run-{id}" popovertargetaction="hide">Cancel</button>
			<button class="btn btn-primary">Run</button>
		</div>
	</form>
</div>

<style>
	.ghost {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin: -6px 0;
		padding: 0 4px;
		font-size: 14px;
		font-weight: 800;
		font-family: inherit;
		color: var(--accent-text);
		background: none;
		border: 0;
		cursor: pointer;
	}
	.sheet {
		border: 1px solid var(--border-strong);
		border-radius: 0;
		background: var(--surface);
		color: var(--text);
		padding: 20px;
		width: min(400px, calc(100vw - 40px));
		box-shadow: var(--shadow-modal);
	}
	.sheet::backdrop {
		background: var(--scrim);
	}
	h2 {
		margin: 0 0 12px;
		font-size: 18px;
		font-weight: 800;
	}
	.how {
		display: grid;
		grid-template-columns: 1fr 1.4fr;
		gap: 8px;
	}
	p {
		margin: 12px 0 16px;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-2);
	}
	.buttons {
		display: flex;
		gap: 8px;
	}
	.buttons .btn {
		flex: 1;
		min-height: 44px;
	}
</style>
