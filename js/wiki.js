// Thumbnail and one-sentence description for a POI from its OSM wikipedia/wikidata tag.
// Fetched on demand (only for stops on the current route) and cached for the session.
(function () {
  const cache = new Map();
  // Wikimedia asks API clients to identify themselves.
  const HEADERS = { 'Api-User-Agent': 'InconvenientRouting (https://github.com/MichaelMalus/InconvenientRouting)' };

  function firstSentence(text) {
    if (!text) return '';
    // Don't split on initials or "St." / "Mr." style abbreviations.
    const m = text.match(/^.*?[a-z0-9)\]"'][.!?](?=\s+[A-Z]|$)/s);
    return (m ? m[0] : text).trim();
  }

  async function fromWikipedia(lang, title) {
    const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, { headers: HEADERS });
    if (!r.ok) return null;
    const j = await r.json();
    return { text: firstSentence(j.extract), thumb: j.thumbnail && j.thumbnail.source, url: j.content_urls && j.content_urls.desktop.page };
  }

  async function fromWikidata(id) {
    const r = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${id}&props=sitelinks|descriptions|claims&sitefilter=enwiki&languages=en&format=json&origin=*`, { headers: HEADERS });
    const e = (await r.json()).entities[id];
    if (!e) return null;
    const title = e.sitelinks && e.sitelinks.enwiki && e.sitelinks.enwiki.title;
    if (title) {
      const w = await fromWikipedia('en', title);
      if (w && w.text) return w;
    }
    const img = e.claims && e.claims.P18 && e.claims.P18[0].mainsnak.datavalue.value;
    const desc = e.descriptions && e.descriptions.en && e.descriptions.en.value;
    return {
      text: desc ? desc[0].toUpperCase() + desc.slice(1) + '.' : '',
      thumb: img && `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(img)}?width=160`,
      url: `https://www.wikidata.org/wiki/${id}`,
    };
  }

  function info(ref) {
    if (!ref) return Promise.resolve(null);
    if (!cache.has(ref)) {
      const m = ref.match(/^([a-z-]+):(.+)$/);
      const p = (m ? fromWikipedia(m[1], m[2]) : /^Q\d+$/.test(ref) ? fromWikidata(ref) : Promise.resolve(null))
        .catch(() => null);
      cache.set(ref, p);
    }
    return cache.get(ref);
  }

  window.Wiki = { info };
})();
