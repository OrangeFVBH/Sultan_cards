let socket = null;
let gameStarted = false;

function joinGame() {
    const username = document.getElementById('username').value.trim();
    if (!username) {
        alert("Введите ник!");
        return;
    }
    
    if (username.length > 12) {
        alert("Ник не должен превышать 12 символов");
        return;
    }
    
    // Сохраняем имя игрока ДО перехода
    sessionStorage.setItem('playerName', username);
    
    const statusDiv = document.getElementById('status');
    if (statusDiv) statusDiv.textContent = "Подключение к серверу...";
    
    if (!socket) {
        socket = io({
            reconnection: true,
            reconnectionAttempts: 5
        });
        
        socket.on('connect', () => {
            console.log('✅ Socket подключён');
            if (statusDiv) statusDiv.textContent = "Ожидаем других игроков...";
            socket.emit('joinGame', username);
        });
        
        socket.on('lobbyUpdate', (players) => {
            if (statusDiv) statusDiv.textContent = `В лобби: ${players.length}/3 игроков`;
            console.log('В лобби:', players.map(p => p.username));
        });
        
        socket.on('gameStarted', () => {
            if (gameStarted) return;
            gameStarted = true;
            
            console.log('🎮 Игра началась! Переходим на игровое поле...');
            if (statusDiv) statusDiv.textContent = "Игра начинается...";
            
            setTimeout(() => {
                window.location.href = "/game.html";
            }, 500);
        });
        
        socket.on('gameOver', (data) => {
            alert(`Игра окончена!\nПобедитель: ${data.winner || data}`);
            setTimeout(() => {
                window.location.href = '/';
            }, 3000);
        });
        
        socket.on('error', (error) => {
            console.error('Socket error:', error);
            alert(error);
            if (statusDiv) statusDiv.textContent = "Ошибка: " + error;
        });
        
        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            if (statusDiv) statusDiv.textContent = "Ошибка подключения к серверу";
        });
    } else {
        socket.emit('joinGame', username);
    }
}

window.joinGame = joinGame;