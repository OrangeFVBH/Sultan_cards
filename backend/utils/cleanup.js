// backend/utils/cleanup.js
const User = require('../models/User');

// Функция для очистки "мертвых" лобби
async function cleanupDeadLobbies(lobbies, activeGames, tournamentScores, readyStatus, io) {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [id, lobby] of lobbies) {
        // Проверяем, есть ли в лобби активные игроки
        let hasActivePlayers = false;
        for (const player of lobby.players) {
            const playerSocket = io.sockets.sockets.get(player.socketId);
            if (playerSocket && playerSocket.connected) {
                hasActivePlayers = true;
                break;
            }
        }
        
        // Если нет активных игроков и лобби существует > 5 минут
        if (!hasActivePlayers && (now - lobby.createdAt) > 300000) {
            // Возвращаем монеты игрокам, если игра уже началась
            if (lobby.status === 'playing') {
                const game = activeGames.get(id);
                if (game) {
                    // ⭐ Возвращаем каждому игроку его ставку (500 кранов)
                    const refundPerPlayer = 500;
                    for (const player of game.players) {
                        try {
                            const user = await User.findOne({ username: player.username });
                            if (user) {
                                user.coins += refundPerPlayer;
                                await user.save();
                                console.log(`💰 ${player.username} возвращено ${refundPerPlayer} кранов при очистке лобби`);
                            }
                        } catch (error) {
                            console.error('Ошибка возврата монет при очистке:', error);
                        }
                    }
                    console.log(`💰 Возвращены монеты из лобби ${id} при очистке`);
                }
            }
            
            // Удаляем лобби
            lobbies.delete(id);
            activeGames.delete(id);
            tournamentScores.delete(id);
            readyStatus.delete(id);
            cleaned++;
            console.log(`🗑️ Очищено мертвое лобби ${id}`);
        }
    }
    
    if (cleaned > 0) {
        // Обновляем список лобби для всех клиентов
        const waitingLobbies = Array.from(lobbies.values())
            .filter(l => l.status === 'waiting' && l.players.length < l.maxPlayers)
            .slice(0, 5);
        
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
    
    return cleaned;
}

module.exports = { cleanupDeadLobbies };