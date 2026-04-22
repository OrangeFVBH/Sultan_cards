const User = require('../models/User');

async function getLeaderboard(limit = 10) {
    try {
        const leaders = await User.find({ isActive: true })
            .sort({ wins: -1, gamesPlayed: -1 })
            .limit(limit)
            .select('username wins losses gamesPlayed');
        
        return leaders;
    } catch (error) {
        console.error('Ошибка получения лидерборда:', error);
        return [];
    }
}

async function updatePlayerStats(username, isWinner) {
    try {
        const user = await User.findOne({ username });
        if (user) {
            if (isWinner) {
                user.wins++;
            } else {
                user.losses++;
            }
            user.gamesPlayed++;
            await user.save();
            return true;
        }
        return false;
    } catch (error) {
        console.error('Ошибка обновления статистики:', error);
        return false;
    }
}

module.exports = { getLeaderboard, updatePlayerStats };