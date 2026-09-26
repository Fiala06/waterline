<script lang="ts">
	// SEO for public pages: title, description, canonical, robots, Open Graph,
	// Twitter card and schema.org data (P4).
	let {
		seo,
		verification = null,
		jsonLd = null
	}: {
		seo: { title: string; description: string; canonical: string; indexable: boolean; image: string; imageAlt: string; siteName: string };
		verification?: string | null;
		jsonLd?: Record<string, unknown> | null;
	} = $props();
	const ld = $derived(jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</` + 'script>' : '');
</script>

<svelte:head>
	<title>{seo.title}</title>
	<meta name="description" content={seo.description} />
	<link rel="canonical" href={seo.canonical} />
	<meta name="robots" content={seo.indexable ? 'index, follow' : 'noindex, nofollow'} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={seo.siteName} />
	<meta property="og:title" content={seo.title} />
	<meta property="og:description" content={seo.description} />
	<meta property="og:url" content={seo.canonical} />
	<meta property="og:image" content={seo.image} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={seo.imageAlt} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={seo.title} />
	<meta name="twitter:description" content={seo.description} />
	<meta name="twitter:image" content={seo.image} />
	<meta name="twitter:image:alt" content={seo.imageAlt} />
	{#if verification}<meta name="google-site-verification" content={verification} />{/if}
	<!-- JSON-LD: built server-side with every "<" escaped, so it can't close the script tag -->
	{@html ld}
</svelte:head>
