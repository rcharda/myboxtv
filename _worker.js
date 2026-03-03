/**
 * _worker.js — Cloudflare Pages Worker
 * Proxy universel CORS pour My Box TV.
 * 
 * Routes :
 *   GET /proxy?url=<encoded>   → relay la ressource distante sans CORS
 *   Tout le reste               → sert les fichiers statiques normalement
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── Route proxy ────────────────────────────────────────────────────────────
    if (url.pathname === '/proxy') {
      return handleProxy(request, url);
    }

    // ── Fichiers statiques (comportement Pages normal) ─────────────────────────
    return env.ASSETS.fetch(request);
  }
};

async function handleProxy(request, url) {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };

  // Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const target = url.searchParams.get('url');
  if (!target || !/^https?:\/\//i.test(target)) {
    return new Response('URL invalide', { status: 400, headers: CORS });
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Cache-Control': 'no-cache',
        'Referer': new URL(target).origin + '/',
      },
      redirect: 'follow',
    });

    if (!upstream.ok) {
      return new Response('Upstream error: ' + upstream.status, { status: 502, headers: CORS });
    }

    const ext = target.split('?')[0].split('.').pop().toLowerCase();
    const isM3U8 = ext === 'm3u8' || target.includes('.m3u8');
    const isM3U  = ext === 'm3u'  || target.includes('.m3u');
    const isTS   = ext === 'ts';

    // ── Flux binaire .ts : on pipe directement ─────────────────────────────
    if (isTS) {
      const headers = new Headers(CORS);
      headers.set('Content-Type', 'video/MP2T');
      headers.set('Cache-Control', 'no-cache');
      return new Response(upstream.body, { status: 200, headers });
    }

    // ── Manifest .m3u8 / playlist .m3u : réécriture des URLs ─────────────────
    if (isM3U8 || isM3U) {
      const text = await upstream.text();
      const baseUrl = target.substring(0, target.lastIndexOf('/') + 1);
      const proxyBase = url.origin + '/proxy?url=';

      const rewritten = text.split('\n').map(line => {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#')) return line;

        // URL absolue
        if (/^https?:\/\//i.test(trimmed)) {
          return proxyBase + encodeURIComponent(trimmed);
        }
        // URL relative
        if (trimmed.length > 0) {
          return proxyBase + encodeURIComponent(baseUrl + trimmed);
        }
        return line;
      }).join('\n');

      const headers = new Headers(CORS);
      headers.set('Content-Type', 'application/vnd.apple.mpegurl');
      headers.set('Cache-Control', 'no-cache');
      return new Response(rewritten, { status: 200, headers });
    }

    // ── Autres (images, JSON, etc.) ────────────────────────────────────────────
    const contentType = upstream.headers.get('Content-Type') || 'application/octet-stream';
    const headers = new Headers(CORS);
    headers.set('Content-Type', contentType);
    return new Response(upstream.body, { status: 200, headers });

  } catch (err) {
    return new Response('Erreur proxy: ' + err.message, { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
}
