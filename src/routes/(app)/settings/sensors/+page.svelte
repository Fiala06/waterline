<script lang="ts">
	// Sensors & controllers (#19): a token for a probe or controller, the readings
	// it may add and to which tanks, examples for curl, ESPHome and Home
	// Assistant, and what's come in.
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import ConfirmDelete from '$lib/components/ConfirmDelete.svelte';
	import { fmtWhen } from '$lib/time';
	let { data, form } = $props();

	const tz = $derived(data.user.timeZone);
	const created = $derived(form?.created ?? null);
	const createErr = $derived<Record<string, string>>(form?.create?.errors ?? {});
	const createPicked = $derived(new Set<string>(form?.create?.tankIds ?? data.tanks.slice(0, 1).map((t) => t.id)));
	let editing = $state<string | null>(untrack(() => form?.edit?.id ?? data.edit ?? null));
	const editErr = $derived<Record<string, string>>(form?.edit?.errors ?? {});
	let copied = $state('');
	async function copy(what: string, text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = what;
			setTimeout(() => (copied = ''), 2000);
		} catch {
			/* the field can still be selected */
		}
	}
	const token = $derived(created?.token ?? '<your token>');
	const tankId = $derived(created?.tankId || data.tanks[0]?.id || '<tank id>');
	const curl = $derived(`curl -X POST ${data.apiUrl}/tanks/${tankId}/readings \\
  -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" \\
  -d '{"parameter":"temp","value":25.4,"unit":"°C"}'`);
	const ha = $derived(`rest_command:
  waterline_temp:
    url: "${data.apiUrl}/tanks/${tankId}/readings"
    method: POST
    headers:
      Authorization: "Bearer ${token}"
      Content-Type: application/json
    payload: '{"parameter":"temp","value":{{ states("sensor.tank_temperature") }},"unit":"°C"}'`);
	const esphome = $derived(`http_request:
  useragent: esphome
sensor:
  - platform: dallas_temp
    name: Tank temperature
    update_interval: 5min
    on_value:
      then:
        - http_request.post:
            url: "${data.apiUrl}/tanks/${tankId}/readings"
            headers:
              Authorization: "Bearer ${token}"
              Content-Type: application/json
            body: !lambda 'return "{\\"parameter\\":\\"temp\\",\\"value\\":" + to_string(x) + ",\\"unit\\":\\"°C\\"}";'`);
	const tankList = (names: string[]) => (names.length ? names.join(', ') : 'No tanks');
</script>

<svelte:head><title>Sensors · Settings · Waterline</title></svelte:head>

{#snippet tankChecks(prefix: string, picked: Set<string>, err: string | undefined)}
	<fieldset class="tanks" aria-describedby={err ? `${prefix}-tanks-e` : undefined}>
		<legend class="label">Tanks it can add readings to</legend>
		<div class="checks">
			{#each data.tanks as t (t.id)}
				<label class="check-row"><input type="checkbox" name="tank" value={t.id} checked={picked.has(t.id)} /><span>{t.name}</span></label>
			{/each}
		</div>
		{#if err}<span class="error-text" id="{prefix}-tanks-e">✕ {err}</span>{/if}
	</fieldset>
{/snippet}

{#snippet copyField(id: string, label: string, text: string, pre = false)}
	<div class="field">
		<div class="label-row copy-row">
			<span class="label">{label}</span>
			<button type="button" class="btn-text copy" onclick={() => copy(id, text)}>{copied === id ? '✓ Copied' : 'Copy'}<span class="sr-only"> {label}</span></button>
		</div>
		<code class="code mono" class:pre {id}>{text}</code>
	</div>
{/snippet}

<div class="page sub-page">
	<div class="head">
		<a class="back sub-back" href="/settings">‹ Settings</a>
		<h1>Sensors & controllers</h1>
		<p class="lede">
			Let a temperature probe, an Apex or HYDROS, ESPHome, Node-RED or Home Assistant log readings on its own. A sensor token can only add readings to the tanks you pick, nothing else. Readings from sensors are kept apart from your water tests: they draw as a thin line on
			Charts and show as Live on the tank, but they never raise an out-of-range alert by themselves. One reading a minute per parameter is kept; anything faster is dropped.
		</p>
	</div>

	{#if created}
		<section class="made" aria-labelledby="made-h">
			<h2 id="made-h">✓ Sensor token for {created.name}</h2>
			<p class="warn-text status-warn">▲ Copy it now: it's shown only this once.</p>
			{@render copyField('made-token', 'Sensor token', created.token)}
		</section>
	{/if}

	<section aria-labelledby="list-h" class="block">
		<h2 id="list-h" class="kicker">Connected · {data.tokens.length}</h2>
		{#if data.tokens.length}
			<ul class="list">
				{#each data.tokens as t (t.id)}
					<li>
						<div class="item">
							<div class="t">
								<span class="name">{t.name} <span class="mono hint-code">…{t.hint}</span></span>
								<span class="meta">Adds readings to {tankList(t.tankNames)}</span>
								<span class="meta">Made {fmtWhen(t.createdAt, tz)} · {t.lastUsedAt ? `Last heard ${fmtWhen(t.lastUsedAt, tz)}` : 'Nothing received yet'}</span>
							</div>
							<div class="acts">
								<a
									class="btn-text"
									href="?edit={t.id}"
									aria-expanded={editing === t.id}
									onclick={(e) => {
										e.preventDefault();
										editing = editing === t.id ? null : t.id;
									}}>Tanks<span class="sr-only"> {t.name} can add readings to</span></a
								>
								<button type="button" class="btn btn-danger" popovertarget="revoke-{t.id}">Revoke<span class="sr-only"> {t.name}</span></button>
							</div>
						</div>
						{#if editing === t.id}
							<form
								method="POST"
								action="?/tanks"
								class="edit"
								use:enhance={() =>
									async ({ result, update }) => {
										if (result.type === 'redirect') editing = null;
										await update();
									}}
							>
								<input type="hidden" name="id" value={t.id} />
								{@render tankChecks(`e-${t.id}`, new Set(t.tankIds), form?.edit?.id === t.id ? editErr.tanks : undefined)}
								<div class="edit-acts">
									<a class="btn" href="/settings/sensors" onclick={(e) => (e.preventDefault(), (editing = null))}>Cancel</a>
									<button class="btn btn-primary">Save</button>
								</div>
							</form>
						{/if}
						<ConfirmDelete id="revoke-{t.id}" trigger={false} title="Revoke {t.name}'s token?" body="It stops sending readings straight away. Readings already received stay." action="?/revoke" label="Revoke" fields={{ id: t.id }} />
					</li>
				{/each}
			</ul>
		{:else}
			<p class="none">No sensor connected. Nothing can add readings until you make a token.</p>
		{/if}
	</section>

	<form method="POST" action="?/create" class="block create" id="create" use:enhance>
		<h2 class="kicker">New sensor token</h2>
		<div class="field">
			<label class="label" for="s-name">Device</label>
			<input class="input" id="s-name" name="name" maxlength="60" value={form?.create?.name ?? ''} placeholder="e.g. Apex, ESPHome, Home Assistant" autocomplete="off" aria-invalid={!!createErr.name} />
			{#if createErr.name}<span class="error-text">✕ {createErr.name}</span>{/if}
		</div>
		{@render tankChecks('c', createPicked, createErr.tanks)}
		<button class="btn btn-primary go">Create sensor token</button>
	</form>

	<section class="block how" aria-labelledby="how-h">
		<h2 id="how-h" class="kicker">Sending readings</h2>
		<p class="small">
			POST JSON to <code class="mono">{data.apiUrl}/tanks/&lt;tank id&gt;/readings</code> with the token as <code class="mono">Authorization: Bearer</code>. One reading, or <code class="mono">{'{"readings": [...]}'}</code> for several. Each has <code class="mono">parameter</code> (temp, ph, nh3, no2, no3, gh, kh, or a parameter's name), <code class="mono">value</code>, and optionally <code class="mono">unit</code> (°F and ppm are converted) and <code class="mono">at</code> (ISO 8601; now when left out). The tank id is in the address of its pages.
		</p>
		{@render copyField('how-curl', 'curl', curl, true)}
		<details>
			<summary>Home Assistant</summary>
			{@render copyField('how-ha', 'configuration.yaml · a rest_command to call from an automation', ha, true)}
		</details>
		<details>
			<summary>ESPHome</summary>
			{@render copyField('how-esp', 'A temperature probe posting every 5 minutes', esphome, true)}
		</details>
	</section>

	{#each data.incoming.filter((t) => t.count) as t (t.id)}
		<section class="block" aria-labelledby="in-{t.id}">
			<h2 id="in-{t.id}" class="kicker">{t.name} · {t.count} reading{t.count === 1 ? '' : 's'}{t.since ? ` since ${t.since.toLowerCase()}` : ''}</h2>
			<ul class="latest">
				{#each t.latest as l (l.key)}
					<li><span class="l-name">{l.name}</span><span class="l-val num">{l.value}</span><span class="l-meta">{l.at} · {l.source}</span></li>
				{/each}
			</ul>
		</section>
	{/each}
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
	.lede,
	.small {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-2);
	}
	.lede {
		max-width: 680px;
	}
	.kicker {
		margin: 0;
		padding-bottom: 6px;
		border-bottom: 2px solid var(--ink);
		font-weight: 800;
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.made {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 14px;
		border: 2px solid var(--ink);
	}
	.made h2 {
		margin: 0;
		font-size: 17px;
	}
	.warn-text {
		margin: 0;
		font-size: 14px;
		font-weight: 700;
	}
	.copy-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.copy {
		min-height: 32px;
		padding: 0;
		font-size: 13px;
	}
	.code {
		display: block;
		padding: 10px 12px;
		background: var(--surface);
		border: 1px solid var(--divider);
		font-size: 13px;
		overflow-wrap: anywhere;
		user-select: all;
	}
	.code.pre {
		white-space: pre-wrap;
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
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		padding: 10px 0;
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
		font-weight: 700;
	}
	.hint-code {
		font-size: 12px;
		font-weight: 400;
		color: var(--text-muted);
	}
	.meta {
		font-size: 12px;
		color: var(--text-muted);
	}
	.acts {
		display: flex;
		gap: 12px;
		align-items: center;
	}
	.acts .btn-text {
		min-height: 44px;
		padding: 0;
		font-size: 14px;
	}
	.none {
		margin: 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	.tanks {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.checks {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 16px;
	}
	.edit {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 4px 0 14px;
	}
	.edit-acts {
		display: flex;
		gap: 10px;
		justify-content: flex-end;
	}
	.create .input {
		min-height: 44px;
	}
	.go {
		align-self: flex-start;
		min-height: 44px;
	}
	details summary {
		min-height: 44px;
		display: flex;
		align-items: center;
		font-weight: 700;
		cursor: pointer;
	}
	.latest {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.latest li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 2px 12px;
		align-items: baseline;
		min-height: 44px;
		padding: 6px 0;
		border-bottom: 1px solid var(--divider);
		font-size: 14px;
	}
	.l-name {
		font-weight: 700;
	}
	.l-val {
		font-size: 17px;
		font-weight: 800;
	}
	.l-meta {
		grid-column: 1 / -1;
		font-size: 12px;
		color: var(--text-muted);
	}
</style>
