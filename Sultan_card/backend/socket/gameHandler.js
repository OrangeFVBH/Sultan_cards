const Game = require('../models/Game');
const Player = require('../models/Player');

let lobbies = new Map();
let activeGames = new Map();

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log(`[${new Date().toLocaleTimeString()}] Игрок подключился: ${socket.id}`);

        // ================== СОЗДАНИЕ ЛОББИ ==================
        socket.on('createLobby', (data, callback) => {
            const { username, isPrivate, password, lobbyName } = data;
            
            if (!username) {
                return callback({ success: false, error: 'Не указано имя пользователя' });
            }
            
            const providedName = lobbyName || `Лобби ${generateLobbyId().slice(0, 6)}`;
            const nameExists = Array.from(lobbies.values()).some(l => 
                l.name.toLowerCase() === providedName.toLowerCase()
            );
            
            if (nameExists) {
                return callback({ success: false, error: 'Лобби с таким названием уже существует!' });
            }
            
            const lobbyId = generateLobbyId();
            const lobby = {
                lobbyId,
                name: providedName,
                creator: username,
                players: [{ username, socketId: socket.id, joinedAt: new Date() }],
                playersCount: 1,
                isPrivate: isPrivate || false,
                password: isPrivate ? password : null,
                maxPlayers: 3,
                status: 'waiting'
            };
            
            lobbies.set(lobbyId, lobby);
            socket.join(lobbyId);
            socket.currentLobby = lobbyId;
            socket.currentUsername = username;
            
            console.log(`✅ Создано лобби ${lobbyId} (${providedName}) пользователем ${username}`);
            
            callback({ success: true, lobbyId, lobby });
            broadcastLobbiesList();
        });

        // ================== ПОЛУЧЕНИЕ СПИСКА ЛОББИ ==================
        socket.on('getLobbies', () => {
            const allLobbies = Array.from(lobbies.values())
                .filter(l => l.status === 'waiting' && l.players.length < l.maxPlayers)
                .map(l => ({
                    lobbyId: l.lobbyId,
                    name: l.name,
                    creator: l.creator,
                    playersCount: l.players.length,
                    maxPlayers: l.maxPlayers,
                    hasPassword: l.isPrivate
                }));
            
            socket.emit('lobbiesList', allLobbies);
        });

        // ================== ПРИСОЕДИНЕНИЕ К ЛОББИ ==================
        socket.on('joinLobby', (data, callback) => {
            const { lobbyId, username, password } = data;
            
            if (!username || !lobbyId) {
                return callback({ success: false, error: 'Не указаны данные для входа' });
            }
            
            const lobby = lobbies.get(lobbyId);
            
            if (!lobby) {
                return callback({ success: false, error: 'Лобби не найдено' });
            }
            
            if (lobby.status !== 'waiting') {
                return callback({ success: false, error: 'Игра уже началась' });
            }
            
            if (lobby.players.length >= lobby.maxPlayers) {
                return callback({ success: false, error: 'Лобби заполнено' });
            }
            
            if (lobby.isPrivate && lobby.password !== password) {
                return callback({ success: false, error: 'Неверный пароль', needPassword: true });
            }
            
            if (lobby.players.some(p => p.username === username)) {
                return callback({ success: false, error: 'Вы уже в этом лобби' });
            }
            
            lobby.players.push({ username, socketId: socket.id, joinedAt: new Date() });
            lobby.playersCount = lobby.players.length;
            socket.join(lobbyId);
            socket.currentLobby = lobbyId;
            socket.currentUsername = username;
            
            console.log(`👤 ${username} присоединился к лобби ${lobbyId} (${lobby.players.length}/${lobby.maxPlayers})`);
            
            callback({ success: true, lobby: {
                lobbyId: lobby.lobbyId,
                name: lobby.name,
                creator: lobby.creator,
                players: lobby.players.map(p => ({ username: p.username })),
                playersCount: lobby.players.length,
                maxPlayers: lobby.maxPlayers,
                isPrivate: lobby.isPrivate,
                status: lobby.status
            }});
            
            broadcastLobbyUpdate(lobbyId);
            broadcastLobbiesList();
        });

        // ================== КИК ИГРОКА ==================
        socket.on('kickPlayer', (data, callback) => {
            const { lobbyId, usernameToKick } = data;
            const lobby = lobbies.get(lobbyId);
            
            if (!lobby) return callback({ success: false, error: 'Лобби не найдено' });
            if (lobby.creator !== socket.currentUsername) return callback({ success: false, error: 'Только создатель может кикать' });
            
            const playerToKick = lobby.players.find(p => p.username === usernameToKick);
            if (!playerToKick) return callback({ success: false, error: 'Игрок не найден' });
            if (usernameToKick === socket.currentUsername) return callback({ success: false, error: 'Нельзя кикнуть себя' });
            
            lobby.players = lobby.players.filter(p => p.username !== usernameToKick);
            lobby.playersCount = lobby.players.length;
            
            io.to(playerToKick.socketId).emit('kickedFromLobby', { message: `Вас кикнули из лобби ${lobby.name}` });
            io.to(playerToKick.socketId).emit('redirectToLobbyList');
            
            broadcastLobbyUpdate(lobbyId);
            broadcastLobbiesList();
            callback({ success: true });
        });

        // ================== ПОКИНУТЬ ЛОББИ ==================
        socket.on('leaveLobby', (data, callback) => {
            const lobbyId = socket.currentLobby;
            const username = socket.currentUsername;
            
            console.log(`🚪 Выход из лобби: ${username}, lobbyId: ${lobbyId}`);
            
            if (!lobbyId) {
                return callback?.({ success: false, error: 'Вы не в лобби' });
            }
            
            const lobby = lobbies.get(lobbyId);
            
            if (!lobby) {
                delete socket.currentLobby;
                delete socket.currentUsername;
                return callback?.({ success: true });
            }
            
            const game = activeGames.get(lobbyId);
            if (game && lobby.status === 'playing') {
                console.log(`🎮 Игра активна, ${username} не может покинуть лобби`);
                return callback?.({ success: false, error: 'Нельзя покинуть игру' });
            }
            
            lobby.players = lobby.players.filter(p => p.username !== username);
            lobby.playersCount = lobby.players.length;
            
            if (lobby.players.length === 0) {
                lobbies.delete(lobbyId);
                console.log(`🗑️ Лобби ${lobbyId} удалено (пустое)`);
            } else {
                if (lobby.creator === username) {
                    lobby.creator = lobby.players[0].username;
                }
                broadcastLobbyUpdate(lobbyId);
            }
            broadcastLobbiesList();
            
            socket.leave(lobbyId);
            delete socket.currentLobby;
            delete socket.currentUsername;
            
            socket.emit('lobbyLeft', { success: true });
            callback?.({ success: true });
        });

        // ================== ЗАПУСК ИГРЫ ==================
        socket.on('startGame', async (data, callback) => {
            const lobbyId = socket.currentLobby;
            console.log(`🎮 Запрос на запуск игры в лобби ${lobbyId}`);
            
            const lobby = lobbies.get(lobbyId);
            
            if (!lobby) return callback({ success: false, error: 'Лобби не найдено' });
            if (lobby.creator !== socket.currentUsername) return callback({ success: false, error: 'Только создатель может начать' });
            if (lobby.players.length < 3) return callback({ success: false, error: `Нужно 3 игрока (сейчас ${lobby.players.length})` });
            
            const unavailablePlayers = [];
            for (const player of lobby.players) {
                const playerSocket = io.sockets.sockets.get(player.socketId);
                if (!playerSocket || !playerSocket.connected) {
                    unavailablePlayers.push(player.username);
                }
            }
            
            if (unavailablePlayers.length > 0) {
                return callback({ success: false, error: `Игроки не в сети: ${unavailablePlayers.join(', ')}` });
            }
            
            console.log(`🎮 ЗАПУСК ИГРЫ в лобби ${lobbyId}`);
            console.log(`Игроки: ${lobby.players.map(p => p.username).join(', ')}`);
            
            lobby.status = 'playing';
            
            const gamePlayers = [];
            for (const player of lobby.players) {
                const playerSocket = io.sockets.sockets.get(player.socketId);
                const gamePlayer = new Player(player.socketId, player.username, playerSocket);
                gamePlayers.push(gamePlayer);
            }
            
            const game = new Game(gamePlayers);
            activeGames.set(lobbyId, game);
            
            console.log(`✅ Игра создана в лобби ${lobbyId}`);
            
            // Сначала отправляем gameStarted
            for (const player of lobby.players) {
                const playerSocket = io.sockets.sockets.get(player.socketId);
                if (playerSocket) {
                    playerSocket.currentLobby = lobbyId;
                    playerSocket.emit('gameStarted', { 
                        lobbyId: lobbyId,
                        username: player.username 
                    });
                    console.log(`📨 gameStarted отправлен для ${player.username}`);
                }
            }
            
            // Запускаем анимацию через 2 секунды
            setTimeout(() => {
                if (activeGames.has(lobbyId)) {
                    const currentGame = activeGames.get(lobbyId);
                    currentGame.startDealingAnimation();
                }
            }, 15000);
            
            if (typeof callback === 'function') {
                callback({ success: true, message: 'Игра запускается...' });
            }
            
            broadcastLobbiesList();
        });

        // ================== ЗАПРОС СОСТОЯНИЯ ИГРЫ ==================
        socket.on('requestGameState', (data) => {
            let username, lobbyId;
            
            if (typeof data === 'string') {
                username = data;
                lobbyId = socket.currentLobby;
            } else if (typeof data === 'object') {
                username = data.username;
                lobbyId = data.lobbyId;
            }
            
            const finalLobbyId = lobbyId || socket.currentLobby;
            
            console.log(`📞 Запрос состояния от ${username} для лобби ${finalLobbyId}`);
            
            if (!finalLobbyId) return;
            
            const game = activeGames.get(finalLobbyId);
            if (!game) return;
            
            const player = game.players.find(p => p.username === username);
            if (player) {
                player.socket = socket;
                player.id = socket.id;
                socket.currentLobby = finalLobbyId;
                socket.currentUsername = username;
                socket.join(finalLobbyId);
                
                const state = game.getStateForPlayer(player.id);
                socket.emit('gameState', state);
                console.log(`✅ Состояние отправлено для ${username}, карт: ${state.myHand.length}`);
            }
        });

        // ================== ИГРОВЫЕ ДЕЙСТВИЯ ==================
        socket.on('attack', (data, callback) => {
            const lobbyId = socket.currentLobby;
            const game = activeGames.get(lobbyId);
            if (game) {
                const result = game.attack(socket.id, data.cardIndex);
                if (callback) callback(result);
                game.broadcast();
            }
        });
        
        socket.on('defend', (data, callback) => {
            const lobbyId = socket.currentLobby;
            const game = activeGames.get(lobbyId);
            if (game) {
                const result = game.defend(socket.id, data.cardIndex);
                if (callback) callback(result);
                game.broadcast();
            }
        });
        
        socket.on('endTurn', (data, callback) => {
            const lobbyId = socket.currentLobby;
            const game = activeGames.get(lobbyId);
            if (game) {
                const result = game.endTurn(socket.id);
                if (callback) callback(result);
                game.broadcast();
            }
        });
        
        socket.on('takeCards', (data, callback) => {
            const lobbyId = socket.currentLobby;
            const game = activeGames.get(lobbyId);
            if (game) {
                const result = game.takeCards(socket.id);
                if (callback) callback(result);
                game.broadcast();
            }
        });

        socket.on('additionalAttack', (data, callback) => {
            const lobbyId = socket.currentLobby;
            const game = activeGames.get(lobbyId);
            if (game) {
                const result = game.additionalAttack(socket.id, data.cardIndex);
                if (callback) callback(result);
                game.broadcast();
            }
        });

        socket.on('endAdditionalAttack', (data, callback) => {
            const lobbyId = socket.currentLobby;
            const game = activeGames.get(lobbyId);
            if (game) {
                const result = game.endAdditionalAttack(socket.id);
                if (callback) callback(result);
                game.broadcast();
            }
        });

        // ================== СИНХРОНИЗАЦИЯ АНИМАЦИИ РАЗДАЧИ ==================
        socket.on('startDealingAnimation', (data) => {
            const lobbyId = data.lobbyId || socket.currentLobby;
            console.log(`🔄 Синхронизация анимации раздачи в лобби ${lobbyId}`);
            
            if (lobbyId) {
                socket.to(lobbyId).emit('startDealingAnimation');
            }
        });

        // ================== ОТКЛЮЧЕНИЕ ==================
        socket.on('disconnect', () => {
            console.log(`❌ Отключился: ${socket.id}`);
            
            const disconnectedLobbyId = socket.currentLobby;
            const disconnectedUsername = socket.currentUsername;
            
            if (disconnectedLobbyId) {
                const game = activeGames.get(disconnectedLobbyId);
                if (game) {
                    const playerInGame = game.players.find(p => p.username === disconnectedUsername);
                    if (playerInGame) {
                        console.log(`⚠️ Игрок ${disconnectedUsername} отключился во время игры`);
                        
                        setTimeout(() => {
                            const currentGame = activeGames.get(disconnectedLobbyId);
                            if (currentGame) {
                                const player = currentGame.players.find(p => p.username === disconnectedUsername);
                                if (player && player.socket.id === socket.id) {
                                    console.log(`⏰ Время переподключения истекло для ${disconnectedUsername}`);
                                    
                                    currentGame.players.forEach(p => {
                                        if (p.socket && p.socket.connected && p.username !== disconnectedUsername) {
                                            p.socket.emit('error', `Игрок ${disconnectedUsername} отключился`);
                                            p.socket.emit('gameOver', { 
                                                winner: 'Игра прервана',
                                                disconnectedPlayer: disconnectedUsername 
                                            });
                                        }
                                    });
                                    
                                    activeGames.delete(disconnectedLobbyId);
                                    
                                    const lobby = lobbies.get(disconnectedLobbyId);
                                    if (lobby) {
                                        lobby.status = 'waiting';
                                        lobby.players = lobby.players.filter(p => p.username !== disconnectedUsername);
                                        lobby.playersCount = lobby.players.length;
                                        
                                        if (lobby.players.length > 0) {
                                            lobby.creator = lobby.players[0].username;
                                        } else {
                                            lobbies.delete(disconnectedLobbyId);
                                        }
                                        broadcastLobbiesList();
                                    }
                                }
                            }
                        }, 30000);
                    }
                }
            }
            
            for (const [lobbyId, lobby] of lobbies.entries()) {
                if (lobby.status === 'waiting') {
                    const playerIndex = lobby.players.findIndex(p => p.socketId === socket.id);
                    if (playerIndex !== -1) {
                        lobby.players.splice(playerIndex, 1);
                        lobby.playersCount = lobby.players.length;
                        
                        if (lobby.players.length === 0) {
                            lobbies.delete(lobbyId);
                        } else {
                            broadcastLobbyUpdate(lobbyId);
                        }
                        broadcastLobbiesList();
                        break;
                    }
                }
            }
        });
        
        function generateLobbyId() {
            return Math.random().toString(36).substring(2, 8).toUpperCase();
        }
        
        function broadcastLobbiesList() {
            const allLobbies = Array.from(lobbies.values())
                .filter(l => l.status === 'waiting' && l.players.length < l.maxPlayers)
                .map(l => ({
                    lobbyId: l.lobbyId,
                    name: l.name,
                    creator: l.creator,
                    playersCount: l.players.length,
                    maxPlayers: l.maxPlayers,
                    hasPassword: l.isPrivate
                }));
            
            io.emit('lobbiesList', allLobbies);
        }
        
        function broadcastLobbyUpdate(lobbyId) {
            const lobby = lobbies.get(lobbyId);
            if (lobby) {
                io.to(lobbyId).emit('lobbyUpdate', {
                    lobbyId: lobby.lobbyId,
                    name: lobby.name,
                    creator: lobby.creator,
                    players: lobby.players.map(p => ({ username: p.username })),
                    playersCount: lobby.players.length,
                    maxPlayers: lobby.maxPlayers,
                    isPrivate: lobby.isPrivate,
                    status: lobby.status
                });
            }
        }
    });
};