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
		<span class="brand"><Logo size={28} wordmark wordSize={18} /></span>
		<span class="kicker">A new server</span>
		<h1>Set up Waterline</h1>
		<p>This server has no admin yet. Enter the setup code from its log, then choose the admin login.</p>
	</div>

	<form method="POST" class="form">
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
		<div class="pair">
			<div class="field">
				<label class="label" for="password">Password</label>
				<input class="input" id="password" name="password" type="password" autocomplete="new-password" minlength="12" required aria-invalid={!!errors.password} aria-describedby="pw-hint" />
				<span class="hint" id="pw-hint">At least 12 characters. A few words with spaces between them works well.</span>
				{#if errors.password}<span class="error-text">✕ {errors.password}</span>{/if}
			</div>
			<div class="field">
				<label class="label" for="confirm">Password again</label>
				<input class="input" id="confirm" name="confirm" type="password" autocomplete="new-password" required aria-invalid={!!errors.confirm} />
				{#if errors.confirm}<span class="error-text">✕ {errors.confirm}</span>{/if}
			</div>
		</div>
		<button class="btn btn-primary btn-lg go">Create admin login</button>
		<p class="after">Next: Google sign-in, email and who can sign in are in Settings › Server settings.</p>
	</form>
</div>

<style>
	.wrap {
		min-height: 100dvh;
		max-width: 560px;
		margin: 0 auto;
		padding: env(safe-area-inset-top) 20px calc(32px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.hero {
		padding-top: 32px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.brand {
		display: inline-flex;
		margin-bottom: 12px;
	}
	h1 {
		margin: 0;
		font-size: 36px;
		letter-spacing: -0.02em;
	}
	.hero p {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
		max-width: 460px;
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding-top: 18px;
		border-top: 2px solid var(--ink);
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.hint {
		font-size: 13px;
		line-height: 1.4;
		color: var(--text-muted);
	}
	.go {
		margin-top: 4px;
	}
	.after {
		margin: 0;
		font-size: 13px;
		line-height: 1.4;
		color: var(--text-muted);
	}
	@media (max-width: 479px) {
		.pair {
			grid-template-columns: 1fr;
		}
	}
	@media (min-width: 1024px) {
		.hero {
			padding-top: 64px;
		}
		h1 {
			font-size: 42px;
		}
		.go {
			width: auto;
			align-self: flex-start;
			padding: 0 24px;
		}
	}
</style>
