<script lang="ts">
	// A form's phone bar: Cancel · title · Save (on desktop the header has the title).
	// It sits inside the form, so its button submits it.
	let {
		title,
		cancelHref,
		saveLabel = 'Save',
		disabled = false,
		variant = 'form'
	}: {
		title: string;
		cancelHref: string;
		saveLabel?: string;
		disabled?: boolean;
		/** 'log': the log pages' and the task form's, a little closer to the top with a lighter Save */
		variant?: 'form' | 'log';
	} = $props();
</script>

<div class="bar hide-desk" class:log={variant === 'log'}>
	<a class="cancel" href={cancelHref}>Cancel</a>
	<h1>{title}</h1>
	<button class="save-top" {disabled}>{saveLabel}</button>
</div>

<style>
	.bar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		padding: 8px 20px;
	}
	.cancel {
		font-size: 15px;
		color: var(--text-muted);
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-self: start;
	}
	.cancel:hover {
		color: var(--text);
	}
	h1 {
		margin: 0;
		font-size: 17px;
		font-weight: 800;
	}
	.save-top {
		justify-self: end;
		color: var(--accent-text);
		font-weight: 800;
		font-size: 16px;
		min-height: 44px;
	}
	.save-top:disabled {
		opacity: 0.45;
	}
	.log {
		padding: 4px 20px 8px;
	}
	.log .cancel {
		font-size: 16px;
	}
	.log .save-top {
		font-weight: 700;
	}
</style>
