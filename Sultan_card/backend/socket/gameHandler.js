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
            
            // Проверка уникальности имени лобби
            const providedName = lobbyName || `Лобби ${generateLobbyId().slice(0, 6)}`;
            const nameExists = Array.from(lobbies.values()).some(l => 
                l.name.toLowerCase() === providedName.toLowerCase()
            );
            
            if (nameExists) {
                return callback({ success: false, error: 'Лобби с таким названием уже существует! Пожалуйста, выберите другое название.' });
            }
            
            const lobbyId = generateLobbyId();
            const lobby = {
                lobbyId,
                name: providedName,
                creator: username,
                players: [{ username, socketId: socket.id, joinedAt: new Date() }],
                playersCount: 1,  // Добавляем поле playersCount
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
            
            // Возвращаем лобби с правильными данными
            callback({ success: true, lobbyId, lobby });
            
            // Обновляем список лобби для всех
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
                    playersCount: l.players.length,  // Используем реальную длину массива
                    maxPlayers: l.maxPlayers,
                    hasPassword: l.isPrivate
                }));
            
            socket.emit('lobbiesList', allLobbies);
        });

        // ================== ПРИСОЕДИНЕНИЕ К ЛОББИ ==================
        socket.on('joinLobby', (data, callback) => {
            const { lobbyId, username, password } = data;
            
            console.log(`📥 Попытка подключения к лобби ${lobbyId}, пользователь ${username}`);
            
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
            
            // Проверка пароля для приватных лобби
            if (lobby.isPrivate && lobby.password !== password) {
                return callback({ success: false, error: 'Неверный пароль', needPassword: true });
            }
            
            if (lobby.players.some(p => p.username === username)) {
                return callback({ success: false, error: 'Вы уже в этом лобби' });
            }
            
            lobby.players.push({ username, socketId: socket.id, joinedAt: new Date() });
            lobby.playersCount = lobby.players.length;  // Обновляем счетчик
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
            
            // Обновляем лобби для всех участников
            broadcastLobbyUpdate(lobbyId);
            broadcastLobbiesList();
        });

        // ================== КИК ИГРОКА ==================
        socket.on('kickPlayer', (data, callback) => {
            const { lobbyId, usernameToKick } = data;
            const lobby = lobbies.get(lobbyId);
            
            if (!lobby) {
                return callback({ success: false, error: 'Лобби не найдено' });
            }
            
            if (lobby.creator !== socket.currentUsername) {
                return callback({ success: false, error: 'Только создатель лобби может кикать игроков' });
            }
            
            const playerToKick = lobby.players.find(p => p.username === usernameToKick);
            if (!playerToKick) {
                return callback({ success: false, error: 'Игрок не найден' });
            }
            
            if (usernameToKick === socket.currentUsername) {
                return callback({ success: false, error: 'Нельзя кикнуть самого себя' });
            }
            
            lobby.players = lobby.players.filter(p => p.username !== usernameToKick);
            lobby.playersCount = lobby.players.length;  // Обновляем счетчик
            
            io.to(playerToKick.socketId).emit('kickedFromLobby', { 
                message: `Вас кикнули из лобби ${lobby.name}` 
            });
            io.to(playerToKick.socketId).emit('redirectToLobbyList');
            
            // Обновляем сокет кикнутого
            const kickedSocket = io.sockets.sockets.get(playerToKick.socketId);
            if (kickedSocket) {
                delete kickedSocket.currentLobby;
            }
            
            broadcastLobbyUpdate(lobbyId);
            broadcastLobbiesList();
            
            console.log(`👢 ${usernameToKick} был кикнут из лобби ${lobbyId}`);
            callback({ success: true });
        });

        // ================== ПОКИНУТЬ ЛОББИ ==================
        socket.on('leaveLobby', (data, callback) => {
            const lobbyId = socket.currentLobby;
            const username = socket.currentUsername;
            
            console.log(`🚪 Попытка выхода из лобби: ${username}, lobbyId: ${lobbyId}`);
            
            if (!lobbyId) {
                return callback?.({ success: false, error: 'Вы не в лобби' });
            }
            
            const lobby = lobbies.get(lobbyId);
            
            if (lobby) {
                const wasCreator = lobby.creator === username;
                const wasInLobby = lobby.players.some(p => p.username === username);
                
                if (wasInLobby) {
                    // Удаляем игрока из лобби
                    lobby.players = lobby.players.filter(p => p.username !== username);
                    lobby.playersCount = lobby.players.length;
                    
                    console.log(`👋 ${username} покинул лобби ${lobbyId}. Осталось игроков: ${lobby.players.length}`);
                    
                    if (lobby.players.length === 0) {
                        // Если лобби пустое - удаляем
                        lobbies.delete(lobbyId);
                        console.log(`🗑️ Лобби ${lobbyId} удалено (пустое)`);
                        // Уведомляем всех, что лобби исчезло
                        broadcastLobbiesList();
                    } else {
                        // Если создатель ушел - назначаем нового
                        if (wasCreator) {
                            lobby.creator = lobby.players[0].username;
                            console.log(`👑 Новый создатель лобби ${lobbyId}: ${lobby.creator}`);
                        }
                        
                        // Обновляем лобби для оставшихся игроков
                        broadcastLobbyUpdate(lobbyId);
                        broadcastLobbiesList();
                        
                        // Отправляем оставшимся игрокам обновленный список игроков
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
            }
            
            // ВАЖНО: Очищаем данные сокета
            socket.leave(lobbyId);
            delete socket.currentLobby;
            delete socket.currentUsername;
            
            // Отправляем игроку команду очистить локальное состояние
            socket.emit('lobbyLeft', { success: true });
            
            console.log(`✅ ${username} полностью вышел из лобби, состояние сокета очищено`);
            callback?.({ success: true });
        });

        // ================== ЗАПУСК ИГРЫ ==================
        socket.on('startGame', async (data, callback) => {
            const lobbyId = socket.currentLobby;
            console.log(`🎮 Запрос на запуск игры в лобби ${lobbyId}`);
            
            const lobby = lobbies.get(lobbyId);
            
            if (!lobby) {
                return callback({ success: false, error: 'Лобби не найдено' });
            }
            
            if (lobby.creator !== socket.currentUsername) {
                return callback({ success: false, error: 'Только создатель может начать игру' });
            }
            
            if (lobby.players.length < 3) {
                return callback({ success: false, error: `Нужно 3 игрока (сейчас ${lobby.players.length})` });
            }
            
            lobby.status = 'playing';
            
            console.log(`🎮 ЗАПУСК ИГРЫ в лобби ${lobbyId}`);
            console.log(`Игроки: ${lobby.players.map(p => p.username).join(', ')}`);
            
            // Получаем актуальные сокеты для всех игроков
            const gamePlayers = [];
            for (const player of lobby.players) {
                const playerSocket = io.sockets.sockets.get(player.socketId);
                if (!playerSocket) {
                    console.error(`❌ Сокет не найден для игрока ${player.username}`);
                    return callback({ success: false, error: `Игрок ${player.username} отключился` });
                }
                gamePlayers.push(new Player(player.socketId, player.username, playerSocket));
            }
            
            // Создаем игру
            const game = new Game(gamePlayers);
            activeGames.set(lobbyId, game);
            
            // Уведомляем всех о начале игры и сохраняем lobbyId в сокет
            for (const player of lobby.players) {
                const playerSocket = io.sockets.sockets.get(player.socketId);
                if (playerSocket) {
                    playerSocket.currentLobby = lobbyId;
                    playerSocket.emit('gameStarted', { lobbyId });
                    console.log(`📨 Отправлено gameStarted для ${player.username}`);
                }
            }
            
            // Отправляем состояние игры через 1 секунду
            setTimeout(() => {
                if (activeGames.has(lobbyId)) {
                    const currentGame = activeGames.get(lobbyId);
                    currentGame.broadcast();
                    console.log('📤 Начальное состояние игры отправлено');
                }
            }, 1000);
            
            callback({ success: true });
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
            
            console.log(`📞 requestGameState от ${username}, lobbyId = ${lobbyId || socket.currentLobby}`);
            
            const finalLobbyId = lobbyId || socket.currentLobby;
            
            if (!finalLobbyId) {
                console.log(`❌ Нет lobbyId для запроса от ${username}`);
                socket.emit('error', 'Вы не в игре. Пожалуйста, перезайдите в лобби.');
                return;
            }
            
            const game = activeGames.get(finalLobbyId);
            if (!game) {
                console.log(`⚠️ Игра не найдена для lobbyId ${finalLobbyId}`);
                socket.emit('error', 'Игра не найдена');
                return;
            }
            
            const player = game.players.find(p => p.username === username);
            if (player) {
                player.socket = socket;
                player.id = socket.id;
                socket.currentLobby = finalLobbyId;
                const state = game.getStateForPlayer(player.id);
                console.log(`✅ Отправлено состояние для ${username}, карт: ${state.myHand.length}`);
                socket.emit('gameState', state);
            } else {
                console.log(`❌ Игрок ${username} не найден в игре`);
                console.log(`Игроки в игре: ${game.players.map(p => p.username).join(', ')}`);
                socket.emit('error', 'Игрок не найден в игре');
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
            } else if (callback) {
                callback({ success: false, error: 'Игра не активна' });
            }
        });
        
        socket.on('defend', (data, callback) => {
            const lobbyId = socket.currentLobby;
            const game = activeGames.get(lobbyId);
            if (game) {
                const result = game.defend(socket.id, data.cardIndex);
                if (callback) callback(result);
                game.broadcast();
            } else if (callback) {
                callback({ success: false, error: 'Игра не активна' });
            }
        });
        
        socket.on('endTurn', (data, callback) => {
            const lobbyId = socket.currentLobby;
            const game = activeGames.get(lobbyId);
            if (game) {
                const result = game.endTurn(socket.id);
                if (callback) callback(result);
                game.broadcast();
            } else if (callback) {
                callback({ success: false, error: 'Игра не активна' });
            }
        });
        
        socket.on('takeCards', (data, callback) => {
            const lobbyId = socket.currentLobby;
            const game = activeGames.get(lobbyId);
            if (game) {
                const result = game.takeCards(socket.id);
                if (callback) callback(result);
                game.broadcast();
            } else if (callback) {
                callback({ success: false, error: 'Игра не активна' });
            }
        });

        socket.on('additionalAttack', (data, callback) => {
            const lobbyId = socket.currentLobby;
            const game = activeGames.get(lobbyId);
            if (game) {
                const result = game.additionalAttack(socket.id, data.cardIndex);
                if (callback) callback(result);
                game.broadcast();
            } else if (callback) {
                callback({ success: false, error: 'Игра не активна' });
            }
        });

        socket.on('endAdditionalAttack', (data, callback) => {
            const lobbyId = socket.currentLobby;
            const game = activeGames.get(lobbyId);
            if (game) {
                const result = game.endAdditionalAttack(socket.id);
                if (callback) callback(result);
                game.broadcast();
            } else if (callback) {
                callback({ success: false, error: 'Игра не активна' });
            }
        });

        // ================== ОТКЛЮЧЕНИЕ ==================
        socket.on('disconnect', () => {
            console.log(`❌ Отключился: ${socket.id}`);
            
            for (const [lobbyId, lobby] of lobbies.entries()) {
                const playerIndex = lobby.players.findIndex(p => p.socketId === socket.id);
                
                if (playerIndex !== -1) {
                    if (lobby.status === 'waiting') {
                        const disconnectedPlayer = lobby.players[playerIndex];
                        lobby.players.splice(playerIndex, 1);
                        lobby.playersCount = lobby.players.length;  // Обновляем счетчик
                        
                        if (lobby.players.length === 0) {
                            lobbies.delete(lobbyId);
                        } else {
                            if (lobby.creator === disconnectedPlayer.username) {
                                lobby.creator = lobby.players[0].username;
                            }
                            broadcastLobbyUpdate(lobbyId);
                        }
                        broadcastLobbiesList();
                    }
                    break;
                }
            }
        });
        
        // ================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==================
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