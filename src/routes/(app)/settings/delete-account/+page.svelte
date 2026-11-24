<script lang="ts">
	// Settings › Data › Delete account (#303). What goes, what stays, a backup
	// first; then a recent sign-in and the email address typed out. Once it's
	// done, this device's offline pages and waiting entries go too.
	import { enhance } from '$app/forms';
	import { forgetDevice } from '$lib/offline';
	import { refusal } from '$lib/forms';
	let { data, form } = $props();
	// a refused delete (#269): not signed in recently (the whole form), or the email typed wrong
	const refused = $derived(refusal(form, 'delete'));
	const deleteError = $derived(refused.message || refused.errors.email || '');
	const f = $derived(data.footprint);
	const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
	let busy = $state(false);
</script>

<svelte:head><title>Delete account · Settings · Waterline</title></svelte:head>

<div class="page sub-page del">
	<div class="head">
		<a class="back sub-back" href="/settings#data">‹ Settings</a>
		<h1>Delete your account</h1>
		<p class="lede">This can't be undone. <a href="/settings/export">Download a full backup</a> first if you might want any of it.</p>
	</div>

	<section aria-labelledby="goes-h">
		<h2 id="goes-h" class="kicker rule">What's deleted</h2>
		<ul class="list">
			<li>
				<b>{f.tanks ? `Your ${n(f.tanks, 'tank')}` : 'Your tanks'}</b>, with every test, History entry, task, livestock, plant, piece of equipment, expense and
				{f.photos ? n(f.photos, 'photo') : 'photo'}, and their receipts.
			</li>
			{#if f.sharedWith}
				<li><b>{n(f.sharedWith, 'person', 'people')}</b> you share those tanks with lose them too.</li>
			{/if}
			<li>Your settings, products, favorites, test kits, sensor and AI assistant tokens, calendar link, push devices, and the backups you've built.</li>
			<li>Links in emails Waterline sent you stop working.</li>
		</ul>
	</section>

	<section aria-labelledby="stays-h">
		<h2 id="stays-h" class="kicker rule">What stays</h2>
		<ul class="list">
			{#if f.member}
				<li>
					You leave the <b>{n(f.member, 'tank')} someone shares with you</b>. They stay theirs, with the entries you logged on them.
				</li>
			{/if}
			<li>The server's own backups, if its admin keeps any, may hold a copy until they're replaced.</li>
			<li>Signing in again later, if this server still lets you in, starts a new, empty account.</li>
		</ul>
	</section>

	{#if data.lastAdmin}
		<p class="banner banner-bad" role="alert">
			✕ You're the server's only admin. Make someone else an admin in <a href="/settings/server/people">Server settings › People</a> first.
		</p>
	{:else if !data.recent}
		<!-- a recent sign-in: the person at the screen is the account's owner -->
		<form method="POST" action="/settings?/signout" class="confirm">
			<input type="hidden" name="redirectTo" value="/signin?redirectTo=%2Fsettings%2Fdelete-account" />
			<p>To delete your account, sign in again first: it needs a sign-in from the last {data.minutes} minutes.</p>
			<button class="btn">Sign out and sign in again</button>
		</form>
	{:else}
		<form
			method="POST"
			class="confirm"
			use:enhance={() => {
				busy = true;
				return async ({ result, update }) => {
					// gone: this device's offline copies go too, then the sign-in page
					if (result.type === 'redirect') await forgetDevice();
					await update();
					busy = false;
				};
			}}
		>
			<label class="label" for="del-email">To confirm, type your email address: <b>{data.user.email}</b></label>
			<input
				class="input"
				id="del-email"
				name="email"
				type="email"
				autocomplete="off"
				spellcheck="false"
				value={String(refused.values.email ?? '')}
				aria-invalid={!!deleteError}
				aria-describedby={deleteError ? 'del-err' : undefined}
			/>
			{#if deleteError}<p class="error-text" id="del-err" role="alert">✕ {deleteError}</p>{/if}
			<button class="btn btn-danger" disabled={busy}>Delete my account</button>
		</form>
	{/if}
</div>

<style>
	.del {
		display: flex;
		flex-direction: column;
		gap: 24px;
		max-width: 640px;
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
	}
	.rule {
		display: block;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		color: var(--text);
	}
	h2 {
		margin: 0;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.list li {
		padding: 10px 0;
		border-bottom: 1px solid var(--divider);
		font-size: 14px;
		line-height: 1.5;
	}
	.confirm {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
	}
	.confirm p {
		margin: 0;
	}
	.confirm .input {
		width: 100%;
	}
	a {
		text-decoration: underline;
	}
</style>
