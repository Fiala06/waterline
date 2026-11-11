<script lang="ts">
	// "Use the photo's date (Sep 14, 3:20 PM)" under a log form's photos (#42):
	// offered when a photo was taken on another day, never applied by itself.
	import { fmtWhenShort, type ExifDate } from '$lib/exif';
	import type { When } from '$lib/time';
	import { photoOtherDay } from './entry-form';

	let { dates, when = $bindable(), timeZone }: { dates: (ExifDate | null)[]; when: When | null; timeZone: string } = $props();

	const photoWhen = $derived(photoOtherDay(dates, when, timeZone));
</script>

{#if photoWhen}
	<button type="button" class="btn-text photo-date" onclick={() => (when = photoWhen)}>Use the photo's date ({fmtWhenShort(photoWhen)})</button>
{/if}

<style>
	.photo-date {
		align-self: flex-start;
		font-size: 14px;
		min-height: 32px;
		padding: 0;
	}
</style>
