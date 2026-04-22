const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 12
    },
    password: {
        type: String,
        required: true
    },
    wins: {
        type: Number,
        default: 0
    },
    losses: {
        type: Number,
        default: 0
    },
    gamesPlayed: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date,
        default: Date.now
    },
    isActive: {
        type: Boolean,
        default: true
    }
});

// Хеширование пароля перед сохранением
userSchema.pre('save', async function() {
    // Если пароль не изменялся — прерываем выполнение (просто выходим из функции)
    if (!this.isModified('password')) {
        return;
    }
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        // В async middleware не нужно вызывать next(), Mongoose дождется завершения функции
    } catch (error) {
        // Если произошла ошибка, пробрасываем её дальше
        throw error;
    }
});

// Метод для проверки пароля
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Статистика пользователя
userSchema.methods.addWin = async function() {
    this.wins++;
    this.gamesPlayed++;
    await this.save();
};

userSchema.methods.addLoss = async function() {
    this.losses++;
    this.gamesPlayed++;
    await this.save();
};

module.exports = mongoose.model('User', userSchema);