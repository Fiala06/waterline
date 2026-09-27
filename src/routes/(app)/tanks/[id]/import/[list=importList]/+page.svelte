<script lang="ts">
	// Bulk import, step 1: the template to fill in, what its columns take, and
	// the file. Step 2 (ImportPreview) shows every row before anything is added.
	// Past imports of this kind can be undone at the bottom.
	import { enhance } from '$app/forms';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import ImportPreview from '$lib/components/ImportPreview.svelte';
	import { HISTORY_IMPORTS, IMPORTS, isHistoryKind } from '$lib/imports';
	let { data, form } = $props();

	const info = $derived(IMPORTS[data.kind]);
	const history = $derived(isHistoryKind(data.kind));
	const title = $derived(info.title);
	const back = $derived(history ? `/history?tank=${data.tank.id}&cat=${info.cat}` : `/tanks/${data.tank.id}/${data.kind}`);
	const preview = $derived(form && 'preview' in form ? form.preview : null);
	let busy = $state(false);
</script>

<svelte:head><title>{title} · {data.tank.name}</title></svelte:head>

<div class="imp">
	<!-- phones; on desktop the header has the title -->
	<div class="bar hide-desk">
		<a class="cancel" href={back}>Cancel</a>
		<h1>{title}</h1>
		<span aria-hidden="true"></span>
	</div>

	<div class="body">
		{#if preview}
			{#key preview}<ImportPreview kind={data.kind} file={preview.file} rows={preview.rows} ignored={preview.ignored} csv={preview.csv} />{/key}
		{:else}
			{#if history}
				<nav class="kinds hscroll" aria-label="What to import">
					{#each HISTORY_IMPORTS as k (k)}
						<a class="chip" class:selected={k === data.kind} aria-current={k === data.kind ? 'page' : undefined} href="/tanks/{data.tank.id}/import/{IMPORTS[k].slug}"
							>{IMPORTS[k].label}</a
						>
					{/each}
				</nav>
			{/if}
			<form
				method="POST"
				action="?/check"
				enctype="multipart/form-data"
				use:enhance={() => {
					busy = true;
					return async ({ update }) => {
						await update();
						busy = false;
					};
				}}
			>
				{#if form && 'error' in form}<p class="banner banner-bad" role="alert">✕ {form.error}</p>{/if}
				<ol class="steps">
					<li>
						<div class="st">
							<h2>Start from the template</h2>
							<p>Its first row names the columns Waterline reads. Open it in Excel, Numbers or Google Sheets and replace the example rows.</p>
							{#if data.kind === 'tests'}<p>A water-tests.csv from Export data reads back as it is.</p>{/if}
						</div>
						<a class="btn" href="/tanks/{data.tank.id}/import/{info.slug}/template.csv" download>Download template</a>
					</li>
					<li>
						<div class="st">
							<h2>Add one row per {info.per}</h2>
							<p>{data.kind === 'tests' ? "Leave a cell empty for anything you didn't test." : "Leave a cell empty when you don't know it."}</p>
						</div>
						<details class="cols">
							<summary>What each column takes</summary>
							<dl>
								{#each data.columns as c (c.header)}
									<div><dt>{c.header}</dt><dd>{c.help}</dd></div>
								{/each}
							</dl>
						</details>
					</li>
					<li>
						<div class="st">
							<h2>Choose the file</h2>
							<p>Save it as CSV. You'll see every row before anything is added.</p>
						</div>
						<label class="drop" class:busy>
							<input
								type="file"
								name="file"
								accept=".csv,text/csv"
								required
								onchange={(e) => e.currentTarget.files?.length && e.currentTarget.form?.requestSubmit()}
							/>
							<span class="drop-t">{busy ? 'Reading the file…' : 'Choose a CSV file'}</span>
							<span class="drop-s hide-phone">or drop it here</span>
						</label>
					</li>
				</ol>
				<div class="foot">
					<a class="btn hide-phone" href={back}>Cancel</a>
					<button class="btn btn-primary go" disabled={busy}>Check the file</button>
				</div>
			</form>

			{#if data.recent.length}
				<section class="recent" aria-labelledby="recent-h">
					<h2 id="recent-h">Recent imports</h2>
					<ul>
						{#each data.recent as r (r.id)}
							<li>
								<span class="r-text">
									<span class="r-title">{r.summary}</span>
									<span class="r-sub">{r.when}{r.fileName ? ` · ${r.fileName}` : ''}</span>
								</span>
								{#if r.undone}
									<span class="r-undone">Undone</span>
								{:else}
									<button type="button" class="btn btn-warn r-undo" popovertarget="undo-{r.id}">Undo</button>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
				{#each data.recent.filter((r) => !r.undone) as r (r.id)}
					<ConfirmDelete
						id="undo-{r.id}"
						trigger={false}
						title="Undo this import?"
						body="Everything it added will be removed ({r.summary}), with any changes made since. This can't be undone."
						action="?/undo"
						label="Undo import"
						fields={{ importId: r.id }}
						tone="warn"
					/>
				{/each}
			{/if}
		{/if}
	</div>
</div>

<style>
	.imp {
		max-width: 560px;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}
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
	h1 {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
	}
	.body {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: 8px 20px 0;
	}
	form {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.banner {
		margin: 0;
	}
	/* the kinds of History entry, one tap apart */
	.kinds {
		display: flex;
		gap: 8px;
		margin: 0 -20px 16px;
		padding: 2px 20px;
	}

	/* earlier imports of this kind, each can be undone */
	.recent {
		padding: 8px 0 calc(24px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.recent h2 {
		font-size: 15px;
	}
	.recent ul {
		list-style: none;
		margin: 0;
		padding: 0 14px;
		border-radius: 14px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.recent li {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 60px;
		padding: 8px 0;
	}
	.recent li + li {
		border-top: 1px solid var(--divider-soft);
	}
	.r-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.r-title {
		font-size: 15px;
		font-weight: 600;
	}
	.r-sub {
		font-size: 13px;
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}
	.r-undo {
		flex-shrink: 0;
		padding: 0 14px;
		font-size: 14px;
	}
	.r-undone {
		flex-shrink: 0;
		font-size: 13px;
		color: var(--text-faint);
	}

	/* three numbered steps */
	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		counter-reset: step;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.steps li {
		counter-increment: step;
		position: relative;
		padding-left: 42px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
	}
	.steps li::before {
		content: counter(step);
		position: absolute;
		left: 0;
		top: -2px;
		width: 28px;
		height: 28px;
		border-radius: 14px;
		display: grid;
		place-items: center;
		background: var(--surface-hi);
		color: var(--accent);
		font-size: 14px;
		font-weight: 700;
	}
	.st {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}
	.st p {
		margin: 0;
		font-size: 14px;
		line-height: 1.45;
		color: var(--text-muted);
	}

	/* the columns, folded away until wanted */
	.cols {
		width: 100%;
		border-radius: 12px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.cols summary {
		min-height: 44px;
		padding: 0 14px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		list-style: none;
	}
	.cols summary::-webkit-details-marker {
		display: none;
	}
	.cols summary::after {
		content: '▾';
		margin-left: auto;
		color: var(--text-muted);
	}
	.cols[open] summary::after {
		content: '▴';
	}
	dl {
		margin: 0;
		padding: 0 14px 12px;
		display: flex;
		flex-direction: column;
	}
	dl div {
		padding: 8px 0;
		border-top: 1px solid var(--divider-soft);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	dt {
		font-size: 14px;
		font-weight: 600;
	}
	dd {
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
	}

	/* the file picker as a drop area: the input covers it, so a dropped file lands in it */
	.drop {
		position: relative;
		width: 100%;
		min-height: 88px;
		padding: 16px;
		border-radius: 14px;
		border: 1px dashed var(--border-strong);
		background: var(--surface-2);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		text-align: center;
		cursor: pointer;
	}
	.drop input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.drop:focus-within {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.drop-t {
		font-size: 15px;
		font-weight: 600;
		color: var(--accent);
	}
	.busy .drop-t {
		color: var(--text-muted);
	}
	.drop-s {
		font-size: 13px;
		color: var(--text-faint);
	}
	.foot {
		margin-top: auto;
		padding: 8px 0 calc(24px + env(safe-area-inset-bottom));
		display: flex;
		gap: 12px;
	}
	.go {
		flex: 1;
		height: 56px;
		border-radius: 14px;
		font-size: 17px;
	}

	@media (hover: hover) {
		.drop:hover {
			border-color: var(--accent);
		}
	}

	/* Desktop: a centered card, like Add livestock (the header has the title) */
	@media (min-width: 1024px) {
		.imp {
			min-height: 0;
			max-width: 720px;
			width: calc(100% - 64px);
			margin: 28px auto;
			padding: 24px 28px;
			background: var(--surface);
			border: 1px solid var(--border);
			border-radius: 20px;
		}
		.body {
			padding: 0;
		}
		.cols {
			background: var(--surface-2);
		}
		.drop {
			background: var(--bg);
		}
		.foot {
			margin-top: 8px;
			padding: 20px 0 0;
			border-top: 1px solid var(--border);
			justify-content: flex-end;
		}
		.kinds {
			margin: 0 0 20px;
			padding: 0;
			flex-wrap: wrap;
		}
		.recent {
			padding: 28px 0 0;
		}
		.recent ul {
			background: var(--surface-2);
		}
		.foot .btn {
			height: 44px;
			border-radius: 12px;
			font-size: 15px;
		}
		.go {
			flex: none;
			padding: 0 22px;
		}
	}
</style>
