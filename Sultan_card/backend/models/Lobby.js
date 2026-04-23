const mongoose = require('mongoose');

const lobbySchema = new mongoose.Schema({
    lobbyId: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true,
        default: function() {
            return `Лобби ${this.lobbyId.slice(0, 6)}`;
        }
    },
    creator: {
        type: String,
        required: true
    },
    players: [{
        username: String,
        socketId: String,
        joinedAt: Date
    }],
    isPrivate: {
        type: Boolean,
        default: false
    },
    password: {
        type: String,
        default: null
    },
    maxPlayers: {
        type: Number,
        default: 3
    },
    status: {
        type: String,
        enum: ['waiting', 'playing', 'finished'],
        default: 'waiting'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    gameId: {
        type: String,
        default: null
    }
});

module.exports = mongoose.model('Lobby', lobbySchema);