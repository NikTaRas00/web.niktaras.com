<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

const MODEL = 'gemini-2.5-flash';
const MAX_MESSAGES = 40;
const MAX_CHARS = 4000;

function load_api_key(): ?string
{
    $path = __DIR__ . '/config.php';
    if (!is_readable($path)) {
        return null;
    }
    $config = require $path;
    $key = $config['GEMINI_API_KEY'] ?? '';
    return $key !== '' ? trim($key) : null;
}

function fail(int $status, string $message): never
{
    http_response_code($status);
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail(405, 'Send a POST request.');
}

$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') {
    fail(400, 'Empty request body.');
}

$payload = json_decode($raw, true);
if (!is_array($payload) || !isset($payload['messages']) || !is_array($payload['messages'])) {
    fail(400, 'Request needs a "messages" array.');
}

$apiKey = load_api_key();
if ($apiKey === null) {
    fail(500, 'No API key on the server. Check api/config.php.');
}

$messages = array_slice($payload['messages'], -MAX_MESSAGES);
$contents = [];

foreach ($messages as $message) {
    $role = ($message['role'] ?? '') === 'model' ? 'model' : 'user';
    $text = mb_substr(trim((string)($message['text'] ?? '')), 0, MAX_CHARS);
    if ($text === '') {
        continue;
    }
    $contents[] = ['role' => $role, 'parts' => [['text' => $text]]];
}

if ($contents === []) {
    fail(400, 'Nothing to send.');
}

$body = [
    'contents' => $contents,
    'generationConfig' => [
        'temperature' => 0.8,
        'maxOutputTokens' => 2048,
    ],
];

$systemPrompt = trim((string)($payload['system'] ?? ''));
if ($systemPrompt !== '') {
    $body['systemInstruction'] = [
        'parts' => [['text' => mb_substr($systemPrompt, 0, MAX_CHARS)]],
    ];
}

$url = sprintf(
    'https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent',
    MODEL
);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 60,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'x-goog-api-key: ' . $apiKey,
    ],
    CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE),
]);

$response = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

if ($response === false) {
    fail(502, 'Could not reach Gemini: ' . $curlErr);
}

$decoded = json_decode($response, true);

if ($status === 429) {
    fail(429, 'Rate limit reached. Free tier allows 15 requests per minute — wait a moment.');
}

if ($status !== 200) {
    $detail = $decoded['error']['message'] ?? 'Unknown error.';
    fail($status ?: 502, 'Gemini returned an error: ' . $detail);
}

$candidate = $decoded['candidates'][0] ?? null;
$reply = $candidate['content']['parts'][0]['text'] ?? '';

if ($reply === '') {
    $reason = $candidate['finishReason'] ?? 'unknown';
    fail(502, 'The model returned no text (finish reason: ' . $reason . ').');
}

echo json_encode(['reply' => $reply], JSON_UNESCAPED_UNICODE);
