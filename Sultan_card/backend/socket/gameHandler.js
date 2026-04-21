const Game = require('../models/Game');
const Player = require('../models/Player');

let waitingPlayers = [];
let activeGame = null;

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log(`[${new Date().toLocaleTimeString()}] Игрок подключился: ${socket.id}`);

        // ================== ПРИСОЕДИНЕНИЕ К ЛОББИ ==================
        socket.on('joinGame', (username) => {
            if (!username) return socket.emit('error', 'Введите ник');

            const existing = waitingPlayers.find(p => p.username === username);
            if (existing) return socket.emit('error', 'Ник уже занят');

            const player = new Player(socket.id, username, socket);
            waitingPlayers.push(player);

            console.log(`Игрок ${username} присоединился → ${waitingPlayers.length}/3`);

            io.emit('lobbyUpdate', waitingPlayers.map(p => p.username));

            if (waitingPlayers.length === 3) {
                console.log('🎮 === СОЗДАЁМ ИГРУ ===');
                activeGame = new Game(waitingPlayers);
                global.activeGame = activeGame;

                // Отправляем всем переход на игру
                activeGame.players.forEach(p => p.socket.emit('gameStarted'));

                // Сразу раздаём карты и отправляем состояние
                setTimeout(() => {
                    if (activeGame) activeGame.broadcast();
                }, 400);

                waitingPlayers = [];
            }
        });

        // ================== ВОССТАНОВЛЕНИЕ СОСТОЯНИЯ В game.html ==================
        socket.on('requestGameState', (username) => {
            if (!activeGame) return;

            const player = activeGame.players.find(p => p.username === username);
            if (player) {
                player.socket = socket;        // обновляем сокет
                player.id = socket.id;
                const state = activeGame.getStateForPlayer(player.id);
                socket.emit('gameState', state);
                console.log(`✅ Состояние восстановлено для ${username} (${state.myHand.length} карт)`);
            }
        });

        // Действия в игре
        socket.on('attack', (data) => activeGame && activeGame.attack(socket.id, data.cardIndex));
        socket.on('defend', (data) => activeGame && activeGame.defend(socket.id, data.cardIndex));
        socket.on('endTurn', () => activeGame && activeGame.endTurn(socket.id));
        socket.on('takeCards', () => activeGame && activeGame.takeCards(socket.id));

        socket.on('disconnect', () => {
            waitingPlayers = waitingPlayers.filter(p => p.id !== socket.id);
        });
    });
};