<?php
header('Content-Type: application/json');

$action = $_GET['action'] ?? '';

$onlineFile = __DIR__ . '/online.json';
$dailyFile  = __DIR__ . '/daily.json';

$online = file_exists($onlineFile) ? json_decode(file_get_contents($onlineFile), true) : [];
$daily  = file_exists($dailyFile) ? json_decode(file_get_contents($dailyFile), true) : ["date" => date("Y-m-d"), "count" => 0];

$now = time();

// Remove acessos que perderam conexão há mais de 5 min
foreach ($online as $k => $v) {
    if ($now - $v['time'] > 300) unset($online[$k]);
}

if ($action === "enter") {
    $id = $_GET['id'] ?? uniqid();

    $online[$id] = ["time" => time()];

    if ($daily["date"] !== date("Y-m-d")) {
        $daily = ["date" => date("Y-m-d"), "count" => 0];
    }

    $daily["count"]++;

    file_put_contents($onlineFile, json_encode($online));
    file_put_contents($dailyFile, json_encode($daily));

    echo json_encode(["ok" => true]);
    exit;
}

if ($action === "exit") {
    $id = $_GET['id'] ?? null;
    if ($id && isset($online[$id])) {
        unset($online[$id]);
        file_put_contents($onlineFile, json_encode($online));
    }
    echo json_encode(["ok" => true]);
    exit;
}

if ($action === "status") {
    echo json_encode([
        "online" => count($online),
        "daily"  => $daily["count"]
    ]);
    exit;
}

echo json_encode(["error" => "invalid_action"]);
