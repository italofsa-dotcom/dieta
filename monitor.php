
<?php
// ===== PROTEÇÃO COM SENHA =====
$senhaCorreta = "italo1607"; // ALTERE AQUI!

if (!isset($_GET["key"]) || $_GET["key"] !== $senhaCorreta) {
    die("<h2>Acesso negado ❌</h2><p>Você não tem permissão.</p>");
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Monitoramento de Acessos</title>
<style>
body {
    font-family: Arial, sans-serif;
    background: #f3f4f6;
    padding: 20px;
}
h1 {
    color: #16a34a;
    font-size: 28px;
}
#panel {
    background: #fff;
    padding: 20px;
    border-radius: 12px;
    box-shadow: 0 0 10px rgba(0,0,0,0.1);
    margin-top: 20px;
}
#circlesContainer {
    position: relative;
    width: 100%;
    height: 300px;
    border: 1px solid #ddd;
    border-radius: 10px;
    background: #ffffff;
    overflow: hidden;
    margin-top: 20px;
}

/* Animação entrada */
@keyframes circleEnter {
  0% { transform: scale(0.1); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

/* Animação saída */
@keyframes circleExit {
  0% { transform: scale(1); opacity: 1; }
  100% { transform: scale(0.1); opacity: 0; }
}

.circle {
  width: 22px;
  height: 22px;
  background: #16a34a;
  border-radius: 50%;
  position: absolute;
  animation: circleEnter 0.4s forwards;
}

.circle.exit {
  animation: circleExit 0.4s forwards;
}
</style>
</head>
<body>

<h1>📊 Monitor de Acessos (Privado)</h1>

<div id="panel">
    <p style="font-size:18px;">
        👥 Online agora: <b id="onlineCont">0</b><br>
        📅 Acessos hoje: <b id="dailyCont">0</b>
    </p>

    <div id="circlesContainer"></div>
</div>

<script>
let currentCircles = 0;

function updateStatus() {
  fetch("/contador.php?action=status")
    .then(res => res.json())
    .then(data => {
      document.getElementById("onlineCont").innerText = data.online;
      document.getElementById("dailyCont").innerText = data.daily;

      animateCircles(data.online);
    });
}

// anima os círculos
function animateCircles(qtd) {
  const container = document.getElementById("circlesContainer");

  if (qtd < currentCircles) {
    const all = container.querySelectorAll(".circle");
    const toRemove = currentCircles - qtd;

    for (let i = 0; i < toRemove; i++) {
      const c = all[i];
      c.classList.add("exit");
      setTimeout(() => c.remove(), 400);
    }
  }

  if (qtd > currentCircles) {
    const toAdd = qtd - currentCircles;

    for (let i = 0; i < toAdd; i++) {
      const c = document.createElement("div");
      c.classList.add("circle");
      c.style.left = Math.random() * 90 + "%";
      c.style.top = Math.random() * 90 + "%";
      container.appendChild(c);
    }
  }

  currentCircles = qtd;
}

setInterval(updateStatus, 2000);
updateStatus();
</script>

</body>
</html>
