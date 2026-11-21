<script lang="ts">
	// How a task's next reminder reaches the keeper (#310): its day, each
	// channel as their settings stand (icon and word), this device's push, and
	// the last send. It never turns anything on or asks for permission: each
	// line links to where that's done, in Settings.
	import { onMount } from 'svelte';
	import { detectPush, type PushSupport } from '$lib/push-support';
	import type { ReminderDelivery } from '$lib/reminder-delivery';

	let { delivery, devices = [] }: { delivery: ReminderDelivery; /** endpoints of the keeper's push devices */ devices?: string[] } = $props();

	let support = $state<PushSupport>('checking');
	let mine = $state<string | null>(null);
	onMount(async () => {
		const d = await detectPush();
		support = d.support;
		mine = d.endpoint;
	});
	const here = $derived(support === 'ready' && !!mine && devices.includes(mine));
	const device = $derived.by(() => {
		if (support === 'checking') return null;
		if (here) return '✓ This device gets push notifications.';
		if (support === 'ready') return '– Not on this device: turn push on for it in Settings.';
		if (support === 'ios') return '– Not on this device: on iPhone and iPad, add Waterline to your Home Screen (Share › Add to Home Screen), open it from there, then turn push on in Settings.';
		if (support === 'denied') return "– Not on this device: notifications are blocked for Waterline in this browser's site settings.";
		if (support === 'insecure') return '– Not on this device: push needs Waterline on HTTPS. ntfy works either way.';
		return "– Not on this device: this browser can't get push. ntfy works on any phone.";
	});
</script>

<div class="delivery">
	{#if delivery.ownerOnly}
		<p class="line">– In Waterline only: the tank's owner gets this tank's reminders by email and push, not you. It shows under Tasks and on the dashboard.</p>
	{:else}
		{#if delivery.day}<p class="next">Next reminder <b>{delivery.day}</b></p>{/if}
		<ul class="channels">
			{#each delivery.channels as c (c.key)}
				<li><b class:ok={c.level === 'ok'}>{c.label}</b> <span>{c.detail}</span> <a href={c.href}>{c.level === 'ok' ? 'Change' : 'Set up'} ›</a></li>
			{/each}
			{#if device}<li class="device"><span>{device}</span>{#if !here}{" "}<a href="/settings#push">Push settings ›</a>{/if}</li>{/if}
		</ul>
		{#if delivery.inAppOnly}
			<p class="line">In Waterline only: it shows under Tasks and on the dashboard on its day. Email and push are optional.</p>
		{/if}
	{/if}
	{#if delivery.lastSent}<p class="sent">{delivery.lastSent}</p>{/if}
	{#if !delivery.inAppOnly}
		<p class="hint">
			Waterline can say it sent a reminder, not that it arrived.{#if delivery.channels.some((c) => c.key === 'push' && c.level === 'ok')}
				<a href="/settings#push">Send a test push ›</a>{/if}
		</p>
	{/if}
</div>

<style>
	.delivery {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 14px;
	}
	.next,
	.line,
	.sent,
	.hint {
		margin: 0;
	}
	.channels {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--divider);
	}
	.channels li {
		padding: 8px 0;
		border-bottom: 1px solid var(--divider);
	}
	.channels b {
		font-weight: 700;
		color: var(--text-muted);
	}
	.channels b.ok {
		color: var(--ink);
	}
	/* links inside sentences: underlined, never told apart by color alone */
	.delivery a {
		white-space: nowrap;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.hint,
	.sent,
	.device {
		color: var(--text-muted);
	}
</style>
