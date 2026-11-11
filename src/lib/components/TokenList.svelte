<script lang="ts">
	// The tokens under Connected (#268: AI assistant and Sensors): each with its
	// name, what it reaches and when it was last used, Tanks to change which
	// tanks (a link that opens it without scripts) and Revoke.
	import { enhance } from '$app/forms';
	import { closeOnRedirect } from '$lib/forms';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import TankChecks from '$lib/components/TankChecks.svelte';

	interface Token {
		id: string;
		name: string;
		hint: string;
		createdAt: string;
		lastUsedAt: string | null;
		/** connected by signing in: no token of its own to show the end of */
		bySignIn?: boolean;
		tankIds: string[];
		tankNames: string[];
	}
	let {
		tokens,
		tanks,
		page,
		editing = $bindable(),
		editError,
		legend,
		reach,
		meta,
		revokeBody,
		empty
	}: {
		tokens: Token[];
		/** the tanks to pick from */
		tanks: { id: string; name: string; archived?: boolean }[];
		/** this page, for Cancel and without scripts */
		page: string;
		/** the token whose tanks are open */
		editing: string | null;
		/** a refused change of tanks: whose, and why */
		editError: { id: string; message?: string } | null;
		/** "Tanks it can read" */
		legend: string;
		/** "Reads Riverbed 40", from the tanks' names */
		reach: (names: string) => string;
		/** "Made Oct 3 · Last used today" */
		meta: (t: Token) => string;
		revokeBody: string;
		/** with none */
		empty: string;
	} = $props();

	const tankList = (names: string[]) => (names.length ? names.join(', ') : 'No tanks');
	// the sr-only end of the Tanks link: "Claude can read"
	const reachVerb = $derived(legend.replace(/^Tanks it /, ''));
</script>

{#if tokens.length}
	<ul class="list">
		{#each tokens as t (t.id)}
			<li>
				<div class="item">
					<div class="t">
						<span class="name">{t.name}{#if !t.bySignIn}{' '}<span class="mono hint-code">…{t.hint}</span>{/if}</span>
						<span class="meta reads">{reach(tankList(t.tankNames))}</span>
						<span class="meta">{meta(t)}</span>
					</div>
					<div class="acts">
						<a
							class="btn-text edit-link"
							href="?edit={t.id}"
							aria-expanded={editing === t.id}
							onclick={(e) => {
								e.preventDefault();
								editing = editing === t.id ? null : t.id;
							}}>Tanks<span class="sr-only"> {t.name} {reachVerb}</span></a
						>
						<button type="button" class="btn btn-danger" popovertarget="revoke-{t.id}">Revoke<span class="sr-only"> {t.name}</span></button>
					</div>
				</div>
				{#if editing === t.id}
					<form
						method="POST"
						action="?/tanks"
						class="edit"
						use:enhance={closeOnRedirect(() => (editing = null))}
					>
						<input type="hidden" name="id" value={t.id} />
						<TankChecks prefix="e-{t.id}" {legend} {tanks} picked={new Set(t.tankIds)} error={editError?.id === t.id ? editError.message : undefined} />
						<div class="edit-acts">
							<a class="btn" href={page} onclick={(e) => (e.preventDefault(), (editing = null))}>Cancel</a>
							<button class="btn btn-primary">Save</button>
						</div>
					</form>
				{/if}
				<ConfirmDelete id="revoke-{t.id}" trigger={false} title="Revoke {t.name}'s token?" body={revokeBody} action="?/revoke" label="Revoke" fields={{ id: t.id }} />
			</li>
		{/each}
	</ul>
{:else}
	<p class="none">{empty}</p>
{/if}

<style>
	.none {
		margin: 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.list li {
		border-bottom: 1px solid var(--divider);
	}
	.item {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px 12px;
		padding: 12px 0;
	}
	.t {
		flex: 1;
		min-width: 200px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.name {
		font-size: 15px;
		font-weight: 800;
		overflow-wrap: anywhere;
	}
	.hint-code {
		font-size: 12px;
		font-weight: 400;
		color: var(--text-muted);
	}
	.meta {
		font-size: 12px;
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}
	.reads {
		font-size: 13px;
		color: var(--text-2);
	}
	.acts {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.edit-link {
		color: var(--text-2);
	}
	.edit {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 0 0 14px;
	}
	.edit-acts {
		display: flex;
		gap: 10px;
		justify-content: flex-end;
	}
	.edit-acts .btn-primary {
		flex: 1;
	}
	@media (hover: hover) {
		.edit-link:hover {
			color: var(--accent-text);
		}
	}
</style>
