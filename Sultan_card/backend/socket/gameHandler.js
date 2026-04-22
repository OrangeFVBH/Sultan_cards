const Game = require('../models/Game');
const Player = require('../models/Player');

let waitingPlayers = [];
let activeGame = null;

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log(`[${new Date().toLocaleTimeString()}] Игрок подключился: ${socket.id}`);

        // ================== ПРИСОЕДИНЕНИЕ К ЛОББИ ==================
        socket.on('joinLobby', (username) => {
            if (!username) return socket.emit('error', 'Введите ник');

            // Проверяем, не в лобби ли уже этот игрок
            const existing = waitingPlayers.find(p => p.username === username);
            if (existing) {
                existing.id = socket.id;
                existing.socket = socket;
                console.log(`🔄 Игрок ${username} переподключился`);
                broadcastLobby();
                return;
            }

            const player = new Player(socket.id, username, socket);
            waitingPlayers.push(player);

            console.log(`👤 Игрок ${username} присоединился к лобби → ${waitingPlayers.length}/3`);
            
            broadcastLobby();
            
            // Автоматически запускаем при 3 игроках
            if (waitingPlayers.length === 3) {
                console.log('🎮 3 игрока собрано! Запускаем игру...');
                startGame();
            }
        });

        // ================== ЗАПУСК ИГРЫ ==================
        function startGame() {
            if (activeGame) {
                console.log('Игра уже запущена');
                return;
            }
            
            console.log('🎮 === СОЗДАЁМ ИГРУ ===');
            console.log('Игроки:', waitingPlayers.map(p => p.username).join(', '));
            
            // Создаем игру
            activeGame = new Game(waitingPlayers);
            global.activeGame = activeGame;
            
            // Сначала отправляем сигнал о начале игры
            waitingPlayers.forEach(player => {
                if (player.socket) {
                    player.socket.emit('gameStarted');
                    console.log(`📨 Отправлено gameStarted для ${player.username}`);
                }
            });
            
            // Через небольшую задержку отправляем состояние игры
            setTimeout(() => {
                if (activeGame) {
                    console.log('📤 Отправляем начальное состояние игры...');
                    activeGame.broadcast();
                    
                    // Для отладки выводим состояние каждого игрока
                    activeGame.players.forEach(player => {
                        console.log(`Игрок ${player.username}: ${player.hand.length} карт`);
                        if (player.hand.length > 0) {
                            console.log(`Первая карта: ${player.hand[0].rank} ${player.hand[0].suit}`);
                        }
                    });
                }
            }, 500);
            
            // Очищаем лобби
            waitingPlayers = [];
        }

        // ================== ВОССТАНОВЛЕНИЕ СОСТОЯНИЯ ==================
        socket.on('requestGameState', (username) => {
            console.log(`📞 requestGameState от ${username}`);
            
            if (!activeGame) {
                console.log(`⚠️ Игра не активна для ${username}`);
                socket.emit('error', 'Игра не активна');
                return;
            }

            const player = activeGame.players.find(p => p.username === username);
            if (player) {
                player.socket = socket;
                player.id = socket.id;
                const state = activeGame.getStateForPlayer(player.id);
                console.log(`✅ Состояние отправлено для ${username} (${state.myHand.length} карт)`);
                socket.emit('gameState', state);
            } else {
                console.log(`❌ Игрок ${username} не найден в активной игре`);
                console.log('Активные игроки:', activeGame.players.map(p => p.username));
            }
        });

        // Действия в игре с немедленной отправкой состояния
        socket.on('attack', (data, callback) => {
            if (activeGame) {
                const result = activeGame.attack(socket.id, data.cardIndex);
                if (callback) callback(result);
                activeGame.broadcast();
            } else if (callback) {
                callback({ success: false, error: 'Игра не активна' });
            }
        });
        
        socket.on('defend', (data, callback) => {
            if (activeGame) {
                const result = activeGame.defend(socket.id, data.cardIndex);
                if (callback) callback(result);
                activeGame.broadcast();
            } else if (callback) {
                callback({ success: false, error: 'Игра не активна' });
            }
        });
        
        socket.on('endTurn', (data, callback) => {
            if (activeGame) {
                const result = activeGame.endTurn(socket.id);
                if (callback) callback(result);
                activeGame.broadcast();
            } else if (callback) {
                callback({ success: false, error: 'Игра не активна' });
            }
        });
        
        socket.on('takeCards', (data, callback) => {
            if (activeGame) {
                const result = activeGame.takeCards(socket.id);
                if (callback) callback(result);
                activeGame.broadcast();
            } else if (callback) {
                callback({ success: false, error: 'Игра не активна' });
            }
        });

        socket.on('disconnect', () => {
            console.log(`❌ Игрок отключился: ${socket.id}`);
            
            // Удаляем из лобби
            const index = waitingPlayers.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                const disconnectedPlayer = waitingPlayers[index];
                waitingPlayers.splice(index, 1);
                console.log(`Игрок ${disconnectedPlayer.username} покинул лобби`);
                broadcastLobby();
            }
        });
        
        function broadcastLobby() {
            io.emit('lobbyUpdate', waitingPlayers.map(p => ({ 
                username: p.username,
                id: p.id
            })));
        }
    });
};