const express = require('express');
const router = express.Router();

// Временное хранилище (в реальном проекте используйте БД)
const users = new Map();

// Регистрация
router.post('/register', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }
    
    if (users.has(username)) {
        return res.status(400).json({ error: 'Пользователь уже существует' });
    }
    
    // Простое хеширование (в реальном проекте используйте bcrypt)
    const hash = Buffer.from(password).toString('base64');
    users.set(username, { password: hash, wins: 0, losses: 0 });
    
    res.json({ success: true, message: 'Регистрация успешна' });
});

// Логин
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    const user = users.get(username);
    const hash = Buffer.from(password).toString('base64');
    
    if (!user || user.password !== hash) {
        return res.status(401).json({ error: 'Неверные учетные данные' });
    }
    
    res.json({ success: true, username, stats: { wins: user.wins, losses: user.losses } });
});

// Получить статистику
router.get('/stats/:username', (req, res) => {
    const user = users.get(req.params.username);
    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json({ wins: user.wins, losses: user.losses });
});

module.exports = router;