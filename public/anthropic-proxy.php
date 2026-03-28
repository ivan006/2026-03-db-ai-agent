<?php
header('Access-Control-Allow-Origin: https://bluegemify.co.za');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, anthropic-version');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$env    = parse_ini_file(__DIR__ . '/.env');
$apiKey = $env['ANTHROPIC_API_KEY'];

$body = file_get_contents('php://input');

$ch = curl_init('https://api.anthropic.com/v1/messages');
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'x-api-key: ' . $apiKey,
    'anthropic-version: 2023-06-01',
]);

$response = curl_exec($ch);
curl_close($ch);

echo $response;
