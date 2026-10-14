<script lang="ts">
	// Sensors & controllers (#19): a token for a probe or controller, the readings
	// it may add and to which tanks, examples for curl, ESPHome and Home
	// Assistant, devices Waterline reads itself from their own web page, and
	// what's come in.
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
	// the tank the examples carry: one picked here (while the token it was picked beside is
	// still the one shown), else the token just made's first tank, else the server's choice
	let picked = $state<{ token: string | null; tankId: string } | null>(null);
	const tankId = $derived((picked?.token === (created?.id ?? null) ? picked?.tankId : null) || created?.tankId || data.exampleTank || '<tank id>');
	const tankName = $derived(data.tanks.find((t) => t.id === tankId)?.name ?? null);
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
	// a device read from its own web page: what Find sensors turned up, and the forms' slips
	const found = $derived(form?.found ?? null);
	const findErr = $derived<Record<string, string>>(form?.find?.errors ?? {});
	const addErr = $derived<Record<string, string>>(form?.add?.errors ?? {});
	const findTank = $derived(form?.find?.tankId || found?.tankId || data.exampleTank || data.tanks[0]?.id || '');
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
			Charts and show as Live on the tank, but they never raise an out-of-range alert by themselves. To make a sensor the tank's reading for a parameter, graded and alerted on like a test, turn on "The sensor's reading is the reading" under <a href="/tanks/current/targets">Parameters & targets</a>. One reading a minute per parameter is kept; anything faster is dropped.
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
		{#if tankName}
			<div class="for">
				<span class="label" id="for-h">Examples for</span>
				{#if data.tanks.length > 1}
					<div class="chips" role="group" aria-labelledby="for-h">
						{#each data.tanks as t (t.id)}
							<a
								class="chip"
								class:selected={t.id === tankId}
								aria-current={t.id === tankId ? 'true' : undefined}
								href="?for={t.id}"
								onclick={(e) => {
									e.preventDefault();
									picked = { token: created?.id ?? null, tankId: t.id };
								}}>{t.name}</a
							>
						{/each}
					</div>
				{:else}
					<span class="for-name">{tankName}</span>
				{/if}
			</div>
		{/if}
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

	{#if data.polling}
		<section aria-labelledby="dev-h" class="block">
			<h2 id="dev-h" class="kicker">Read directly · {data.devices.length}</h2>
			<p class="small">
				A device with its own web page, like an Apollo probe or anything else running ESPHome with its web server on, needs no token: Waterline asks it for its readings itself, every 5 minutes. The two have to share a network, so this server can reach the device's address.
			</p>
			{#if data.devices.length}
				<ul class="list">
					{#each data.devices as d (d.id)}
						<li>
							<div class="item">
								<div class="t">
									<span class="name">{d.name} <span class="mono hint-code">{d.url}</span></span>
									<span class="meta">Reads {d.reads} into {d.tankName}</span>
									<span class="meta status-{d.level}">{d.status}</span>
								</div>
								<div class="acts">
									<form method="POST" action="?/pollNow" use:enhance>
										<input type="hidden" name="id" value={d.id} />
										<button class="btn-text">Read now<span class="sr-only"> {d.name}</span></button>
									</form>
									<button type="button" class="btn btn-danger" popovertarget="remove-{d.id}">Remove<span class="sr-only"> {d.name}</span></button>
								</div>
							</div>
							<ConfirmDelete id="remove-{d.id}" trigger={false} title="Stop reading {d.name}?" body="Waterline stops asking it for readings. The readings already in stay." action="?/removeDevice" label="Remove" fields={{ id: d.id }} />
						</li>
					{/each}
				</ul>
			{:else}
				<p class="none">No device is read directly yet.</p>
			{/if}
		</section>

		<form method="POST" action="?/find" class="block" use:enhance aria-labelledby="find-h">
			<h2 id="find-h" class="kicker">Read a device</h2>
			<div class="field">
				<label class="label" for="d-url">Device address</label>
				<input class="input mono" id="d-url" name="url" inputmode="url" autocomplete="off" placeholder="192.168.1.33" value={form?.find?.url ?? ''} aria-invalid={!!findErr.url} aria-describedby={findErr.url ? 'd-url-e' : undefined} />
				{#if findErr.url}<span class="error-text" id="d-url-e">✕ {findErr.url}</span>{/if}
			</div>
			<fieldset class="tanks" aria-describedby={findErr.tank ? 'd-tank-e' : undefined}>
				<legend class="label">Tank it reads into</legend>
				<div class="checks">
					{#each data.tanks as t (t.id)}
						<label class="check-row"><input type="radio" name="tank" value={t.id} checked={t.id === findTank} /><span>{t.name}</span></label>
					{/each}
				</div>
				{#if findErr.tank}<span class="error-text" id="d-tank-e">✕ {findErr.tank}</span>{/if}
			</fieldset>
			<details class="signin" open={!!form?.find?.username}>
				<summary>The device asks for a sign-in</summary>
				<div class="field">
					<label class="label" for="d-user">Username</label>
					<input class="input" id="d-user" name="username" autocomplete="off" value={form?.find?.username ?? ''} />
				</div>
				<div class="field">
					<label class="label" for="d-pass">Password</label>
					<input class="input" id="d-pass" name="password" type="password" autocomplete="off" />
				</div>
			</details>
			<button class="btn btn-primary go">Find sensors</button>
		</form>

		{#if found}
			<form method="POST" action="?/addDevice" class="block found" use:enhance aria-labelledby="found-h">
				<h2 id="found-h" class="kicker">✓ Found {found.title ?? found.url} · {found.sensors.length} sensor{found.sensors.length === 1 ? '' : 's'}</h2>
				<input type="hidden" name="tank" value={found.tankId} />
				<input type="hidden" name="url" value={found.url} />
				<input type="hidden" name="title" value={found.title ?? ''} />
				<input type="hidden" name="auth" value={found.auth} />
				<div class="field">
					<label class="label" for="d-name">Name</label>
					<input class="input" id="d-name" name="name" maxlength="60" value={found.name} aria-invalid={!!addErr.name} aria-describedby={addErr.name ? 'd-name-e' : undefined} />
					{#if addErr.name}<span class="error-text" id="d-name-e">✕ {addErr.name}</span>{/if}
				</div>
				<fieldset class="sensors" aria-describedby={addErr.sensors ? 'd-sensors-e' : undefined}>
					<legend class="label">Sensors to read into {found.tankName}, and which parameter each one is</legend>
					<ul class="sensor-list">
						{#each found.sensors as s (s.objectId)}
							<li class="sensor-row">
								<input type="hidden" name="all" value={s.objectId} />
								<input type="hidden" name="name-{s.objectId}" value={s.name} />
								<input type="hidden" name="unit-{s.objectId}" value={s.unit ?? ''} />
								<input type="hidden" name="state-{s.objectId}" value={s.state} />
								<label class="check-row"><input type="checkbox" name="sensor" value={s.objectId} checked={s.checked} /><span>{s.name} <span class="mono hint-code">{s.state}</span></span></label>
								<label class="sr-only" for="p-{s.objectId}">Parameter for {s.name}</label>
								<select class="input" id="p-{s.objectId}" name="param-{s.objectId}">
									<option value="">Which parameter?</option>
									{#each found.params as p (p.label)}
										<option value={p.label} selected={p.label === s.guess}>{p.name}</option>
									{/each}
								</select>
							</li>
						{/each}
					</ul>
					<p class="small">A sensor with no value now (NA) is left unticked; the board's own temperature and humidity too.</p>
					{#if addErr.sensors}<span class="error-text" id="d-sensors-e">✕ {addErr.sensors}</span>{/if}
				</fieldset>
				<button class="btn btn-primary go">Start reading</button>
			</form>
		{/if}
	{/if}

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
	/* which tank's id the examples carry: a chip per tank, or the one tank's name */
	.for {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.for-name {
		font-size: 14px;
		font-weight: 800;
	}
	/* a device's sensors, each with the parameter it feeds */
	.sensors {
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	.sensor-list {
		list-style: none;
		margin: 8px 0 0;
		padding: 0;
	}
	.sensor-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		padding: 6px 0;
		border-bottom: 1px solid var(--divider);
	}
	.sensor-row .check-row {
		flex: 1;
		min-width: 200px;
	}
	.sensor-row select {
		width: auto;
		min-width: 200px;
	}
	.signin summary {
		cursor: pointer;
		font-size: 14px;
	}
	.signin .field {
		margin-top: 12px;
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
