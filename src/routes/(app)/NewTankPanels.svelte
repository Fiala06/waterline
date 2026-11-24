<script lang="ts">
	// A new tank's panels on the dashboard (#362: out of the dashboard): the ask
	// when a new tank's readings look like a cycle (#68), the cycle itself, and
	// Getting started (#82), ticked off from the tank's data.
	import { enhance } from '$app/forms';
	import ReminderDelivery from '$lib/components/ReminderDelivery.svelte';
	import Sparkline from '$lib/components/Sparkline.svelte';
	import type { PageData } from './$types';

	let { tankId, askCycling, cycling, checklist }: { tankId: string; askCycling: PageData['askCycling']; cycling: PageData['cycling']; checklist: PageData['checklist'] } = $props();
</script>

{#if askCycling}
	<!-- a new tank with ammonia or nitrite over target that isn't marked cycling: it probably is (#68) -->
	<section class="ask-cycling banner banner-warn" aria-labelledby="ask-cycling-h">
		<p>
			<b id="ask-cycling-h">New tank? High ammonia or nitrite is normal while it cycles.</b>
			Mark it as cycling and they read ▲ Cycling, with the cycle followed here until it’s done.
		</p>
		<form method="POST" action="?/markCycling" use:enhance>
			<input type="hidden" name="tankId" value={tankId} />
			<button class="btn btn-primary">Mark as cycling</button>
			<!-- an established tank with a spike: the ask goes and stays gone (#155) -->
			<button class="btn" formaction="?/dismissCyclingAsk">Not cycling</button>
		</form>
	</section>
{/if}

{#if cycling}
	<!-- ── Cycling: ammonia, nitrite and nitrate side by side, and where the cycle is ── -->
	<section class="cycling" aria-labelledby="cycling-h">
		<div class="section-head">
			<h2 id="cycling-h">Cycling</h2>
			<a href="/tanks/{tankId}/settings">Tank setup ›</a>
		</div>
		<p class="cycle-about">
			Bacteria in the filter turn fish waste’s ammonia into nitrite, then nitrite into the far safer nitrate. It
			often takes 4–8 weeks. Your readings show what was in the water on the day you tested; they can’t say on their
			own when the tank is ready for fish.
		</p>
		<div class="cycle-charts">
			{#each cycling.charts as c (c.key)}
				<a class="cycle-chart" href="/charts{c.id ? `?p=${c.id}` : ''}" title="{c.name} over the last 8 weeks">
					<span class="cc-name">{c.name}</span>
					<span class="cc-value">{#if c.value != null}{c.value}{#if c.unit}<span class="cc-unit">{c.unit}</span>{/if}{:else}<span class="cc-none">–</span>{/if}</span>
					<span class="cc-spark">{#if c.values.length}<Sparkline values={c.values} level="ok" lo={c.lo} hi={c.hi} />{/if}</span>
					<span class="cc-when">{c.when ?? 'Not tested'}</span>
				</a>
			{/each}
		</div>
		<div class="cycle-foot">
			<p class="stage">{cycling.text}</p>
			<form method="POST" action="?/markRunning" use:enhance>
				<input type="hidden" name="tankId" value={tankId} />
				<button class="btn">Mark as running</button>
			</form>
		</div>
	</section>
{/if}

{#if checklist}
	{@const c = checklist}
	<!-- ── Getting started (#82): what to do after making the tank, ticked off from its data ── -->
	<section class="start" aria-labelledby="start-h">
		<div class="section-head">
			<h2 id="start-h">Getting started</h2>
			<span class="meta">{c.done} of {c.steps.length} done</span>
		</div>
		{#if c.allDone}
			<p class="start-about"><b>✓ All set up.</b> From here it's logging: tests, water changes and the odd photo.</p>
		{:else if c.cycling}
			<p class="start-about">The tank is cycling: test ammonia, nitrite and nitrate every few days and log each one, so the cycle above shows where it is.</p>
		{/if}
		<ol class="steps">
			{#each c.steps as s (s.key)}
				<li class:done={s.done}>
					<a href={s.href}>
						<span class="step-status" class:status-ok={s.done}><span aria-hidden="true">{s.done ? '✓' : '–'}</span> {s.done ? 'Done' : 'To do'}</span>
						<span class="step-text"><span class="step-title">{s.title}</span><span class="step-detail">{s.detail}</span></span>
						<span class="chev" aria-hidden="true">›</span>
					</a>
					{#if s.key === 'water' && c.reminder}
						<!-- how the reminder will reach the keeper (#310) -->
						<div class="step-delivery"><ReminderDelivery delivery={c.reminder.delivery} devices={c.reminder.devices} /></div>
					{/if}
				</li>
			{/each}
		</ol>
		<form class="start-foot" method="POST" action="?/hideChecklist" use:enhance>
			<input type="hidden" name="tankId" value={tankId} />
			<button class="btn" class:btn-primary={c.allDone}>{c.allDone ? 'Done' : 'Hide checklist'}</button>
			<span class="hint">Tank setup brings it back.</span>
		</form>
	</section>
{/if}

<style>
	.chev {
		font-size: 18px;
		color: var(--text-muted);
	}
	/* Cycling: three small charts side by side under the rule, then the stage and Mark as running */
	.cycling {
		display: flex;
		flex-direction: column;
		padding: 18px 0 8px;
	}
	/* Getting started (#82): a heading, then the steps as rows with 1px dividers */
	.start {
		display: flex;
		flex-direction: column;
		padding: 18px 0 8px;
	}
	.start-about {
		margin: 0 0 6px;
		font-size: 14px;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.start-about b {
		color: var(--text);
	}
	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.steps li {
		border-bottom: 1px solid var(--divider);
	}
	/* under the water-change step, lined up with its text (#310) */
	.step-delivery {
		padding: 0 28px 12px 76px;
	}
	@media (max-width: 599px) {
		.step-delivery {
			padding-left: 0;
			padding-right: 0;
		}
	}
	.steps a {
		display: grid;
		grid-template-columns: 64px minmax(0, 1fr) 16px;
		align-items: center;
		column-gap: 12px;
		min-height: 44px;
		padding: 10px 0;
		color: inherit;
		text-decoration: none;
	}
	.step-status {
		font-size: 12px;
		font-weight: 800;
		color: var(--text-muted);
	}
	.step-status.status-ok {
		color: var(--ok-text, var(--text));
	}
	.step-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.step-title {
		font-size: 15px;
		font-weight: 700;
	}
	.done .step-title {
		font-weight: 400;
		color: var(--text-muted);
	}
	.step-detail {
		font-size: 13px;
		line-height: 1.4;
		color: var(--text-muted);
	}
	.done .step-detail {
		display: none;
	}
	.steps .chev {
		color: var(--text-faint);
		font-size: 18px;
	}
	.start-foot {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 0 4px;
	}
	.start-foot .hint {
		font-size: 13px;
		color: var(--text-muted);
	}
	.cycle-about {
		margin: 0 0 14px;
		font-size: 14px;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.ask-cycling {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin: 16px 0 0;
		font-weight: 400;
	}
	.ask-cycling p {
		margin: 0;
		line-height: 1.45;
	}
	.ask-cycling b {
		display: block;
	}
	.ask-cycling form {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		flex-shrink: 0;
	}
	.ask-cycling .btn {
		min-height: 44px;
	}
	@media (min-width: 1024px) {
		.ask-cycling {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			gap: 24px;
		}
	}
	.cycle-charts {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
	}
	.cycle-chart {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		padding: 10px 0 8px;
		border-bottom: 1px solid var(--divider);
		color: var(--text);
	}
	.cc-name {
		font-size: 12px;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.cc-value {
		font-size: 22px;
		font-weight: 800;
		line-height: 1.1;
		white-space: nowrap;
	}
	.cc-unit {
		margin-left: 3px;
		font-size: 11px;
		font-weight: 400;
		color: var(--text-muted);
	}
	.cc-none {
		color: var(--text-muted);
	}
	.cc-spark {
		display: block;
		height: 36px;
		margin-top: 4px;
	}
	.cc-when {
		font-size: 12px;
		color: var(--text-muted);
	}
	.cycle-foot {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 12px;
	}
	.stage {
		margin: 0;
		font-size: 15px;
		line-height: 1.45;
	}
	.cycle-foot .btn {
		align-self: flex-start;
		min-height: 44px;
	}
	@media (hover: hover) {
		.cycle-chart:hover {
			background: var(--surface);
			color: var(--text);
		}
	}
	@media (min-width: 1024px) {
		.cycle-charts {
			gap: 32px;
		}
		.cycle-foot {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			gap: 24px;
		}
	}
</style>
