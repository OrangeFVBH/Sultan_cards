const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const mongoose = require('mongoose');
const connectDB = require('./config/database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" },
    allowEIO3: true
});

// Подключаем MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));
app.use(express.static(path.join(__dirname, '../public')));

// Сессии для авторизации
app.use(session({
    secret: 'durak-game-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Подключаем маршруты авторизации
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

app.get('/lobby', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/lobby.html'));
});

// Подключаем обработчик игры
require('./socket/gameHandler')(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    // Проверяем статус подключения к MongoDB
    if (mongoose.connection.readyState === 1) {
        console.log('📊 MongoDB статус: Подключена');
    } else {
        console.log('📊 MongoDB статус: Не подключена (используется временное хранилище)');
    }
    console.log('Откройте 3 вкладки браузера для игры');
});

server.on('connection', (socket) => {
    socket.setTimeout(60000); // 60 секунд таймаут
    socket.on('timeout', () => {
        console.log('Socket timeout');
        socket.destroy();
    });
});