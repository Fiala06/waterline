<script lang="ts">
	// Server settings › People (#27): invite someone, the people on the server
	// with what an admin can do about each, and invitations with Resend and Revoke.
	import { enhance } from '$app/forms';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import { toast } from '$lib/ui.svelte';
	let { data, form } = $props();
	const invited = $derived(form?.invited ?? null);
	let copied = $state(false);
	async function copy() {
		if (!invited) return;
		try {
			await navigator.clipboard.writeText(invited.link);
			copied = true;
			toast('✓ Link copied');
			setTimeout(() => (copied = false), 2000);
		} catch {
			/* the field is there to copy by hand */
		}
	}
	const pending = $derived(data.invites.filter((i) => i.state === 'pending'));
	const past = $derived(data.invites.filter((i) => i.state !== 'pending'));
	const STATE = { pending: '▲ Pending', accepted: '✓ Accepted', expired: '✕ Expired', revoked: '○ Revoked' } as const;
</script>

<svelte:head><title>People · Server settings · Waterline</title></svelte:head>

<div class="page sub-page">
	<div class="head">
		<a class="back sub-back" href="/settings/server">‹ Server settings</a>
		<h1>People</h1>
		<p class="lede">Everyone on this server, and who's invited. An invitation is an email with an Accept link, good for {data.inviteDays} days, for that address's Google account.</p>
	</div>

	{#if data.mode === 'admin'}
		<p class="banner banner-warn">▲ Who can sign in is set to Only the admin, so nobody invited can sign in yet. Choose <a href="/settings/server#who-can-sign-in">Invited people only</a> first.</p>
	{:else if data.mode === 'open'}
		<p class="hint">Anyone with a Google account can sign in already, so invitations here are just a way to send the link.</p>
	{/if}

	<form method="POST" action="?/invite" class="invite" use:enhance={() => async ({ update }) => update({ reset: true })}>
		<h2 class="kicker">Invite someone</h2>
		<div class="invite-row">
			<label class="sr-only" for="invite-email">Email</label>
			<input class="input" id="invite-email" name="email" type="email" placeholder="name@example.com" autocomplete="off" value={form?.email ?? ''} aria-invalid={!!form?.inviteError} />
			<button class="btn btn-primary">{data.emailOn ? 'Send invite' : 'Make invite link'}</button>
		</div>
		{#if form?.inviteError}<span class="error-text">✕ {form.inviteError}</span>{/if}
		{#if !data.emailOn}<span class="hint">Email isn't set up on this server, so you'll copy the link and send it yourself. <a href="/settings/server#email">Set up email ›</a></span>{/if}
		{#if invited}
			<div class="sent" role="status">
				<span class="sent-h">{invited.sent ? `✓ Invitation sent to ${invited.email}` : invited.error ? `✕ ${invited.error}` : `✓ Invite link for ${invited.email}`}</span>
				<div class="link-row">
					<input class="input mono" readonly value={invited.link} aria-label="Invite link" onfocus={(e) => e.currentTarget.select()} />
					<button type="button" class="btn" onclick={copy}>{copied ? '✓ Copied' : 'Copy link'}</button>
				</div>
				<span class="hint">{invited.sent ? 'Or send them this link yourself. ' : 'Send them this link. '}It works for {data.inviteDays} days, once, for their Google account with this address.</span>
			</div>
		{/if}
	</form>

	<section aria-labelledby="people-h">
		<h2 class="kicker" id="people-h">On the server · {data.people.length}</h2>
		<ul class="list">
			{#each data.people as p (p.id)}
				<li class="person">
					<div class="who">
						<span class="name">{p.name}{#if p.me}<span class="you"> · you</span>{/if}{#if p.isAdmin}<span class="tag tag-outline">ADMIN</span>{/if}</span>
						<span class="meta">{p.email}</span>
						<span class="meta">{p.signIn} · joined {p.joined} · last seen {p.lastSeen.toLowerCase()} · {p.tanks} tank{p.tanks === 1 ? '' : 's'}</span>
					</div>
					<div class="acts">
						{#if !p.me}
							<form method="POST" action="?/admin" use:enhance>
								<input type="hidden" name="id" value={p.id} />
								<input type="hidden" name="on" value={p.isAdmin ? '0' : '1'} />
								<button class="btn-text" disabled={p.isAdmin && !p.canDemote} title={p.isAdmin && !p.canDemote ? 'The server needs at least one admin' : undefined}>{p.isAdmin ? 'Remove admin' : 'Make admin'}</button>
							</form>
						{/if}
						<form method="POST" action="?/signout" use:enhance>
							<input type="hidden" name="id" value={p.id} />
							<button class="btn-text">Sign out everywhere</button>
						</form>
						{#if p.canRemove}
							<button type="button" class="btn-text danger" popovertarget="confirm-remove-{p.id}">Remove…</button>
							<ConfirmDelete
								id="confirm-remove-{p.id}"
								trigger={false}
								title="Remove {p.name}?"
								body="Their account goes, with {p.tanks} tank{p.tanks === 1 ? '' : 's'} and every entry and photo in them. Ask them to export first if they want to keep anything. This can't be undone."
								action="?/remove"
								label="Remove person"
								fields={{ id: p.id }}
							/>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	</section>

	{#if data.invites.length}
		<section aria-labelledby="invites-h">
			<h2 class="kicker" id="invites-h">Invitations · {pending.length} pending</h2>
			<ul class="list">
				{#each [...pending, ...past] as i (i.id)}
					<li class="person">
						<div class="who">
							<span class="name">{i.email}</span>
							<span class="meta"><span class={i.state === 'pending' ? 'status-warn' : i.state === 'accepted' ? 'status-ok' : i.state === 'expired' ? 'status-bad' : 'status-none'}>{STATE[i.state]}</span> · invited by {i.by} · {i.sent.toLowerCase()}{i.state === 'pending' ? ` · works until ${i.expires}` : ''}</span>
						</div>
						<div class="acts">
							{#if i.state === 'pending' || i.state === 'expired'}
								<form method="POST" action="?/resend" use:enhance>
									<input type="hidden" name="id" value={i.id} />
									<button class="btn-text">{i.state === 'expired' ? 'Invite again' : 'Resend'}</button>
								</form>
							{/if}
							{#if i.state === 'pending' || i.state === 'accepted'}
								<form method="POST" action="?/revoke" use:enhance>
									<input type="hidden" name="id" value={i.id} />
									<button class="btn-text danger" title={i.state === 'accepted' ? 'They can no longer sign in; their tanks stay' : undefined}>{i.state === 'accepted' ? 'Revoke access' : 'Revoke'}</button>
								</form>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.page {
		padding: 8px 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 24px;
		max-width: 820px;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	h1 {
		margin: 0;
		font-size: 28px;
	}
	.lede {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-2);
		max-width: 620px;
	}
	.kicker {
		margin: 0;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		font-weight: 800;
	}
	.hint a,
	.banner a {
		color: var(--accent-text);
		font-weight: 700;
	}
	.invite {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.invite-row {
		display: flex;
		gap: 8px;
	}
	.invite-row .input {
		flex: 1;
		min-width: 0;
		min-height: 44px;
	}
	.invite-row .btn {
		min-height: 44px;
		white-space: nowrap;
	}
	.sent {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		border: 2px solid var(--ink);
	}
	.sent-h {
		font-weight: 800;
	}
	.link-row {
		display: flex;
		gap: 8px;
	}
	.link-row .input {
		flex: 1;
		min-width: 0;
		min-height: 44px;
		font-size: 13px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.person {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 6px 16px;
		padding: 10px 0;
		border-bottom: 1px solid var(--divider);
	}
	.who {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1 1 260px;
	}
	.name {
		font-size: 15px;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.you {
		font-weight: 400;
		color: var(--text-muted);
	}
	.tag {
		font-size: 10px;
	}
	.meta {
		font-size: 12px;
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		align-items: center;
	}
	.acts .btn-text {
		min-height: 44px;
		padding: 0;
		font-size: 14px;
	}
	.acts .btn-text:disabled {
		color: var(--text-muted);
		cursor: not-allowed;
	}
	.danger {
		color: var(--accent-text);
	}
</style>
