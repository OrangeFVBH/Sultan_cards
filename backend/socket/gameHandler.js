const Game = require('../models/Game');
const Player = require('../models/Player');
const User = require('../models/User');
const { cleanupDeadLobbies } = require('../utils/cleanup'); // ← ДОБАВЛЕНО

let lobbies = new Map();
let activeGames = new Map();
let tournamentScores = new Map();
let readyStatus = new Map();

const MAX_VISIBLE_LOBBIES = 5;
let ioInstance = null;

// Очистка старых лобби (запускается каждую минуту)
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, lobby] of lobbies) {
        if ((lobby.players.length === 0 || lobby.status === 'finished') && 
            (now - lobby.createdAt) > 3600000) {
            lobbies.delete(id);
            readyStatus.delete(id);
            cleaned++;
            console.log(`🗑️ Очистка старого лобби ${id}`);
        }
    }
    // Отправляем обновленный список, если есть изменения
    if (cleaned > 0 && ioInstance) {
        const waitingLobbies = Array.from(lobbies.values())
            .filter(l => l.status === 'waiting' && l.players.length < l.maxPlayers)
            .slice(0, MAX_VISIBLE_LOBBIES);
        
        const lobbiesList = waitingLobbies.map(l => ({
            lobbyId: l.lobbyId,
            name: l.name,
            creator: l.creator,
            playersCount: l.players.length,
            maxPlayers: l.maxPlayers,
            hasPassword: l.isPrivate
        }));
        
        ioInstance.emit('lobbiesList', lobbiesList);
    }
}, 60000);

module.exports = (io) => {
    ioInstance = io;
    
    async function cleanupGame(lobbyId) {
        console.log(`🧹 Очистка игры ${lobbyId} после завершения`);
        
        // 1. Получаем игру
        const game = activeGames.get(lobbyId);
        if (game) {
            // Отправляем всем игрокам команду на выход
            for (const p of game.players) {
                if (p.socket && p.socket.connected) {
                    try {
                        p.socket.emit('forceLeaveLobby', { message: 'Игра завершена' });
                        p.socket.emit('lobbyLeft', { force: true });
                        p.socket.currentLobby = null;
                        p.socket.currentUsername = null;
                        p.socket.leave(lobbyId);
                        p.socket.leave(`game_${lobbyId}`);
                    } catch (err) {
                        console.error(`Ошибка при очистке сокета ${p.username}:`, err);
                    }
                }
            }
            activeGames.delete(lobbyId);
        }
        
        // 2. Удаляем турнирные очки
        tournamentScores.delete(lobbyId);
        
        // 3. Удаляем статусы готовности
        readyStatus.delete(lobbyId);
        
        // 4. Удаляем лобби
        const lobby = lobbies.get(lobbyId);
        if (lobby) {
            // Удаляем всех игроков из лобби
            for (const player of lobby.players) {
                const playerSocket = ioInstance?.sockets?.sockets?.get(player.socketId);
                if (playerSocket && playerSocket.connected) {
                    try {
                        playerSocket.currentLobby = null;
                        playerSocket.currentUsername = null;
                        playerSocket.leave(lobbyId);
                    } catch (err) {
                        console.error(`Ошибка при очистке лобби для ${player.username}:`, err);
                    }
                }
            }
            lobbies.delete(lobbyId);
        }
        
        // 5. Обновляем список лобби
        broadcastLobbiesList();
        
        console.log(`✅ Игра ${lobbyId} полностью очищена`);
    }
    
    // ============ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ============
    function generateLobbyId() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }
    
    function broadcastLobbiesList() {
        const waitingLobbies = Array.from(lobbies.values())
            .filter(l => l.status === 'waiting' && l.players.length < l.maxPlayers)
            .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
            .slice(0, MAX_VISIBLE_LOBBIES);
        
        const lobbiesList = waitingLobbies.map(l => ({
            lobbyId: l.lobbyId,
            name: l.name,
            creator: l.creator,
            playersCount: l.players.length,
            maxPlayers: l.maxPlayers,
            hasPassword: l.isPrivate
        }));
        
        io.emit('lobbiesList', lobbiesList);
    }
    
    function broadcastLobbyUpdate(lobbyId) {
        const lobby = lobbies.get(lobbyId);
        if (lobby) {
            const readyMap = readyStatus.get(lobbyId) || new Map();
            const readyStatusObj = {};
            for (const [name, isReady] of readyMap.entries()) {
                readyStatusObj[name] = isReady;
            }
            io.to(lobbyId).emit('lobbyUpdate', { 
                lobbyId, 
                name: lobby.name, 
                creator: lobby.creator, 
                players: lobby.players.map(p => ({ username: p.username, ready: p.ready || false })), 
                playersCount: lobby.players.length, 
                maxPlayers: lobby.maxPlayers, 
                isPrivate: lobby.isPrivate, 
                status: lobby.status,
                readyStatus: readyStatusObj
            });
        }
    }

    io.on('connection', (socket) => {
        console.log(`[${new Date().toLocaleTimeString()}] Игрок подключился: ${socket.id}`);

        // ============ ПЕРЕПОДКЛЮЧЕНИЕ К ЛОББИ ============
        socket.on('reconnectToLobby', (data) => {
            const { username, lobbyId } = data;
            const lobby = lobbies.get(lobbyId);
            if (!lobby) {
                socket.emit('error', 'Лобби не найдено');
                socket.emit('redirectToLobbyList');
                return;
            }
            const playerInLobby = lobby.players.find(p => p.username === username);
            if (!playerInLobby) {
                socket.emit('error', 'Вы не в этом лобби');
                socket.emit('redirectToLobbyList');
                return;
            }
            playerInLobby.socketId = socket.id;
            socket.currentLobby = lobbyId;
            socket.currentUsername = username;
            socket.join(lobbyId);
            if (lobby.disconnectedPlayers && lobby.disconnectedPlayers[username]) {
                delete lobby.disconnectedPlayers[username];
            }
            
            if (!readyStatus.has(lobbyId)) {
                readyStatus.set(lobbyId, new Map());
            }
            const readyMap = readyStatus.get(lobbyId);
            if (!readyMap.has(username) && username !== lobby.creator) {
                readyMap.set(username, false);
                playerInLobby.ready = false;
            }
            
            socket.emit('lobbyUpdate', {
                lobbyId: lobby.lobbyId,
                name: lobby.name,
                creator: lobby.creator,
                players: lobby.players.map(p => ({ username: p.username, ready: p.ready || false })),
                playersCount: lobby.players.length,
                maxPlayers: lobby.maxPlayers,
                isPrivate: lobby.isPrivate,
                status: lobby.status,
                readyStatus: Object.fromEntries(readyStatus.get(lobbyId) || new Map())
            });
            if (lobby.chatHistory && lobby.chatHistory.length > 0) {
                socket.emit('lobbyChatHistory', lobby.chatHistory);
            }
            broadcastLobbyUpdate(lobbyId);
        });

        // ============ ПЕРЕПОДКЛЮЧЕНИЕ К ИГРЕ ============
        socket.on('reconnectToGame', (data) => {
            const { username, lobbyId } = data;
            const game = activeGames.get(lobbyId);
            if (!game) {
                socket.emit('error', 'Игра не найдена');
                return;
            }
            const player = game.players.find(p => p.username === username);
            if (!player) {
                socket.emit('error', 'Игрок не найден в игре');
                return;
            }
            player.socket = socket;
            player.id = socket.id;
            player.disconnected = false;
            player.disconnectTime = null;
            socket.currentLobby = lobbyId;
            socket.currentUsername = username;
            socket.join(lobbyId);
            socket.join(`game_${lobbyId}`);
            
            console.log(`✅ ${username} переподключился к игре`);
            
            const scores = tournamentScores.get(lobbyId);
            if (scores) {
                socket.emit('tournamentScoresUpdate', {
                    scores: Object.fromEntries(scores),
                    roundWinner: null,
                    loser: null,
                    winTarget: game.consecutiveWinsNeeded
                });
            }
            
            if (game._gameFrozen) {
                const frozenState = game.getStateForPlayer(player.id);
                socket.emit('gameState', frozenState);
            } else if (game.dealingComplete && !game._gameFrozen) {
                const state = game.getStateForPlayer(player.id);
                socket.emit('gameState', state);
            } else if (!game.dealingComplete) {
                const dealerIndex = game.currentDealerIndex;
                if (dealerIndex !== null) {
                    const playersForAnimation = game.players.map(p => ({ username: p.username, id: p.id }));
                    const cardsPerPlayer = game.maxPlayers === 2 ? 6 : 12;
                    socket.emit('dealAnimation', {
                        players: playersForAnimation,
                        dealerIndex: dealerIndex,
                        totalCards: 36,
                        cardsPerPlayer: cardsPerPlayer
                    });
                }
            }
            
            const lobby = lobbies.get(lobbyId);
            if (lobby) {
                const playerInLobby = lobby.players.find(p => p.username === username);
                if (playerInLobby) playerInLobby.socketId = socket.id;
                if (lobby.disconnectedPlayers && lobby.disconnectedPlayers[username]) {
                    delete lobby.disconnectedPlayers[username];
                }
            }
        });

        // ============ СОЗДАНИЕ ЛОББИ ============
        socket.on('createLobby', (data, callback) => {
            const { username, isPrivate, password, lobbyName, maxPlayers = 3 } = data;
            if (!username) {
                if (callback) callback({ success: false, error: 'Не указано имя пользователя' });
                return;
            }
            
            const waitingLobbiesCount = Array.from(lobbies.values()).filter(l => l.status === 'waiting').length;
            
            if (waitingLobbiesCount >= MAX_VISIBLE_LOBBIES) {
                if (callback) callback({ 
                    success: false, 
                    error: `Достигнуто максимальное количество лобби (${MAX_VISIBLE_LOBBIES}). Дождитесь, пока освободится место.` 
                });
                return;
            }
            
            // Удаляем старые пустые лобби этого пользователя
            for (const [id, lobby] of lobbies.entries()) {
                if (lobby.creator === username && lobby.status === 'waiting') {
                    const hasOtherPlayers = lobby.players.some(p => p.username !== username);
                    if (!hasOtherPlayers) {
                        lobbies.delete(id);
                        readyStatus.delete(id);
                    }
                }
            }
            
            const providedName = lobbyName || `Лобби ${generateLobbyId().slice(0, 6)}`;
            const lobbyId = generateLobbyId();
            const lobby = {
                lobbyId,
                name: providedName,
                creator: username,
                players: [{ username, socketId: socket.id, joinedAt: new Date(), ready: false }],
                playersCount: 1,
                isPrivate: isPrivate || false,
                password: isPrivate ? password : null,
                maxPlayers: maxPlayers,
                status: 'waiting',
                disconnectedPlayers: {},
                chatHistory: [],
                createdAt: Date.now()
            };
            lobbies.set(lobbyId, lobby);
            
            const readyMap = new Map();
            readyMap.set(username, true);
            readyStatus.set(lobbyId, readyMap);
            
            socket.join(lobbyId);
            socket.currentLobby = lobbyId;
            socket.currentUsername = username;
            if (callback) callback({ success: true, lobbyId, lobby });
            broadcastLobbiesList();
        });

        // ============ ПОЛУЧЕНИЕ СПИСКА ЛОББИ ============
        socket.on('getLobbies', () => {
            const allLobbies = Array.from(lobbies.values())
                .filter(l => l.status === 'waiting' && l.players.length < l.maxPlayers)
                .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
                .slice(0, MAX_VISIBLE_LOBBIES)
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

        // ============ ВХОД В ЛОББИ ============
        socket.on('joinLobby', (data, callback) => {
            const { lobbyId, username, password } = data;
            if (!username || !lobbyId) {
                if (callback) callback({ success: false, error: 'Не указаны данные для входа' });
                return;
            }
            const lobby = lobbies.get(lobbyId);
            if (!lobby) {
                if (callback) callback({ success: false, error: 'Лобби не найдено' });
                return;
            }
            if (lobby.status !== 'waiting') {
                if (callback) callback({ success: false, error: 'Игра уже началась' });
                return;
            }
            if (lobby.players.length >= lobby.maxPlayers) {
                if (callback) callback({ success: false, error: 'Лобби заполнено' });
                return;
            }
            if (lobby.isPrivate && lobby.password !== password) {
                if (callback) callback({ success: false, error: 'Неверный пароль', needPassword: true });
                return;
            }
            if (lobby.players.some(p => p.username === username)) {
                if (callback) callback({ success: false, error: 'Вы уже в этом лобби' });
                return;
            }
            lobby.players.push({ username, socketId: socket.id, joinedAt: new Date(), ready: false });
            lobby.playersCount = lobby.players.length;
            socket.join(lobbyId);
            socket.currentLobby = lobbyId;
            socket.currentUsername = username;
            
            if (!readyStatus.has(lobbyId)) {
                readyStatus.set(lobbyId, new Map());
            }
            const readyMap = readyStatus.get(lobbyId);
            if (!readyMap.has(username)) {
                readyMap.set(username, false);
            }
            
            if (lobby.chatHistory && lobby.chatHistory.length > 0) {
                socket.emit('lobbyChatHistory', lobby.chatHistory);
            }
            if (callback) callback({ success: true, lobby: {
                lobbyId: lobby.lobbyId,
                name: lobby.name,
                creator: lobby.creator,
                players: lobby.players.map(p => ({ username: p.username, ready: p.ready || false })),
                playersCount: lobby.players.length,
                maxPlayers: lobby.maxPlayers,
                isPrivate: lobby.isPrivate,
                status: lobby.status,
                readyStatus: Object.fromEntries(readyStatus.get(lobbyId) || new Map())
            }});
            broadcastLobbyUpdate(lobbyId);
            broadcastLobbiesList();
        });

        // ============ ГОТОВНОСТЬ ============
        socket.on('toggleReady', (data, callback) => {
            const { lobbyId, username } = data;
            const lobby = lobbies.get(lobbyId);
            
            if (!lobby) {
                if (callback) callback({ success: false, error: 'Лобби не найдено' });
                return;
            }
            
            if (lobby.creator === username) {
                if (callback) callback({ success: false, error: 'Создатель всегда готов' });
                return;
            }
            
            const readyMap = readyStatus.get(lobbyId);
            if (!readyMap) {
                if (callback) callback({ success: false, error: 'Ошибка статуса' });
                return;
            }
            
            const currentReady = readyMap.get(username) || false;
            readyMap.set(username, !currentReady);
            
            const player = lobby.players.find(p => p.username === username);
            if (player) {
                player.ready = !currentReady;
            }
            
            const allReadyStatus = {};
            for (const [playerName, isReady] of readyMap.entries()) {
                allReadyStatus[playerName] = isReady;
            }
            
            io.to(lobbyId).emit('readyStatusUpdate', { 
                readyStatus: allReadyStatus,
                creator: lobby.creator
            });
            
            broadcastLobbyUpdate(lobbyId);
            
            if (callback) callback({ success: true, ready: !currentReady });
        });

        // ============ КИК ИГРОКА ============
        socket.on('kickPlayer', (data, callback) => {
            const { lobbyId, usernameToKick } = data;
            const lobby = lobbies.get(lobbyId);
            if (!lobby) {
                if (callback) callback({ success: false, error: 'Лобби не найдено' });
                return;
            }
            if (lobby.creator !== socket.currentUsername) {
                if (callback) callback({ success: false, error: 'Только создатель может кикать' });
                return;
            }
            const playerToKick = lobby.players.find(p => p.username === usernameToKick);
            if (!playerToKick) {
                if (callback) callback({ success: false, error: 'Игрок не найден' });
                return;
            }
            if (usernameToKick === socket.currentUsername) {
                if (callback) callback({ success: false, error: 'Нельзя кикнуть себя' });
                return;
            }
            lobby.players = lobby.players.filter(p => p.username !== usernameToKick);
            lobby.playersCount = lobby.players.length;
            
            const readyMap = readyStatus.get(lobbyId);
            if (readyMap) {
                readyMap.delete(usernameToKick);
            }
            
            io.to(playerToKick.socketId).emit('kickedFromLobby', { message: `Вас кикнули из лобби ${lobby.name}` });
            io.to(playerToKick.socketId).emit('redirectToLobbyList');
            broadcastLobbyUpdate(lobbyId);
            broadcastLobbiesList();
            if (callback) callback({ success: true });
        });

        // ============ ВЫХОД ИЗ ЛОББИ ============
        socket.on('leaveLobby', (data, callback) => {
            const lobbyId = socket.currentLobby;
            const username = socket.currentUsername;
            if (!lobbyId) {
                if (callback) callback({ success: false, error: 'Вы не в лобби' });
                return;
            }
            const lobby = lobbies.get(lobbyId);
            if (!lobby) {
                delete socket.currentLobby;
                delete socket.currentUsername;
                if (callback) callback({ success: true });
                return;
            }
            const game = activeGames.get(lobbyId);
            if (game && lobby.status === 'playing') {
                if (callback) callback({ success: false, error: 'Нельзя покинуть игру' });
                return;
            }
            lobby.players = lobby.players.filter(p => p.username !== username);
            lobby.playersCount = lobby.players.length;
            
            const readyMap = readyStatus.get(lobbyId);
            if (readyMap) {
                readyMap.delete(username);
            }
            
            if (lobby.players.length === 0) {
                lobbies.delete(lobbyId);
                readyStatus.delete(lobbyId);
            } else {
                if (lobby.creator === username) lobby.creator = lobby.players[0].username;
                broadcastLobbyUpdate(lobbyId);
            }
            broadcastLobbiesList();
            socket.leave(lobbyId);
            delete socket.currentLobby;
            delete socket.currentUsername;
            socket.emit('lobbyLeft', { success: true });
            if (callback) callback({ success: true });
        });

        // ============ ВЫХОД ИЗ ИГРЫ ============
        socket.on('playerExitGame', async (data) => {
            const { username, lobbyId } = data;
            const game = activeGames.get(lobbyId);
            
            if (!game) {
                socket.emit('exitConfirmed');
                return;
            }
            
            const exitingPlayer = game.players.find(p => p.username === username);
            if (!exitingPlayer) {
                socket.emit('exitConfirmed');
                return;
            }
            
            console.log(`🚪 Игрок ${username} вышел из игры`);
            
            if (game.players.length === 2) {
                const winner = game.players.find(p => p.username !== username);
                if (winner) {
                    await game.awardWinnerCoins(winner.username, game.totalPot);
                    
                    game.players.forEach(p => {
                        if (p.socket && p.socket.connected) {
                            p.socket.emit('gameOver', { 
                                winner: winner.username,
                                message: `${username} покинул игру`
                            });
                            p.socket.emit('forceLeaveLobby', { message: 'Игра завершена' });
                            p.socket.currentLobby = null;
                            p.socket.currentUsername = null;
                        }
                    });
                    
                    game.cleanupLobbyAfterGame(lobbyId);
                }
            } else {
                const refundPerPlayer = Math.floor(game.totalPot / game.players.length);
                
                for (const player of game.players) {
                    if (player.username !== username) {
                        try {
                            const user = await User.findOne({ username: player.username });
                            if (user) {
                                user.coins += refundPerPlayer;
                                await user.save();
                            }
                            
                            if (player.socket && player.socket.connected) {
                                player.socket.emit('chatMessage', {
                                    username: '🔄 СИСТЕМА',
                                    message: `${username} покинул игру. Вам возвращено ${refundPerPlayer} кранов.`
                                });
                                player.socket.emit('gameOver', { 
                                    winner: 'Ничья - игрок покинул игру',
                                    isDraw: true
                                });
                                player.socket.emit('forceLeaveLobby', { message: 'Игра завершена' });
                                player.socket.currentLobby = null;
                                player.socket.currentUsername = null;
                            }
                        } catch (error) {
                            console.error('Ошибка возврата кранов:', error);
                        }
                    }
                }
                
                const lobby = lobbies.get(lobbyId);
                if (lobby) {
                    lobby.players = lobby.players.filter(p => p.username !== username);
                    lobby.playersCount = lobby.players.length;
                    
                    if (lobby.players.length === 0) {
                        lobbies.delete(lobbyId);
                        readyStatus.delete(lobbyId);
                    } else {
                        if (lobby.creator === username) lobby.creator = lobby.players[0].username;
                        broadcastLobbyUpdate(lobbyId);
                    }
                    broadcastLobbiesList();
                }
                
                activeGames.delete(lobbyId);
                tournamentScores.delete(lobbyId);
            }
            
            socket.emit('exitConfirmed');
        });

        // ============ ЗАПУСК ИГРЫ ============
        socket.on('startGame', async (data, callback) => {
            const lobbyId = socket.currentLobby;
            const lobby = lobbies.get(lobbyId);
            
            if (!lobby) {
                if (callback) callback({ success: false, error: 'Лобби не найдено' });
                return;
            }
            if (lobby.creator !== socket.currentUsername) {
                if (callback) callback({ success: false, error: 'Только создатель может начать' });
                return;
            }
            if (lobby.players.length < 2) {
                if (callback) callback({ success: false, error: `Нужно минимум 2 игрока (сейчас ${lobby.players.length})` });
                return;
            }
            
            const readyMap = readyStatus.get(lobbyId);
            let allReady = true;
            let notReadyPlayers = [];
            
            for (const player of lobby.players) {
                if (player.username !== lobby.creator) {
                    const isReady = readyMap ? readyMap.get(player.username) : false;
                    if (!isReady) {
                        allReady = false;
                        notReadyPlayers.push(player.username);
                    }
                }
            }
            
            if (!allReady) {
                if (callback) callback({ 
                    success: false, 
                    error: `Не все игроки готовы! Ожидают: ${notReadyPlayers.join(', ')}` 
                });
                return;
            }
            
            // ============ ПРОВЕРКА КРАНОВ ДЛЯ 3 ИГРОКОВ ============
            const ENTRY_COST = 500;
            let totalPot = 0;
            
            if (lobby.maxPlayers === 3) {
                const insufficientCoins = [];
                
                for (const player of lobby.players) {
                    try {
                        const user = await User.findOne({ username: player.username });
                        if (!user || user.coins < ENTRY_COST) {
                            insufficientCoins.push(player.username);
                        }
                    } catch (error) {
                        console.error(`Ошибка проверки баланса ${player.username}:`, error);
                        insufficientCoins.push(player.username);
                    }
                }
                
                if (insufficientCoins.length > 0) {
                    if (callback) callback({ 
                        success: false, 
                        error: `Недостаточно кранов у: ${insufficientCoins.join(', ')}. Нужно по ${ENTRY_COST} кранов.` 
                    });
                    return;
                }
                
                // Списываем краны
                for (const player of lobby.players) {
                    try {
                        const user = await User.findOne({ username: player.username });
                        if (user) {
                            user.coins -= ENTRY_COST;
                            await user.save();
                            console.log(`💰 ${player.username} заплатил ${ENTRY_COST} кранов. Баланс: ${user.coins}`);
                            
                            const playerSocket = io.sockets.sockets?.get?.(player.socketId) || io.sockets.connected?.[player.socketId];
                            if (playerSocket && playerSocket.connected) {
                                playerSocket.emit('coinsUpdated', { coins: user.coins });
                            }
                        }
                    } catch (error) {
                        console.error(`Ошибка списания кранов у ${player.username}:`, error);
                    }
                }
                
                totalPot = ENTRY_COST * lobby.players.length;
                console.log(`💰 Банк игры: ${totalPot} кранов (${ENTRY_COST} × ${lobby.players.length})`);
            } else {
                totalPot = 0;
                console.log(`💰 Вход в игру бесплатный (2 игрока)`);
            }
            
            // ============ ПРОВЕРКА НАЛИЧИЯ ИГРОКОВ В СЕТИ ============
            const unavailablePlayers = [];
            for (const player of lobby.players) {
                const playerSocket = io.sockets.sockets?.get?.(player.socketId) || io.sockets.connected?.[player.socketId];
                if (!playerSocket || !playerSocket.connected) {
                    unavailablePlayers.push(player.username);
                }
            }
            if (unavailablePlayers.length > 0) {
                // Возвращаем краны, если уже списали
                if (lobby.maxPlayers === 3) {
                    for (const player of lobby.players) {
                        try {
                            const user = await User.findOne({ username: player.username });
                            if (user) {
                                user.coins += ENTRY_COST;
                                await user.save();
                            }
                        } catch (error) {
                            console.error('Ошибка возврата кранов:', error);
                        }
                    }
                }
                if (callback) callback({ success: false, error: `Игроки не в сети: ${unavailablePlayers.join(', ')}` });
                return;
            }
            
            // ============ СОЗДАНИЕ ИГРЫ ============
            const scores = new Map();
            lobby.players.forEach(p => scores.set(p.username, 0));
            tournamentScores.set(lobbyId, scores);
            lobby.status = 'playing';
            
            const gamePlayers = lobby.players.map(p => new Player(p.socketId, p.username, io.sockets.sockets?.get?.(p.socketId) || io.sockets.connected?.[p.socketId]));
            
            // Для 2 игроков устанавливаем цель - 5 побед в общем
            // Для 3 игроков - 3 победы подряд
            const winTarget = lobby.maxPlayers === 2 ? 5 : 3;
            
            const game = new Game(gamePlayers, lobby.maxPlayers, lobbyId, totalPot);
            game.consecutiveWinsNeeded = winTarget;
            
            game.currentDealerIndex = Math.floor(Math.random() * game.players.length);
            console.log(`🎲 Сохранён дилер для игры ${lobbyId}: ${game.players[game.currentDealerIndex]?.username} (индекс ${game.currentDealerIndex})`);
            console.log(`👑 Условие победы: ${lobby.maxPlayers === 2 ? '5 побед в общем' : '3 победы подряд'}`);
            
            game.cleanupLobbyAfterGame = (lobbyId) => {
                const lobby = lobbies.get(lobbyId);
                if (lobby) {
                    const readyMap = readyStatus.get(lobbyId);
                    if (readyMap) readyMap.clear();
                    
                    lobby.status = 'waiting';
                    lobby.playersCount = lobby.players.length;
                    
                    lobby.players.forEach(player => {
                        const playerSocket = io.sockets.sockets?.get?.(player.socketId) || io.sockets.connected?.[player.socketId];
                        if (playerSocket && playerSocket.connected) {
                            playerSocket.currentLobby = null;
                            playerSocket.currentUsername = null;
                            playerSocket.emit('forceLeaveLobby', { message: 'Игра завершена' });
                            playerSocket.emit('lobbyLeft', { force: true });
                        }
                    });
                    
                    lobbies.delete(lobbyId);
                    readyStatus.delete(lobbyId);
                    broadcastLobbiesList();
                }
                
                activeGames.delete(lobbyId);
                tournamentScores.delete(lobbyId);
            };
            
            activeGames.set(lobbyId, game);
            
            // Отправляем события игрокам
            for (const player of lobby.players) {
                const playerSocket = io.sockets.sockets?.get?.(player.socketId) || io.sockets.connected?.[player.socketId];
                if (playerSocket) {
                    playerSocket.currentLobby = lobbyId;
                    playerSocket.join(`game_${lobbyId}`);
                    playerSocket.emit('gameStarted', {
                        lobbyId: lobbyId,
                        username: player.username,
                        tournamentScores: Object.fromEntries(scores),
                        winTarget: winTarget,
                        totalPot: totalPot,
                        entryCost: lobby.maxPlayers === 3 ? ENTRY_COST : 0
                    });
                }
            }
            
            setTimeout(() => {
                const currentGame = activeGames.get(lobbyId);
                if (currentGame) {
                    console.log(`🎬 Запуск анимации раздачи, дилер: ${currentGame.players[currentGame.currentDealerIndex]?.username}`);
                    currentGame.startDealingAnimation();
                }
            }, 2000);
            
            if (callback) callback({ success: true });
            broadcastLobbiesList();
        });

        // ============ ЗАПРОС СОСТОЯНИЯ ИГРЫ ============
        socket.on('requestGameState', (data) => {
            let username, lobbyId;
            if (typeof data === 'string') { username = data; lobbyId = socket.currentLobby; }
            else { username = data.username; lobbyId = data.lobbyId; }
            const finalId = lobbyId || socket.currentLobby;
            if (!finalId) return;
            const game = activeGames.get(finalId);
            if (!game) return;
            const player = game.players.find(p => p.username === username);
            if (player) {
                player.socket = socket;
                player.id = socket.id;
                player.disconnected = false;
                player.disconnectTime = null;
                socket.currentLobby = finalId;
                socket.currentUsername = username;
                socket.join(finalId);
                
                const state = game.getStateForPlayer(player.id);
                socket.emit('gameState', state);
            }
        });

        // ============ ИГРОВЫЕ ДЕЙСТВИЯ ============
        socket.on('attack', (data, callback) => {
            const game = activeGames.get(socket.currentLobby);
            if (game) {
                if (game._gameFrozen) {
                    if (callback) callback({ success: false, error: 'Раунд завершён, ожидайте следующий' });
                    return;
                }
                const result = game.attack(socket.id, data.cardIndex);
                if (callback) callback(result);
                afterGameAction(socket.currentLobby);
            }
        });
        
        socket.on('defend', (data, callback) => {
            const game = activeGames.get(socket.currentLobby);
            if (game) {
                if (game._gameFrozen) {
                    if (callback) callback({ success: false, error: 'Раунд завершён, ожидайте следующий' });
                    return;
                }
                const result = game.defend(socket.id, data.cardIndex);
                if (callback) callback(result);
                afterGameAction(socket.currentLobby);
            }
        });
        
        socket.on('endTurn', (data, callback) => {
            const game = activeGames.get(socket.currentLobby);
            if (game) {
                if (game._gameFrozen) {
                    if (callback) callback({ success: false, error: 'Раунд завершён, ожидайте следующий' });
                    return;
                }
                const result = game.endTurn(socket.id);
                if (callback) callback(result);
                afterGameAction(socket.currentLobby);
            }
        });
        
        socket.on('takeCards', (data, callback) => {
            const game = activeGames.get(socket.currentLobby);
            if (game) {
                if (game._gameFrozen) {
                    if (callback) callback({ success: false, error: 'Раунд завершён, ожидайте следующий' });
                    return;
                }
                const result = game.takeCards(socket.id);
                if (callback) callback(result);
                afterGameAction(socket.currentLobby);
            }
        });
        
        socket.on('additionalAttack', (data, callback) => {
            const game = activeGames.get(socket.currentLobby);
            if (game) {
                if (game._gameFrozen) {
                    if (callback) callback({ success: false, error: 'Раунд завершён, ожидайте следующий' });
                    return;
                }
                const result = game.additionalAttack(socket.id, data.cardIndex);
                if (callback) callback(result);
                afterGameAction(socket.currentLobby);
            }
        });
        
        socket.on('endAdditionalAttack', (data, callback) => {
            const game = activeGames.get(socket.currentLobby);
            if (game) {
                if (game._gameFrozen) {
                    if (callback) callback({ success: false, error: 'Раунд завершён, ожидайте следующий' });
                    return;
                }
                const result = game.endAdditionalAttack(socket.id);
                if (callback) callback(result);
                afterGameAction(socket.currentLobby);
            }
        });

        // ============ АНИМАЦИЯ РАЗДАЧИ ============
        socket.on('startDealingAnimation', (data) => {
            const lobbyId = data.lobbyId || socket.currentLobby;
            if (lobbyId) socket.to(lobbyId).emit('startDealingAnimation');
        });

        // ============ ОТКЛЮЧЕНИЕ ============
        socket.on('disconnect', async () => {
            const disconnectedLobbyId = socket.currentLobby;
            const disconnectedUsername = socket.currentUsername;
            
            console.log(`🔌 Игрок отключился: ${disconnectedUsername || 'неизвестный'} (${socket.id})`);
            
            if (!disconnectedUsername) return;
            
            // Проверяем, есть ли другие соединения этого пользователя
            let hasOtherSocket = false;
            for (const [id, s] of io.sockets.sockets) {
                if (id !== socket.id && s.currentUsername === disconnectedUsername && s.connected) {
                    hasOtherSocket = true;
                    break;
                }
            }
            if (hasOtherSocket) {
                console.log(`🔄 У ${disconnectedUsername} есть другие активные соединения, пропускаем очистку`);
                return;
            }
            
            // Проверяем, был ли пользователь в игре
            if (disconnectedLobbyId) {
                const game = activeGames.get(disconnectedLobbyId);
                if (game) {
                    const playerInGame = game.players.find(p => p.username === disconnectedUsername);
                    if (playerInGame) {
                        playerInGame.disconnected = true;
                        playerInGame.disconnectTime = Date.now();
                        
                        game.players.forEach(p => {
                            if (p.socket && p.socket.connected && p.username !== disconnectedUsername) {
                                p.socket.emit('chatMessage', {
                                    username: 'Система',
                                    message: `${disconnectedUsername} отключился. Ожидаем переподключения... (30 сек)`
                                });
                            }
                        });
                        
                        setTimeout(async () => {
                            const currentGame = activeGames.get(disconnectedLobbyId);
                            if (currentGame) {
                                const player = currentGame.players.find(p => p.username === disconnectedUsername);
                                if (player && player.disconnected && (Date.now() - (player.disconnectTime || 0)) >= 30000) {
                                    console.log(`⏰ ${disconnectedUsername} не переподключился, завершаем игру`);
                                    
                                    const refundPerPlayer = Math.floor(currentGame.totalPot / currentGame.players.length);
                                    for (const p of currentGame.players) {
                                        try {
                                            const user = await User.findOne({ username: p.username });
                                            if (user && p.username !== disconnectedUsername) {
                                                user.coins += refundPerPlayer;
                                                await user.save();
                                            }
                                        } catch (error) {
                                            console.error('Ошибка возврата кранов:', error);
                                        }
                                    }
                                    
                                    currentGame.players.forEach(p => {
                                        if (p.socket && p.socket.connected) {
                                            p.socket.emit('gameOver', { 
                                                winner: 'Игра прервана', 
                                                disconnectedPlayer: disconnectedUsername 
                                            });
                                            p.socket.emit('forceLeaveLobby', { message: 'Игра прервана' });
                                            p.socket.currentLobby = null;
                                            p.socket.currentUsername = null;
                                        }
                                    });
                                    
                                    activeGames.delete(disconnectedLobbyId);
                                    tournamentScores.delete(disconnectedLobbyId);
                                    
                                    const lobby = lobbies.get(disconnectedLobbyId);
                                    if (lobby) {
                                        lobbies.delete(disconnectedLobbyId);
                                        readyStatus.delete(disconnectedLobbyId);
                                    }
                                    broadcastLobbiesList();
                                }
                            }
                        }, 30000);
                        return;
                    }
                }
            }
            
            // Если пользователь был в лобби (не в игре)
            if (disconnectedLobbyId) {
                const lobby = lobbies.get(disconnectedLobbyId);
                if (lobby) {
                    const playerIndex = lobby.players.findIndex(p => p.username === disconnectedUsername);
                    if (playerIndex !== -1) {
                        lobby.players.splice(playerIndex, 1);
                        lobby.playersCount = lobby.players.length;
                        
                        const readyMap = readyStatus.get(disconnectedLobbyId);
                        if (readyMap) {
                            readyMap.delete(disconnectedUsername);
                        }
                        
                        if (lobby.players.length === 0) {
                            lobbies.delete(disconnectedLobbyId);
                            readyStatus.delete(disconnectedLobbyId);
                            console.log(`🗑️ Лобби ${disconnectedLobbyId} удалено (пустое)`);
                        } else {
                            if (lobby.creator === disconnectedUsername) {
                                lobby.creator = lobby.players[0].username;
                            }
                            broadcastLobbyUpdate(disconnectedLobbyId);
                        }
                        broadcastLobbiesList();
                    }
                }
            }
            
            delete socket.currentLobby;
            delete socket.currentUsername;
        });

        // ============ ЧАТ ============
        socket.on('chatMessage', (data) => io.to(`game_${data.lobbyId}`).emit('chatMessage', { username: data.username, message: data.message }));
        socket.on('chatSticker', (data) => io.to(`game_${data.lobbyId}`).emit('chatSticker', { username: data.username, stickerId: data.stickerId }));
        socket.on('lobbyChatMessage', (data) => {
            const lobby = lobbies.get(data.lobbyId);
            if (lobby) {
                if (!lobby.chatHistory) lobby.chatHistory = [];
                lobby.chatHistory.push({ username: data.username, message: data.message, stickerId: null, timestamp: Date.now() });
                if (lobby.chatHistory.length > 100) lobby.chatHistory.shift();
                io.to(data.lobbyId).emit('lobbyChatMessage', { username: data.username, message: data.message });
            }
        });
        socket.on('lobbyChatSticker', (data) => {
            const lobby = lobbies.get(data.lobbyId);
            if (lobby) {
                if (!lobby.chatHistory) lobby.chatHistory = [];
                lobby.chatHistory.push({ username: data.username, message: null, stickerId: data.stickerId, timestamp: Date.now() });
                if (lobby.chatHistory.length > 100) lobby.chatHistory.shift();
                io.to(data.lobbyId).emit('lobbyChatSticker', { username: data.username, stickerId: data.stickerId });
            }
        });

        // ============ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ============
        function generateLobbyId() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }
        
        function broadcastLobbyUpdate(lobbyId) {
            const lobby = lobbies.get(lobbyId);
            if (lobby) {
                const readyMap = readyStatus.get(lobbyId) || new Map();
                const readyStatusObj = {};
                for (const [name, isReady] of readyMap.entries()) {
                    readyStatusObj[name] = isReady;
                }
                io.to(lobbyId).emit('lobbyUpdate', { 
                    lobbyId, 
                    name: lobby.name, 
                    creator: lobby.creator, 
                    players: lobby.players.map(p => ({ username: p.username, ready: p.ready || false })), 
                    playersCount: lobby.players.length, 
                    maxPlayers: lobby.maxPlayers, 
                    isPrivate: lobby.isPrivate, 
                    status: lobby.status,
                    readyStatus: readyStatusObj
                });
            }
        }
        
        function afterGameAction(lobbyId) {
            const game = activeGames.get(lobbyId);
            if (!game) return;
            
            // Если игра не заморожена - просто транслируем состояние
            if (!game._gameFrozen) {
                game.broadcast();
                return;
            }
            
            // ============ ИГРА ЗАМОРОЖЕНА ============
            console.log('⏸️ Игра заморожена, обработка завершения раунда...');
            
            if (!game._roundOverSent) return;
            
            const scores = tournamentScores.get(lobbyId);
            if (!scores) return;
            
            // ============ ДЛЯ 2 ИГРОКОВ ============
            if (game.maxPlayers === 2) {
                const winners = game.players.filter(p => p.hand.length === 0);
                const losers = game.players.filter(p => p.hand.length > 0);
                
                if (game._isDraw === true) {
                    if (!game._drawProcessed) {
                        game._drawProcessed = true;
                        console.log('🤝 ИГРА ЗАВЕРШЕНА НИЧЬЕЙ');
                        game._gameFrozen = false;
                        game._roundOverSent = false;
                        game._isDraw = false;
                        game._drawProcessed = false;
                        game.resetForNewRound();
                        setTimeout(() => game.startDealingAnimation(), 1000);
                    }
                    return;
                }
                
                if (winners.length === 1 && losers.length === 1) {
                    const roundWinner = winners[0].username;
                    const loser = losers[0].username;
                    
                    game.players.forEach(p => {
                        if (p.socket && p.socket.connected) {
                            p.socket.emit('roundOver', {
                                roundWinner: roundWinner,
                                loser: loser,
                                allWinners: [roundWinner],
                                isSubRound: false
                            });
                        }
                    });
                    
                    game.checkSultan(lobbyId, scores, roundWinner, false).then(result => {
                        if (result) {
                            // Отправляем событие всем игрокам
                            game.players.forEach(p => {
                                if (p.socket && p.socket.connected) {
                                    p.socket.emit('gameOver', {
                                        winner: result,
                                        isWinner: p.username === result,
                                        message: `🏆 ${result} победил и получает 500 кранов!`
                                    });
                                    setTimeout(() => {
                                        if (p.socket && p.socket.connected) {
                                            p.socket.emit('forceLeaveLobby', { message: 'Игра завершена' });
                                            p.socket.emit('lobbyLeft', { force: true });
                                            p.socket.currentLobby = null;
                                            p.socket.currentUsername = null;
                                            p.socket.leave(lobbyId);
                                            p.socket.leave(`game_${lobbyId}`);
                                        }
                                    }, 3000);
                                }
                            });
                            
                            setTimeout(() => {
                                cleanupGame(lobbyId);
                            }, 4000);
                        } else {
                            setTimeout(() => {
                                const g = activeGames.get(lobbyId);
                                if (g && !g._isDraw) {
                                    g._roundOverSent = false;
                                    g._gameFrozen = false;
                                    g.resetForNewRound();
                                    setTimeout(() => g.startDealingAnimation(), 1000);
                                }
                            }, 3000);
                        }
                    });
                }
                return;
            }
            
            // ============ ДЛЯ 3 ИГРОКОВ ============
            
            // ⭐ ПРОВЕРКА: ЭТО ДОПОЛНИТЕЛЬНЫЙ РАУНД
            if (game._subRoundStarted && game._roundOverSent && !game._subRoundCompleted) {
                // Помечаем доп. раунд как завершенный
                game._subRoundCompleted = true;
                game._subRoundFinished = true;
                
                console.log('🎯 ДОПОЛНИТЕЛЬНЫЙ РАУНД ЗАВЕРШЕН!');
                
                // ⭐ В ДОПОЛНИТЕЛЬНОМ РАУНДЕ УЧАСТВУЮТ ТОЛЬКО 2 ИГРОКА (БЕЗ ДИЛЕРА)
                const activePlayers = game.players.filter(p => p.username !== game._previousLoser?.username);
                const activeWithCards = activePlayers.filter(p => p.hand.length > 0);
                const activeWithoutCards = activePlayers.filter(p => p.hand.length === 0);
                
                console.log(`📊 Активные игроки: ${activePlayers.map(p => p.username).join(', ')}`);
                console.log(`📊 Без карт: ${activeWithoutCards.map(p => p.username).join(', ')}`);
                console.log(`📊 С картами: ${activeWithCards.map(p => p.username).join(', ')}`);
                
                // Проверяем, есть ли победитель в доп.раунде (один из активных игроков сбросил карты)
                if (activeWithoutCards.length === 1 && activeWithCards.length === 1) {
                    const subRoundWinner = activeWithoutCards[0];
                    const subRoundLoser = activeWithCards[0];
                    
                    console.log(`🏆 Победитель доп.раунда: ${subRoundWinner.username}, проигравший: ${subRoundLoser.username}`);
                    
                    // Проверяем, есть ли у проигравшего серия
                    const consecutiveInfo = game._tournamentData?.playersConsecutive?.get(subRoundLoser.username) || 0;
                    
                    if (consecutiveInfo >= 1 && !game._drawProcessed) {
                        game._drawProcessed = true;
                        game._isDraw = true;
                        console.log(`⚠️ ${subRoundLoser.username} имел серию побед (${consecutiveInfo}), но проиграл в ДОПОЛНИТЕЛЬНОМ раунде! НИЧЬЯ!`);
                        
                        game.refundCoinsOnDraw().then(() => {
                            game.players.forEach(p => {
                                if (p.socket && p.socket.connected) {
                                    p.socket.emit('chatMessage', {
                                        username: '⚠️ СИСТЕМА',
                                        message: `${subRoundLoser.username} имел серию из ${consecutiveInfo} побед, но проиграл в дополнительном раунде! Ничья!`
                                    });
                                    p.socket.emit('gameOver', { 
                                        winner: 'Ничья - серия султана прервана', 
                                        isDraw: true
                                    });
                                    setTimeout(() => {
                                        if (p.socket && p.socket.connected) {
                                            p.socket.emit('forceLeaveLobby', { message: 'Игра завершена' });
                                            p.socket.emit('lobbyLeft', { force: true });
                                            p.socket.currentLobby = null;
                                            p.socket.currentUsername = null;
                                            p.socket.leave(lobbyId);
                                            p.socket.leave(`game_${lobbyId}`);
                                        }
                                    }, 2000);
                                }
                            });
                            
                            setTimeout(() => {
                                cleanupGame(lobbyId);
                            }, 3000);
                        });
                        return;
                    }
                    
                    // ⭐ НАЧИСЛЯЕМ ОЧКО ПОБЕДИТЕЛЮ ДОП. РАУНДА
                    const currentScore = (scores.get(subRoundWinner.username) || 0) + 1;
                    scores.set(subRoundWinner.username, currentScore);
                    
                    console.log(`📊 Доп. раунд: ${subRoundWinner.username} получает +1 очко (всего: ${currentScore})`);
                    
                    game.players.forEach(p => {
                        if (p.socket && p.socket.connected) {
                            p.socket.emit('tournamentScoresUpdate', {
                                scores: Object.fromEntries(scores),
                                roundWinner: subRoundWinner.username,
                                loser: subRoundLoser.username,
                                winTarget: 3,
                                isSubRound: true
                            });
                        }
                    });
                    
                    // ⭐ ПРОВЕРЯЕМ, НЕ СТАЛ ЛИ КТО-ТО СУЛТАНОМ
                    game.checkSultan(lobbyId, scores, subRoundWinner.username, true).then(result => {
                        console.log(`📊 Результат checkSultan для доп.раунда: ${result}`);
                        
                        if (result === 'draw') {
                            console.log('🤝 Ничья в доп.раунде, игра завершена');
                            setTimeout(() => {
                                cleanupGame(lobbyId);
                            }, 3000);
                            return;
                        }
                        
                        if (result) {
                            console.log(`👑 Султан объявлен: ${result}`);
                            
                            // Отправляем событие всем игрокам
                            game.players.forEach(p => {
                                if (p.socket && p.socket.connected) {
                                    p.socket.emit('gameOver', {
                                        winner: result,
                                        isWinner: p.username === result,
                                        message: `👑 ${result} стал Султаном и забирает ${game.totalPot} кранов!`
                                    });
                                    setTimeout(() => {
                                        if (p.socket && p.socket.connected) {
                                            p.socket.emit('forceLeaveLobby', { message: 'Игра завершена' });
                                            p.socket.emit('lobbyLeft', { force: true });
                                            p.socket.currentLobby = null;
                                            p.socket.currentUsername = null;
                                            p.socket.leave(lobbyId);
                                            p.socket.leave(`game_${lobbyId}`);
                                        }
                                    }, 3000);
                                }
                            });
                            
                            setTimeout(() => {
                                cleanupGame(lobbyId);
                            }, 4000);
                        } else {
                            // ⭐ НОВЫЙ ОСНОВНОЙ РАУНД (С 3 ИГРОКАМИ)
                            console.log('🔄 Запуск нового основного раунда после доп.раунда');
                            setTimeout(() => {
                                const g = activeGames.get(lobbyId);
                                if (g && !g._isDraw) {
                                    // Сбрасываем все флаги
                                    g._subRoundCompleted = false;
                                    g._subRoundStarted = false;
                                    g._subRoundFinished = false;
                                    g._previousLoser = null;
                                    g._roundOverSent = false;
                                    g._gameFrozen = false;
                                    g.resetForNewRound();
                                    setTimeout(() => g.startDealingAnimation(), 1000);
                                } else {
                                    console.log('⚠️ Игра не найдена или помечена как ничья');
                                }
                            }, 3000);
                        }
                    }).catch(err => {
                        console.error('❌ Ошибка в checkSultan:', err);
                    });
                    return;
                }
                
                // Если оба игрока сбросили карты - ничья в доп.раунде
                if (activeWithoutCards.length === 2 && activeWithCards.length === 0) {
                    console.log('🤝 Ничья в дополнительном раунде!');
                    game._isDraw = true;
                    game._drawProcessed = true;
                    
                    game.refundCoinsOnDraw().then(() => {
                        game.players.forEach(p => {
                            if (p.socket && p.socket.connected) {
                                p.socket.emit('chatMessage', {
                                    username: '🔄 СИСТЕМА',
                                    message: 'Ничья в дополнительном раунде!'
                                });
                                p.socket.emit('gameOver', { 
                                    winner: 'Ничья в дополнительном раунде', 
                                    isDraw: true
                                });
                                setTimeout(() => {
                                    if (p.socket && p.socket.connected) {
                                        p.socket.emit('forceLeaveLobby', { message: 'Игра завершена' });
                                        p.socket.emit('lobbyLeft', { force: true });
                                        p.socket.currentLobby = null;
                                        p.socket.currentUsername = null;
                                        p.socket.leave(lobbyId);
                                        p.socket.leave(`game_${lobbyId}`);
                                    }
                                }, 2000);
                            }
                        });
                        
                        setTimeout(() => {
                            cleanupGame(lobbyId);
                        }, 3000);
                    });
                    return;
                }
                
                // Если доп.раунд еще не завершен (оба игрока с картами)
                if (activeWithCards.length === 2 && activeWithoutCards.length === 0) {
                    console.log('⏳ Дополнительный раунд еще продолжается...');
                    game._gameFrozen = false;
                    game.broadcast();
                    return;
                }
                
                console.log('⚠️ Неизвестная ситуация в доп.раунде: activeWithoutCards=', activeWithoutCards.length, 'activeWithCards=', activeWithCards.length);
                return;
            }
            
            // ============ ОСНОВНОЙ РАУНД (3 игрока) ============
            
            // Проверка на дополнительный раунд (уже запущен)
            if (game._subRoundStarted && !game._subRoundCompleted) {
                // Доп. раунд уже запущен, ждем его завершения
                console.log('⏳ Дополнительный раунд уже запущен, ожидаем завершения...');
                return;
            }
            
            const winners = game.players.filter(p => p.hand.length === 0);
            const losers = game.players.filter(p => p.hand.length > 0);
            
            // Проверка на ничью в основном раунде
            if (game._isDraw === true) {
                if (!game._drawProcessed) {
                    game._drawProcessed = true;
                    console.log('🤝 ИГРА ЗАВЕРШЕНА НИЧЬЕЙ');
                    
                    game.refundCoinsOnDraw().then(() => {
                        game.players.forEach(p => {
                            if (p.socket && p.socket.connected) {
                                p.socket.emit('gameOver', { 
                                    winner: 'Ничья - серия прервана', 
                                    isDraw: true
                                });
                                setTimeout(() => {
                                    if (p.socket && p.socket.connected) {
                                        p.socket.emit('forceLeaveLobby', { message: 'Игра завершена ничьей' });
                                        p.socket.emit('lobbyLeft', { force: true });
                                        p.socket.currentLobby = null;
                                        p.socket.currentUsername = null;
                                        p.socket.leave(lobbyId);
                                        p.socket.leave(`game_${lobbyId}`);
                                    }
                                }, 2000);
                            }
                        });
                        
                        setTimeout(() => {
                            cleanupGame(lobbyId);
                        }, 3000);
                    });
                }
                return;
            }
            
            if (game.players.length === 3 && losers.length === 1 && winners.length >= 1) {
                const loser = losers[0];
                
                // Проверяем, есть ли у проигравшего серия
                const consecutiveInfo = game._tournamentData?.playersConsecutive?.get(loser.username) || 0;
                
                if (consecutiveInfo >= 1 && !game._drawProcessed) {
                    game._drawProcessed = true;
                    game._isDraw = true;
                    console.log(`⚠️ ${loser.username} имел серию побед (${consecutiveInfo}), но проиграл в основном раунде! НИЧЬЯ!`);
                    
                    game.refundCoinsOnDraw().then(() => {
                        game.players.forEach(p => {
                            if (p.socket && p.socket.connected) {
                                p.socket.emit('chatMessage', {
                                    username: '⚠️ СИСТЕМА',
                                    message: `${loser.username} имел серию из ${consecutiveInfo} побед, но проиграл в основном раунде! Ничья!`
                                });
                                p.socket.emit('gameOver', { 
                                    winner: 'Ничья - серия султана прервана', 
                                    isDraw: true
                                });
                                setTimeout(() => {
                                    if (p.socket && p.socket.connected) {
                                        p.socket.emit('forceLeaveLobby', { message: 'Игра завершена' });
                                        p.socket.emit('lobbyLeft', { force: true });
                                        p.socket.currentLobby = null;
                                        p.socket.currentUsername = null;
                                        p.socket.leave(lobbyId);
                                        p.socket.leave(`game_${lobbyId}`);
                                    }
                                }, 2000);
                            }
                        });
                        
                        setTimeout(() => {
                            cleanupGame(lobbyId);
                        }, 3000);
                    });
                    return;
                }
                
                // Если серии нет → ЗАПУСКАЕМ ДОПОЛНИТЕЛЬНЫЙ РАУНД (ТОЛЬКО ОДИН РАЗ!)
                if (!game._subRoundStarted) {
                    game._subRoundStarted = true;
                    console.log('🎯 ЗАПУСК ДОПОЛНИТЕЛЬНОГО РАУНДА');
                    
                    game.players.forEach(p => {
                        if (p.socket && p.socket.connected) {
                            p.socket.emit('chatMessage', {
                                username: '🔄 СИСТЕМА',
                                message: `Запуск дополнительного раунда между ${winners.map(w => w.username).join(' и ')}`
                            });
                        }
                    });
                    
                    setTimeout(() => {
                        const currentGame = activeGames.get(lobbyId);
                        if (currentGame && currentGame._gameFrozen) {
                            currentGame._subRoundStarted = false;
                            currentGame.startSubRound(loser, scores, lobbyId);
                        } else {
                            console.log('⚠️ Игра не заморожена или не найдена для запуска доп.раунда');
                        }
                    }, 2000);
                }
                return;
            }
            
            // Если ничего не подошло - просто транслируем состояние
            game.broadcast();
        }
    });
};

global.lobbies = lobbies;
global.activeGames = activeGames;
global.tournamentScores = tournamentScores;
global.readyStatus = readyStatus;
