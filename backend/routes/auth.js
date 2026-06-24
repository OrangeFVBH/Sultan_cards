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
        let useMongoDB = mongoose.connection.readyState === 1;
        
        if (useMongoDB) {
            const existingUser = await User.findOne({ username });
            if (existingUser) {
                return res.status(400).json({ error: 'Пользователь с таким ником уже существует' });
            }
            
            const user = new User({ username, password, coins: 0 });
            await user.save();
            
            console.log(`✅ Новый пользователь зарегистрирован в MongoDB: ${username}`);
            res.json({ success: true, message: 'Регистрация успешна' });
        } else {
            if (tempUsers.has(username)) {
                return res.status(400).json({ error: 'Пользователь с таким ником уже существует' });
            }
            
            const hashedPassword = await bcrypt.hash(password, 10);
            tempUsers.set(username, { 
                password: hashedPassword,
                wins: 0,
                losses: 0,
                gamesPlayed: 0,
                coins: 0
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
        
        let isValid;
        if (useMongoDB) {
            isValid = await user.comparePassword(password);
        } else {
            isValid = await bcrypt.compare(password, user.password);
        }
        
        if (!isValid) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        
        req.session.userId = username;
        req.session.username = username;
        
        console.log(`🔓 Вход в систему: ${username}`);
        res.json({ 
            success: true, 
            username,
            stats: { 
                wins: user.wins || 0, 
                losses: user.losses || 0,
                gamesPlayed: user.gamesPlayed || 0,
                coins: user.coins || 0
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
            let stats = { wins: 0, losses: 0, gamesPlayed: 0, coins: 0 };
            
            if (useMongoDB) {
                user = await User.findOne({ username: req.session.userId });
                if (user) {
                    stats = { 
                        wins: user.wins, 
                        losses: user.losses, 
                        gamesPlayed: user.gamesPlayed,
                        coins: user.coins
                    };
                }
            } else {
                user = tempUsers.get(req.session.userId);
                if (user) {
                    stats = { 
                        wins: user.wins, 
                        losses: user.losses, 
                        gamesPlayed: user.gamesPlayed,
                        coins: user.coins
                    };
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

// Проверка наличия кранов (без списания)
router.post('/check-coins', async (req, res) => {
    const { username, amount = 500 } = req.body;
    
    try {
        let useMongoDB = mongoose.connection.readyState === 1;
        
        if (useMongoDB) {
            const user = await User.findOne({ username });
            if (!user) {
                return res.json({ hasCoins: false, error: 'Пользователь не найден' });
            }
            
            res.json({ hasCoins: user.coins >= amount, coins: user.coins });
        } else {
            const user = tempUsers.get(username);
            if (!user) {
                return res.json({ hasCoins: false, error: 'Пользователь не найден' });
            }
            
            res.json({ hasCoins: (user.coins || 0) >= amount, coins: user.coins });
        }
    } catch (error) {
        console.error('Ошибка проверки кранов:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Списание кранов за игру
router.post('/spend-coins', async (req, res) => {
    const { username, amount = 500 } = req.body;
    
    try {
        let useMongoDB = mongoose.connection.readyState === 1;
        
        if (useMongoDB) {
            const user = await User.findOne({ username });
            if (!user) {
                return res.json({ success: false, error: 'Пользователь не найден' });
            }
            
            if (user.coins < amount) {
                return res.json({ success: false, error: `Недостаточно кранов. Нужно ${amount} кранов` });
            }
            
            user.coins -= amount;
            await user.save();
            
            console.log(`💰 ${username} потратил ${amount} кранов на игру. Баланс: ${user.coins}`);
            res.json({ success: true, coins: user.coins });
        } else {
            const user = tempUsers.get(username);
            if (!user) {
                return res.json({ success: false, error: 'Пользователь не найден' });
            }
            
            if ((user.coins || 0) < amount) {
                return res.json({ success: false, error: `Недостаточно кранов. Нужно ${amount} кранов` });
            }
            
            user.coins = (user.coins || 0) - amount;
            tempUsers.set(username, user);
            
            console.log(`💰 ${username} потратил ${amount} кранов на игру. Баланс: ${user.coins}`);
            res.json({ success: true, coins: user.coins });
        }
    } catch (error) {
        console.error('Ошибка списания кранов:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Обновить статистику (после игры)
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
                res.json({ success: true, stats: { wins: user.wins, losses: user.losses, gamesPlayed: user.gamesPlayed, coins: user.coins } });
            } else {
                res.json({ success: false });
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
                res.json({ success: true, stats: { wins: user.wins, losses: user.losses, gamesPlayed: user.gamesPlayed, coins: user.coins } });
            } else {
                res.json({ success: false });
            }
        }
    } catch (error) {
        console.error('Ошибка обновления статистики:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Добавить краны (валюта) - ИСПРАВЛЕННЫЙ
router.post('/add-coins', async (req, res) => {
    const { username, amount } = req.body;
    
    console.log(`📥 Запрос на пополнение: ${username}, сумма: ${amount}`);
    
    if (!username || !amount || amount <= 0) {
        console.log(`❌ Ошибка: неверные параметры - username=${username}, amount=${amount}`);
        return res.status(400).json({ error: 'Неверные параметры' });
    }
    
    try {
        let useMongoDB = mongoose.connection.readyState === 1;
        console.log(`📊 Используем MongoDB: ${useMongoDB}`);
        
        if (useMongoDB) {
            const user = await User.findOne({ username });
            if (!user) {
                console.log(`❌ Пользователь не найден в MongoDB: ${username}`);
                return res.status(404).json({ error: 'Пользователь не найден' });
            }
            
            const oldCoins = user.coins;
            user.coins += amount;
            await user.save();
            
            console.log(`💰 ${username} получил +${amount} кранов. Баланс: ${oldCoins} → ${user.coins}`);
            return res.json({ success: true, coins: user.coins });
        } else {
            const user = tempUsers.get(username);
            if (!user) {
                console.log(`❌ Пользователь не найден во временном хранилище: ${username}`);
                return res.status(404).json({ error: 'Пользователь не найден' });
            }
            
            const oldCoins = user.coins || 0;
            user.coins = oldCoins + amount;
            tempUsers.set(username, user);
            
            console.log(`💰 ${username} получил +${amount} кранов. Баланс: ${oldCoins} → ${user.coins}`);
            return res.json({ success: true, coins: user.coins });
        }
    } catch (error) {
        console.error('❌ Ошибка добавления кранов:', error);
        return res.status(500).json({ error: 'Ошибка сервера: ' + error.message });
    }
});

// Сменить имя пользователя
router.post('/change-username', async (req, res) => {
    const { oldUsername, newUsername } = req.body;
    
    if (!newUsername || newUsername.length < 3 || newUsername.length > 12) {
        return res.status(400).json({ error: 'Ник должен быть от 3 до 12 символов' });
    }
    
    try {
        let useMongoDB = mongoose.connection.readyState === 1;
        
        if (useMongoDB) {
            const existingUser = await User.findOne({ username: newUsername });
            if (existingUser) {
                return res.status(400).json({ error: 'Это имя уже занято' });
            }
            
            const user = await User.findOne({ username: oldUsername });
            if (!user) {
                return res.status(404).json({ error: 'Пользователь не найден' });
            }
            
            user.username = newUsername;
            await user.save();
            
            req.session.username = newUsername;
            req.session.userId = newUsername;
            
            console.log(`✏️ ${oldUsername} сменил имя на ${newUsername}`);
            res.json({ success: true, username: newUsername, stats: { wins: user.wins, losses: user.losses, gamesPlayed: user.gamesPlayed, coins: user.coins } });
        } else {
            const user = tempUsers.get(oldUsername);
            if (!user) {
                return res.status(404).json({ error: 'Пользователь не найден' });
            }
            
            if (tempUsers.has(newUsername)) {
                return res.status(400).json({ error: 'Это имя уже занято' });
            }
            
            tempUsers.set(newUsername, { ...user });
            tempUsers.delete(oldUsername);
            
            req.session.username = newUsername;
            req.session.userId = newUsername;
            
            console.log(`✏️ ${oldUsername} сменил имя на ${newUsername}`);
            res.json({ success: true, username: newUsername, stats: { wins: user.wins, losses: user.losses, gamesPlayed: user.gamesPlayed, coins: user.coins } });
        }
    } catch (error) {
        console.error('Ошибка смены имени:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;
