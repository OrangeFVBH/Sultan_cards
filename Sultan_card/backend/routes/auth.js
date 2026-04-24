const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const router = express.Router();

// Временное хранилище на случай если MongoDB не доступна
const tempUsers = new Map();

// Регистрация
router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    
    // Валидация
    if (!username || !password) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }
    
    if (username.length < 3 || username.length > 12) {
        return res.status(400).json({ error: 'Ник должен быть от 3 до 12 символов' });
    }
    
    if (password.length < 3) {
        return res.status(400).json({ error: 'Пароль должен быть не менее 3 символов' });
    }
    
    try {
        // Проверяем подключение к MongoDB
        let useMongoDB = mongoose.connection.readyState === 1;
        
        if (useMongoDB) {
            // Проверяем, существует ли пользователь
            const existingUser = await User.findOne({ username });
            if (existingUser) {
                return res.status(400).json({ error: 'Пользователь с таким ником уже существует' });
            }
            
            // Создаем нового пользователя
            const user = new User({ username, password });
            await user.save();
            
            console.log(`✅ Новый пользователь зарегистрирован в MongoDB: ${username}`);
            res.json({ success: true, message: 'Регистрация успешна' });
        } else {
            // Используем временное хранилище
            if (tempUsers.has(username)) {
                return res.status(400).json({ error: 'Пользователь с таким ником уже существует' });
            }
            
            const hashedPassword = await bcrypt.hash(password, 10);
            tempUsers.set(username, { 
                password: hashedPassword, 
                wins: 0, 
                losses: 0,
                gamesPlayed: 0
            });
            
            console.log(`✅ Новый пользователь зарегистрирован во временном хранилище: ${username}`);
            res.json({ success: true, message: 'Регистрация успешна' });
        }
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.status(500).json({ error: 'Ошибка сервера при регистрации' });
    }
});

// Логин
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }
    
    try {
        let useMongoDB = mongoose.connection.readyState === 1;
        let user = null;
        
        if (useMongoDB) {
            user = await User.findOne({ username });
        } else {
            user = tempUsers.get(username);
        }
        
        if (!user) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        
        // Проверяем пароль
        let isValid;
        if (useMongoDB) {
            isValid = await user.comparePassword(password);
        } else {
            isValid = await bcrypt.compare(password, user.password);
        }
        
        if (!isValid) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        
        // Сохраняем сессию
        req.session.userId = username;
        req.session.username = username;
        
        console.log(`🔓 Вход в систему: ${username}`);
        res.json({ 
            success: true, 
            username,
            stats: { 
                wins: user.wins || 0, 
                losses: user.losses || 0,
                gamesPlayed: user.gamesPlayed || 0
            }
        });
    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({ error: 'Ошибка сервера при входе' });
    }
});

// Проверка авторизации
router.get('/check', async (req, res) => {
    if (req.session.userId) {
        try {
            let useMongoDB = mongoose.connection.readyState === 1;
            let user = null;
            let stats = { wins: 0, losses: 0, gamesPlayed: 0 };
            
            if (useMongoDB) {
                user = await User.findOne({ username: req.session.userId });
                if (user) {
                    stats = { wins: user.wins, losses: user.losses, gamesPlayed: user.gamesPlayed };
                }
            } else {
                user = tempUsers.get(req.session.userId);
                if (user) {
                    stats = { wins: user.wins, losses: user.losses, gamesPlayed: user.gamesPlayed };
                }
            }
            
            if (user) {
                res.json({ 
                    authenticated: true, 
                    username: req.session.username,
                    stats
                });
            } else {
                req.session.destroy();
                res.json({ authenticated: false });
            }
        } catch (error) {
            console.error('Ошибка проверки сессии:', error);
            res.json({ authenticated: false });
        }
    } else {
        res.json({ authenticated: false });
    }
});

// Выход
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Получить статистику
router.get('/stats/:username', async (req, res) => {
    try {
        let useMongoDB = mongoose.connection.readyState === 1;
        
        if (useMongoDB) {
            const user = await User.findOne({ username: req.params.username });
            if (!user) {
                return res.status(404).json({ error: 'Пользователь не найден' });
            }
            res.json({ wins: user.wins, losses: user.losses, gamesPlayed: user.gamesPlayed });
        } else {
            const user = tempUsers.get(req.params.username);
            if (!user) {
                return res.status(404).json({ error: 'Пользователь не найден' });
            }
            res.json({ wins: user.wins, losses: user.losses, gamesPlayed: user.gamesPlayed });
        }
    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Обновить статистику
router.post('/update-stats', async (req, res) => {
    const { username, won } = req.body;
    
    try {
        let useMongoDB = mongoose.connection.readyState === 1;
        
        if (useMongoDB) {
            const user = await User.findOne({ username });
            if (user) {
                if (won) {
                    await user.addWin();
                } else {
                    await user.addLoss();
                }
                console.log(`📊 Статистика обновлена в MongoDB: ${username}`);
            }
        } else {
            const user = tempUsers.get(username);
            if (user) {
                if (won) {
                    user.wins++;
                } else {
                    user.losses++;
                }
                user.gamesPlayed++;
                tempUsers.set(username, user);
                console.log(`📊 Статистика обновлена во временном хранилище: ${username}`);
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка обновления статистики:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить топ-10 игроков по победам
router.get('/leaderboard', async (req, res) => {
    try {
        let useMongoDB = mongoose.connection.readyState === 1;
        
        if (useMongoDB) {
            const leaders = await User.find({})
                .sort({ wins: -1, gamesPlayed: -1 })
                .limit(10)
                .select('username wins losses gamesPlayed');
            
            res.json(leaders);
        } else {
            // Из временного хранилища
            const tempLeaders = Array.from(tempUsers.entries())
                .map(([username, data]) => ({
                    username,
                    wins: data.wins || 0,
                    losses: data.losses || 0,
                    gamesPlayed: data.gamesPlayed || 0
                }))
                .sort((a, b) => b.wins - a.wins || b.gamesPlayed - a.gamesPlayed)
                .slice(0, 10);
            
            res.json(tempLeaders);
        }
    } catch (error) {
        console.error('Ошибка получения лидерборда:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;