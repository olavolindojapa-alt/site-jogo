# 🥊 KOMBAT.IO — Jogo de Luta Multiplayer

## ✅ Como rodar (SEM npm install)

```bash
unzip kombat-io.zip
cd kombat-final
node server.js
```

Abra **http://localhost:3000** no navegador.

## 🎮 Jogar com 2 pessoas

**Mesma máquina:** abra duas abas do navegador.
1. Aba 1 → **CRIAR SALA** → anote o código de 4 letras
2. Aba 2 → **ENTRAR COM CÓDIGO** → digite o código

**Rede local:** substitua `localhost` pelo IP da sua máquina.

## 🕹️ Controles

| | Player 1 | Player 2 |
|---|---|---|
| Mover | `A` / `D` | `←` / `→` |
| Pular | `W` | `↑` |
| Soco  | `F` | `,` |
| Chute | `G` | `.` |

## 📁 Arquivos

```
server.js        → Servidor HTTP + WebSocket
index.html       → Interface
style.css        → Estilos
game.js          → Motor do jogo
node_modules/ws  → Módulo WebSocket (já incluído)
```
