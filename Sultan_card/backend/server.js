const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" },
    allowEIO3: true
});

app.use(cors());
app.use(express.json()); // Добавлено для парсинга JSON
app.use(express.static(path.join(__dirname, '../frontend')));
app.use(express.static(path.join(__dirname, '../public')));

// API маршруты для авторизации
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }
    
    // Здесь можно добавить сохранение в БД
    res.json({ success: true, message: 'Регистрация успешна' });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }
    
    // Здесь можно добавить проверку из БД
    res.json({ success: true, username });
});

// Подключаем обработчик игры
require('./socket/gameHandler')(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log('Откройте 3 вкладки браузера для игры');
    console.log('Козырь: БУБНЫ ♢');
    console.log('Правило: Пики бьются только пиками');
});