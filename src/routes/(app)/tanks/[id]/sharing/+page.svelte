<script lang="ts">
	// Setup › Sharing (#22, README § 13): an invite box with a 2px ink border, the
	// people with access (owner first, each member with a role select and Remove,
	// pending invites with Resend and Cancel), then whom reminders and alerts go to.
	import { enhance } from '$app/forms';
	import { toast } from '$lib/ui.svelte';
	let { data, form } = $props();
	const invited = $derived(form?.invited ?? null);
	let email = $state('');
	let copied = $state(false);
	const valid = $derived(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()));
	const duplicate = $derived(data.members.some((m) => m.email === email.trim().toLowerCase() && m.state === 'accepted') || email.trim().toLowerCase() === data.owner.email);
	async function copy() {
		if (!invited?.link) return;
		try {
			await navigator.clipboard.writeText(invited.link);
			copied = true;
			toast('✓ Link copied');
			setTimeout(() => (copied = false), 2000);
		} catch {
			/* select it by hand */
		}
	}
	const accepted = $derived(data.members.filter((m) => m.state === 'accepted'));
	const pending = $derived(data.members.filter((m) => m.state === 'pending' || m.state === 'expired'));
	const ROLE = { log: 'Can log care', view: 'Can view' } as const;
</script>

<svelte:head><title>Sharing · {data.tank.name} · Waterline</title></svelte:head>

<div class="page">
	<div class="phead hide-desk">
		<a class="back sub-back" href="/tanks/{data.tank.id}/settings">‹ Tank setup</a>
		<h1 class="title">Sharing</h1>
	</div>
	<p class="lede">Let someone help look after {data.tank.name}: a partner, a classroom helper, a fish-sitter. They see the tank beside their own. Only you can change setup and targets, or archive the tank.</p>

	<form method="POST" action="?/invite" class="invite" use:enhance={() => async ({ update }) => update({ reset: true })}>
		<h2 class="kicker">Invite</h2>
		<div class="invite-row">
			<div class="field grow">
				<label class="label" for="share-email">Email</label>
				<input class="input" id="share-email" name="email" type="email" bind:value={email} placeholder="name@example.com" autocomplete="off" aria-invalid={!!form?.inviteError} />
			</div>
			<div class="field">
				<label class="label" for="share-role">Role</label>
				<select class="input" id="share-role" name="role" value={form?.role ?? 'log'}>
					<option value="log">Can log care</option>
					<option value="view">Can view</option>
				</select>
			</div>
			<button class="btn btn-primary send" disabled={!valid || duplicate}>Send invite</button>
		</div>
		{#if form?.inviteError}<span class="error-text">✕ {form.inviteError}</span>{:else if email && duplicate}<span class="error-text">✕ They have access already.</span>{/if}
		<p class="help"><b>Can log</b> = tests, water changes, dosing, notes, photos and task done. <b>Can view</b> = read-only and no email.</p>
		{#if !data.emailOn}<span class="hint">Email isn't set up on this server, so you'll copy the link and send it yourself.</span>{/if}
		{#if !data.signupOpen}<span class="hint">▲ Sign-in is set to Only the admin, so someone not on this server yet can't sign in to accept. An admin can change that under Server settings › Sign-in.</span>{/if}
		{#if invited}
			<div class="sent" role="status">
				{#if invited.joined}
					<span class="sent-h">✓ {invited.email} has access now · the tank is in their list</span>
				{:else}
					<span class="sent-h">{invited.sent ? `✓ Invitation sent to ${invited.email}` : invited.error ? `✕ ${invited.error}` : `✓ Invite link for ${invited.email}`}</span>
					<div class="link-row">
						<input class="input mono" readonly value={invited.link ?? ''} aria-label="Invite link" onfocus={(e) => e.currentTarget.select()} />
						<button type="button" class="btn" onclick={copy}>{copied ? '✓ Copied' : 'Copy invite link'}</button>
					</div>
					<span class="hint">{invited.sent ? 'Or send them this link yourself. ' : ''}It works for {data.inviteDays} days, for their Google account with this address.</span>
				{/if}
			</div>
		{/if}
	</form>

	<section aria-labelledby="access-h">
		<h2 class="kicker" id="access-h">People with access · {accepted.length + 1}</h2>
		<ul class="list">
			<li class="person">
				<span class="avatar" aria-hidden="true">{(data.owner.name[0] ?? '?').toUpperCase()}</span>
				<div class="who"><span class="name">{data.owner.name} · you</span><span class="meta">{data.owner.email}</span></div>
				<span class="role-text">Owner</span>
				<span></span>
			</li>
			{#each accepted as m (m.id)}
				<li class="person">
					<span class="avatar" aria-hidden="true">{((m.name ?? m.email)[0] ?? '?').toUpperCase()}</span>
					<div class="who"><span class="name">{m.name ?? m.email}</span><span class="meta">{m.name ? m.email : `Joined · ${m.sent.toLowerCase()}`}</span></div>
					<form method="POST" action="?/role" use:enhance>
						<input type="hidden" name="id" value={m.id} />
						<label class="sr-only" for="role-{m.id}">Role for {m.email}</label>
						<select class="input role" id="role-{m.id}" name="role" value={m.role} onchange={(e) => e.currentTarget.form?.requestSubmit()}>
							<option value="log">Can log care</option>
							<option value="view">Can view</option>
						</select>
						<noscript><button class="btn">Save</button></noscript>
					</form>
					<form method="POST" action="?/remove" use:enhance>
						<input type="hidden" name="id" value={m.id} />
						<button class="btn-text danger">Remove<span class="sr-only"> {m.email}</span></button>
					</form>
				</li>
			{/each}
			{#each pending as m (m.id)}
				<li class="person pending">
					<span class="avatar" aria-hidden="true">?</span>
					<div class="who">
						<span class="name">{m.email}</span>
						<span class="meta">{m.state === 'expired' ? `✕ Invitation expired ${m.expires}` : `Invited ${m.sent.toLowerCase()} · hasn't joined yet · ${ROLE[m.role].toLowerCase()}`}</span>
					</div>
					<form method="POST" action="?/resend" use:enhance>
						<input type="hidden" name="id" value={m.id} />
						<button class="btn-text">{m.state === 'expired' ? 'Invite again' : 'Resend'}</button>
					</form>
					<form method="POST" action="?/remove" use:enhance>
						<input type="hidden" name="id" value={m.id} />
						<button class="btn-text danger">Cancel<span class="sr-only"> the invitation to {m.email}</span></button>
					</form>
				</li>
			{/each}
		</ul>
	</section>

	<form method="POST" action="?/routing" class="routing" use:enhance>
		<h2 class="kicker">Reminders & alerts</h2>
		<fieldset>
			<legend class="label">Task reminders go to</legend>
			<div class="segmented">
				<label><input type="radio" name="remindTo" value="all" checked={data.tank.remindTo === 'all'} />Everyone who can log</label>
				<label><input type="radio" name="remindTo" value="owner" checked={data.tank.remindTo === 'owner'} />Only me</label>
			</div>
			<span class="hint">Whoever marks a task done clears it for everyone.</span>
		</fieldset>
		<fieldset>
			<legend class="label">Out-of-range alerts go to</legend>
			<div class="segmented">
				<label><input type="radio" name="alertTo" value="all" checked={data.tank.alertTo === 'all'} />Everyone</label>
				<label><input type="radio" name="alertTo" value="owner" checked={data.tank.alertTo === 'owner'} />Only me</label>
			</div>
		</fieldset>
		<button class="btn btn-primary">Save</button>
	</form>
	<p class="hint">Once a tank is shared, History shows who logged each entry.</p>
</div>

<style>
	.page {
		padding: 8px 20px 32px;
		display: flex;
		flex-direction: column;
		gap: 24px;
		max-width: 880px;
	}
	.phead {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.title {
		margin: 0;
		font-size: 28px;
	}
	.lede,
	.help {
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
	/* the Invite box: a 2px ink border (README § 13) */
	.invite {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px;
		border: 2px solid var(--ink);
	}
	.invite .kicker {
		border-bottom: none;
		padding-bottom: 0;
	}
	.invite-row {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: flex-end;
	}
	.grow {
		flex: 1 1 220px;
	}
	.invite-row .input {
		min-height: 44px;
	}
	.send {
		min-height: 44px;
	}
	.sent {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 10px;
		border-top: 1px solid var(--divider);
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
	/* rows 36px 1fr 170px 90px */
	.person {
		display: grid;
		grid-template-columns: 36px minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 8px 12px;
		min-height: 56px;
		padding: 8px 0;
		border-bottom: 1px solid var(--divider);
	}
	.avatar {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--ink);
		color: var(--bg);
		font-weight: 800;
	}
	.pending .avatar {
		background: var(--neutral-300);
		color: var(--text-muted);
	}
	.who {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.name {
		font-size: 15px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.meta {
		font-size: 12px;
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}
	.role-text {
		font-size: 13px;
		color: var(--text-muted);
	}
	.role {
		min-height: 44px;
		width: auto;
	}
	.person .btn-text {
		min-height: 44px;
		padding: 0;
		font-size: 14px;
	}
	.danger {
		color: var(--accent-text);
	}
	.routing {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.routing fieldset {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.routing .segmented {
		max-width: 420px;
	}
	.routing .btn {
		align-self: flex-start;
		min-height: 44px;
	}
	@media (max-width: 599px) {
		.person {
			grid-template-columns: 36px minmax(0, 1fr);
		}
		.person > form,
		.role-text {
			grid-column: 2;
		}
	}
	@media (min-width: 1024px) {
		.page {
			padding: 24px 32px 48px;
		}
	}
</style>
