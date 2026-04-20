const Game = require('../models/Game');
const Player = require('../models/Player');

let waitingPlayers = [];
let activeGame = null;
// Сохраняем соответствие socket.id -> игрок
const playerSessions = new Map();

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log(`[${new Date().toLocaleTimeString()}] Игрок подключился: ${socket.id}`);

        socket.on('joinGame', (username) => {
            if (!username || username.trim() === '') {
                socket.emit('error', 'Введите ник');
                return;
            }
            
            // Проверка на дубликат ника
            if (waitingPlayers.some(p => p.username === username)) {
                socket.emit('error', 'Ник уже занят');
                return;
            }

            const newPlayer = new Player(socket.id, username.trim(), socket);
            waitingPlayers.push(newPlayer);
            // Сохраняем сессию
            playerSessions.set(socket.id, { username: username.trim(), inGame: false });

            console.log(`[${new Date().toLocaleTimeString()}] Игрок ${username} присоединился. Всего: ${waitingPlayers.length}/3`);

            // Обновляем лобби для всех
            io.emit('lobbyUpdate', waitingPlayers.map(p => ({ username: p.username, cardCount: 0 })));

            // Когда набралось 3 игрока — запускаем игру
            if (waitingPlayers.length === 3) {
                console.log('🎮 НАЧИНАЕМ ИГРУ! Три игрока собрались');
                
                // Создаем новую игру
                activeGame = new Game(waitingPlayers);
                global.activeGame = activeGame;
                
                // Отмечаем игроков как в игре
                waitingPlayers.forEach(p => {
                    playerSessions.set(p.id, { username: p.username, inGame: true });
                });
                
                // Отправляем каждому игроку, что игра началась
                waitingPlayers.forEach(player => {
                    player.socket.emit('gameStarted');
                    console.log(`Отправлено gameStarted игроку ${player.username}`);
                });
                
                // Отправляем состояние игры через небольшую задержку
                setTimeout(() => {
                    if (activeGame) {
                        activeGame.broadcast();
                        console.log('✅ Начальное состояние игры отправлено всем игрокам');
                    }
                }, 500);
                
                // Очищаем очередь ожидания, но НЕ очищаем playerSessions
                waitingPlayers = [];
            }
        });
        
        // Обработчик для восстановления соединения после перезагрузки страницы
        socket.on('reconnectGame', (username) => {
            console.log(`🔄 Восстановление соединения для ${username}, socket: ${socket.id}`);
            
            if (activeGame) {
                // Ищем игрока по имени
                const player = activeGame.players.find(p => p.username === username);
                if (player) {
                    // Обновляем socket у игрока
                    player.socket = socket;
                    player.id = socket.id;
                    
                    // Отправляем текущее состояние игры
                    const state = activeGame.getStateForPlayer(player.id);
                    socket.emit('gameState', state);
                    console.log(`✅ Восстановлено состояние для ${username}`);
                } else {
                    console.log(`❌ Игрок ${username} не найден в активной игре`);
                }
            }
        });

        // Обработчики действий в игре
        socket.on('attack', (data, callback) => {
            console.log(`attack от ${socket.id}, cardIndex: ${data.cardIndex}`);
            if (activeGame) {
                const result = activeGame.attack(socket.id, data.cardIndex);
                if (callback) callback(result);
            } else if (callback) {
                callback({ success: false, error: 'Игра не найдена' });
            }
        });

        socket.on('defend', (data, callback) => {
            console.log(`defend от ${socket.id}, cardIndex: ${data.cardIndex}`);
            if (activeGame) {
                const result = activeGame.defend(socket.id, data.cardIndex);
                if (callback) callback(result);
            } else if (callback) {
                callback({ success: false, error: 'Игра не найдена' });
            }
        });

        socket.on('endTurn', (data, callback) => {
            console.log(`endTurn от ${socket.id}`);
            if (activeGame) {
                const result = activeGame.endTurn(socket.id);
                if (callback) callback(result);
            } else if (callback) {
                callback({ success: false, error: 'Игра не найдена' });
            }
        });

        socket.on('takeCards', (data, callback) => {
            console.log(`takeCards от ${socket.id}`);
            if (activeGame) {
                const result = activeGame.takeCards(socket.id);
                if (callback) callback(result);
            } else if (callback) {
                callback({ success: false, error: 'Игра не найдена' });
            }
        });

        socket.on('disconnect', () => {
            console.log(`Игрок отключился: ${socket.id}`);
            
            const session = playerSessions.get(socket.id);
            if (session && !session.inGame) {
                // Игрок был в лобби
                waitingPlayers = waitingPlayers.filter(p => p.id !== socket.id);
            }
            
            playerSessions.delete(socket.id);
            
            if (activeGame) {
                // Проверяем, есть ли еще игроки в игре
                const playerIndex = activeGame.players.findIndex(p => p.id === socket.id);
                if (playerIndex !== -1) {
                    console.log(`⚠️ Игрок ${activeGame.players[playerIndex].username} отключился от игры`);
                }
            }
        });
    });
};