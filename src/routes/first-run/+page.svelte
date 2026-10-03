<script lang="ts">
	// A new server's first page: the setup code from the server's log proves this
	// is its owner, who then chooses the admin login. Works without scripts.
	import Logo from '$lib/components/Logo.svelte';
	let { form } = $props();
	const errors = $derived((form?.errors ?? {}) as Record<string, string>);
</script>

<svelte:head><title>Set up Waterline</title></svelte:head>

<div class="wrap">
	<div class="hero">
		<Logo size={64} />
		<h1>Set up Waterline</h1>
		<p>This server has no admin yet. Enter the setup code from its log, then choose the admin login.</p>
	</div>

	<form method="POST" class="card">
		<div class="field">
			<label class="label" for="code">Setup code</label>
			<input
				class="input mono"
				id="code"
				name="code"
				value={form?.values?.code ?? ''}
				placeholder="ABCD-EFGH"
				autocomplete="off"
				autocapitalize="characters"
				spellcheck="false"
				required
				aria-invalid={!!errors.code}
				aria-describedby="code-hint"
			/>
			<span class="hint" id="code-hint">In the server's log (on Unraid: Docker › Waterline › Logs), and in setup-code.txt in its data folder.</span>
			{#if errors.code}<span class="error-text">✕ {errors.code}</span>{/if}
		</div>
		<div class="field">
			<label class="label" for="username">Admin username</label>
			<input class="input" id="username" name="username" value={form?.values?.username ?? 'admin'} autocomplete="username" autocapitalize="off" spellcheck="false" aria-invalid={!!errors.username} />
			{#if errors.username}<span class="error-text">✕ {errors.username}</span>{/if}
		</div>
		<div class="field">
			<label class="label" for="password">Password</label>
			<input class="input" id="password" name="password" type="password" autocomplete="new-password" minlength="8" required aria-invalid={!!errors.password} aria-describedby="pw-hint" />
			<span class="hint" id="pw-hint">At least 8 characters.</span>
			{#if errors.password}<span class="error-text">✕ {errors.password}</span>{/if}
		</div>
		<div class="field">
			<label class="label" for="confirm">Password again</label>
			<input class="input" id="confirm" name="confirm" type="password" autocomplete="new-password" required aria-invalid={!!errors.confirm} />
			{#if errors.confirm}<span class="error-text">✕ {errors.confirm}</span>{/if}
		</div>
		<button class="btn btn-primary go">Create admin login</button>
		<p class="after">Next: Google sign-in, email and who can sign in are in Settings › Server settings.</p>
	</form>
</div>

<style>
	.wrap {
		min-height: 100dvh;
		max-width: 440px;
		margin: 0 auto;
		padding: env(safe-area-inset-top) 20px calc(32px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.hero {
		padding-top: 48px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		text-align: center;
	}
	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
	}
	.hero p {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
		color: var(--text-muted);
		max-width: 320px;
	}
	.card {
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		border-radius: 0;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.hint {
		font-size: 13px;
		line-height: 1.4;
		color: var(--text-faint);
	}
	.go {
		height: 52px;
		border-radius: 0;
		font-size: 16px;
	}
	.after {
		margin: 0;
		font-size: 13px;
		line-height: 1.4;
		color: var(--text-muted);
		text-align: center;
	}
</style>
