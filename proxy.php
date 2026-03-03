<?php
/**
 * proxy.php — My Box TV
 * Proxy universel pour contourner le CORS côté serveur.
 * Gère les playlists M3U et les flux HLS (.m3u8 / .ts).
 * 
 * Utilisation : proxy.php?url=https://...
 * 
 * Mettre ce fichier dans le MÊME dossier que index_ui.html sur ton serveur.
 */

// ── Sécurité : on n'accepte que des URLs http/https ──────────────────────────
$url = isset($_GET['url']) ? trim($_GET['url']) : '';

if(empty($url) || !preg_match('#^https?://#i', $url)) {
    http_response_code(400);
    die('URL invalide');
}

// ── Détection du type de contenu demandé ─────────────────────────────────────
$ext = strtolower(pathinfo(parse_url($url, PHP_URL_PATH), PATHINFO_EXTENSION));
$isM3U8   = ($ext === 'm3u8' || strpos($url, '.m3u8') !== false);
$isTS     = ($ext === 'ts'   || strpos($url, '.ts')   !== false);
$isM3U    = ($ext === 'm3u'  || strpos($url, '.m3u')  !== false);

// ── Headers CORS ──────────────────────────────────────────────────────────────
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: *');

if($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ── Requête vers la source ────────────────────────────────────────────────────
$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL            => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS      => 5,
    CURLOPT_TIMEOUT        => 20,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => false,
    CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
    CURLOPT_HTTPHEADER     => [
        'Accept: */*',
        'Accept-Language: fr-FR,fr;q=0.9,en;q=0.8',
        'Cache-Control: no-cache',
        'Pragma: no-cache',
    ],
    CURLOPT_HEADER         => true,   // on récupère les headers de réponse
]);

$response  = curl_exec($ch);
$httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize= curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$curlError = curl_error($ch);
curl_close($ch);

if($curlError || $httpCode < 200 || $httpCode >= 400) {
    http_response_code(502);
    die('Erreur proxy : ' . ($curlError ?: 'HTTP '.$httpCode));
}

$headers = substr($response, 0, $headerSize);
$body    = substr($response, $headerSize);

// ── Content-Type ─────────────────────────────────────────────────────────────
if($isM3U8) {
    header('Content-Type: application/vnd.apple.mpegurl');
} elseif($isTS) {
    header('Content-Type: video/MP2T');
} elseif($isM3U) {
    header('Content-Type: application/x-mpegurl');
} else {
    // Reprend le Content-Type original si possible
    if(preg_match('/Content-Type:\s*([^\r\n]+)/i', $headers, $m)) {
        header('Content-Type: ' . trim($m[1]));
    } else {
        header('Content-Type: application/octet-stream');
    }
}

// ── Pour les manifests M3U8 : réécrit les URLs relatives en absolues ──────────
// Cela permet à hls.js de charger les segments via ce même proxy
if($isM3U8 || $isM3U) {
    $base = dirname($url) . '/';
    // Réécrit les lignes qui sont des URLs de segments
    $lines = explode("\n", $body);
    $out   = [];
    foreach($lines as $line) {
        $line = rtrim($line);
        if($line === '' || substr($line, 0, 1) === '#') {
            $out[] = $line;
        } elseif(preg_match('#^https?://#', $line)) {
            // URL absolue : on la passe via ce proxy
            $out[] = 'proxy.php?url=' . rawurlencode($line);
        } elseif($line !== '') {
            // URL relative : on construit l'URL absolue puis proxy
            $out[] = 'proxy.php?url=' . rawurlencode($base . $line);
        }
    }
    echo implode("\n", $out);
} else {
    // Flux binaire (.ts) : on envoie directement
    echo $body;
}
