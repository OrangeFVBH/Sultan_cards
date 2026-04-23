let isMyAttackTurn = false;
let isMyDefendTurn = false;
let myHand = [];
let tableCards = [];
let socket = null;
let playerName = null;
let gameReady = false;
let stateRequestCount = 0;

function initGameUI() {
    console.log('initGameUI started');
    
    playerName = sessionStorage.getItem('playerName');
    console.log('Player name from session:', playerName);
    
    // Получаем lobbyId из URL или сессии
    const urlParams = new URLSearchParams(window.location.search);
    const lobbyId = urlParams.get('lobbyId') || sessionStorage.getItem('currentLobbyId');
    console.log('LobbyId:', lobbyId);
    
    if (!playerName) {
        console.error('Нет имени игрока!');
        alert('Ошибка: не удалось определить игрока. Перенаправление в лобби...');
        window.location.href = '/lobby.html';
        return;
    }
    
    if (typeof io === 'undefined') {
        console.error('socket.io не загружен!');
        setTimeout(initGameUI, 500);
        return;
    }
    
    if (!socket) {
        socket = io({
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000
        });
        
        socket.on('connect', () => {
            console.log('✅ Socket connected in gameUI, id:', socket.id);
            
            // Получаем lobbyId из URL или сессии
            const urlParams = new URLSearchParams(window.location.search);
            const lobbyIdFromUrl = urlParams.get('lobbyId') || sessionStorage.getItem('currentLobbyId');
            
            console.log('Устанавливаем lobbyId в сокет:', lobbyIdFromUrl);
            
            if (lobbyIdFromUrl) {
                socket.currentLobby = lobbyIdFromUrl;
                socket.currentUsername = playerName;
                sessionStorage.setItem('currentLobbyId', lobbyIdFromUrl);
            } else {
                console.error('❌ Нет lobbyId!');
                alert('Ошибка: не удалось определить лобби. Перенаправление...');
                window.location.href = '/lobby.html';
                return;
            }
            
            gameReady = true;
            stateRequestCount = 0;
            
            // Запрашиваем состояние игры несколько раз
            const requestState = () => {
                if (socket && socket.connected) {
                    console.log(`🔄 Запрос состояния игры (попытка ${stateRequestCount + 1}) для`, playerName);
                    console.log(`Текущий socket.currentLobby:`, socket.currentLobby);
                    socket.emit('requestGameState', { username: playerName, lobbyId: socket.currentLobby });
                    stateRequestCount++;
                    
                    if (stateRequestCount < 5) {
                        setTimeout(requestState, 1000);
                    }
                }
            };
            
            requestState();
        });
        
        socket.on('gameState', (state) => {
            console.log('📦 Game state received!', state);
            
            if (!state || !state.myHand) {
                console.warn('⚠️ Получен пустой state или нет myHand');
                return;
            }
            
            if (state.myHand.length === 0 && !state.gameWinner) {
                console.warn('⚠️ Получен state с пустой рукой, возможно игра еще не началась');
                return;
            }
            
            console.log('✅ Обновление игрового состояния');
            console.log(`Карт в руке: ${state.myHand.length}`);
            if (state.myHand.length > 0) {
                console.log('Первая карта в руке:', state.myHand[0]);
            }
            console.log(`Атакует: ${state.currentAttacker}, Защищается: ${state.currentDefender}`);
            console.log(`Моя очередь атаковать: ${state.isMyTurnAttack}`);
            console.log(`Моя очередь защищаться: ${state.isMyTurnDefend}`);
            
            updateGameState(state);
        });
        
        socket.on('gameOver', (data) => {
            console.log('🏁 Game over:', data);
            alert(`Игра окончена!\nПобедитель: ${data.winner}`);
            setTimeout(() => {
                window.location.href = '/lobby.html';
            }, 3000);
        });
        
        socket.on('error', (error) => {
            console.error('❌ Socket error:', error);
            alert(error);
        });
        
        socket.on('disconnect', () => {
            console.log('🔌 Socket disconnected in gameUI');
            gameReady = false;
            const statusBar = document.getElementById('statusBar');
            if (statusBar) {
                statusBar.innerHTML = '⚠️ Потеря соединения с сервером. Переподключение...';
            }
        });
    }
}

function updateGameState(state) {
    isMyAttackTurn = state.isMyTurnAttack;
    isMyDefendTurn = state.isMyTurnDefend;
    myHand = state.myHand || [];
    tableCards = state.table || [];
    
    renderStatus(state);
    renderTable(state.table);
    renderMyHand(state.myHand);
    renderPlayersInfo(state.players, state.currentAttacker, state.currentDefender);
    renderActionButtons(state);
}

function renderStatus(state) {
    const statusBar = document.getElementById('statusBar');
    if (!statusBar) return;
    
    if (state.gameWinner) {
        statusBar.innerHTML = `🏆 ПОБЕДИТЕЛЬ: ${state.gameWinner} 🏆`;
        statusBar.style.background = '#ffd700';
        statusBar.style.color = '#000';
        return;
    }
    
    let statusHtml = '';
    if (isMyAttackTurn) {
        statusHtml = '🔥 ВЫ АТАКУЕТЕ 🔥<br><span style="font-size:12px">Нажмите на карту, чтобы сходить</span>';
        statusBar.style.background = '#ff9800';
    } else if (isMyDefendTurn) {
        statusHtml = '🛡️ ВЫ ОТБИВАЕТЕСЬ 🛡️<br><span style="font-size:12px">Нажмите на карту, чтобы побить</span>';
        statusBar.style.background = '#4caf50';
    } else {
        statusHtml = `🎴 Ходит: ${state.currentAttacker || '—'} → отбивается: ${state.currentDefender || '—'}<br><span style="font-size:12px">Козырь: ♢ БУБНЫ</span>`;
        statusBar.style.background = '#1d1d1d';
    }
    
    statusBar.innerHTML = statusHtml;
    statusBar.style.color = '#fff';
}

function renderPlayersInfo(players, attacker, defender) {
    const playerTop = document.getElementById('playerTop');
    const playerLeft = document.getElementById('playerLeft');
    
    if (!playerTop || !playerLeft) return;
    
    const otherPlayers = players.filter(p => p.id !== socket.id);
    
    // Для 3 игроков: один сверху, один слева
    if (otherPlayers[0]) {
        let roleHtml = '';
        if (otherPlayers[0].username === attacker) roleHtml = '<div class="role-badge attacker">⚔️ АТАКУЕТ</div>';
        if (otherPlayers[0].username === defender) roleHtml = '<div class="role-badge defender">🛡️ ОТБИВАЕТСЯ</div>';
        
        playerTop.innerHTML = `
            <div class="player-name">${otherPlayers[0].username}</div>
            <div class="player-cards">📋 ${otherPlayers[0].cardCount} карт</div>
            ${roleHtml}
        `;
    }
    
    if (otherPlayers[1]) {
        let roleHtml = '';
        if (otherPlayers[1].username === attacker) roleHtml = '<div class="role-badge attacker">⚔️ АТАКУЕТ</div>';
        if (otherPlayers[1].username === defender) roleHtml = '<div class="role-badge defender">🛡️ ОТБИВАЕТСЯ</div>';
        
        playerLeft.innerHTML = `
            <div class="player-name">${otherPlayers[1].username}</div>
            <div class="player-cards">📋 ${otherPlayers[1].cardCount} карт</div>
            ${roleHtml}
        `;
    }
}

function createCardImage(card, className, onClickHandler = null, cardIndex = null) {
    const div = document.createElement('div');
    div.className = `card ${className}`;
    
    const img = document.createElement('img');
    const imgPath = getCardImagePath(card);
    img.src = imgPath;
    img.alt = `${card.rank} ${card.suit}`;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.borderRadius = '8px';
    
    img.onerror = () => {
        console.warn(`Не удалось загрузить: ${imgPath}`);
        const suits = { 'hearts': '♥', 'diamonds': '♢', 'clubs': '♣', 'spades': '♠' };
        const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
        img.style.display = 'none';
        const textDiv = document.createElement('div');
        textDiv.style.cssText = `
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: white;
            border-radius: 8px;
            color: ${isRed ? 'red' : 'black'};
            font-size: 24px;
            font-weight: bold;
        `;
        textDiv.innerHTML = `<div style="font-size: 28px;">${card.rank}</div><div style="font-size: 32px;">${suits[card.suit]}</div>`;
        div.appendChild(textDiv);
    };
    
    div.appendChild(img);
    
    if (onClickHandler && cardIndex !== null) {
        div.style.cursor = 'pointer';
        div.onclick = (e) => {
            e.stopPropagation();
            onClickHandler(cardIndex);
        };
    }
    
    if (card.rank === 'Q') {
        const queenMark = document.createElement('div');
        queenMark.className = 'queen-mark';
        queenMark.textContent = '♕';
        queenMark.style.cssText = `
            position: absolute;
            top: -10px;
            right: -10px;
            background: gold;
            color: red;
            border-radius: 50%;
            width: 25px;
            height: 25px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 16px;
            border: 2px solid #ffd700;
        `;
        div.style.position = 'relative';
        div.appendChild(queenMark);
    }
    
    return div;
}

function getCardImagePath(card) {
    return `/cards/${card.rank}_of_${card.suit}.png`;
}

function renderTable(table) {
    const zone = document.getElementById('tableZone');
    if (!zone) return;
    
    zone.innerHTML = '';
    
    if (!table || table.length === 0) {
        zone.innerHTML = `<div class="empty-text">Стол пуст<br>Нажмите на карту, чтобы сходить</div>`;
        return;
    }
    
    const attackCards = table.filter(item => item.type === 'attack');
    const defendCards = table.filter(item => item.type === 'defend');
    
    const container = document.createElement('div');
    container.className = 'table-pairs';
    
    for (let i = 0; i < attackCards.length; i++) {
        const pairDiv = document.createElement('div');
        pairDiv.className = 'card-pair';
        
        const attackDiv = createCardImage(attackCards[i].card, 'attack-card');
        pairDiv.appendChild(attackDiv);
        
        if (defendCards[i]) {
            const defendDiv = createCardImage(defendCards[i].card, 'defend-card');
            pairDiv.appendChild(defendDiv);
        } else {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'card-placeholder';
            emptyDiv.textContent = '?';
            emptyDiv.style.cssText = `
                width: 70px;
                height: 100px;
                background: rgba(0,0,0,0.5);
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 24px;
                position: absolute;
                top: 15px;
                left: 15px;
            `;
            pairDiv.appendChild(emptyDiv);
        }
        
        container.appendChild(pairDiv);
    }
    
    zone.appendChild(container);
}

function renderMyHand(hand) {
    const handEl = document.getElementById('myHand');
    if (!handEl) return;
    
    handEl.innerHTML = '';
    
    if (!hand || hand.length === 0) {
        handEl.innerHTML = '<div class="win-message">🎉 ВЫ ПОБЕДИЛИ! 🎉</div>';
        return;
    }
    
    hand.forEach((card, index) => {
        const onClick = (cardIdx) => {
            if (isMyAttackTurn) {
                console.log(`⚔️ Атака картой ${card.rank} ${card.suit}, индекс ${cardIdx}`);
                socket.emit('attack', { cardIndex: cardIdx }, (result) => {
                    if (result && !result.success) {
                        alert(result.error || 'Нельзя сходить этой картой');
                        console.warn('Ошибка атаки:', result.error);
                    } else {
                        console.log('Атака успешна');
                    }
                });
            } else if (isMyDefendTurn) {
                console.log(`🛡️ Защита картой ${card.rank} ${card.suit}, индекс ${cardIdx}`);
                socket.emit('defend', { cardIndex: cardIdx }, (result) => {
                    if (result && !result.success) {
                        alert(result.error || 'Нельзя побить этой картой');
                        console.warn('Ошибка защиты:', result.error);
                    } else {
                        console.log('Защита успешна');
                    }
                });
            } else {
                alert('Сейчас не ваш ход');
            }
        };
        
        const cardDiv = createCardImage(card, 'my-card', onClick, index);
        handEl.appendChild(cardDiv);
    });
}

function renderActionButtons(state) {
    let buttonsDiv = document.getElementById('actionButtons');
    if (!buttonsDiv) {
        buttonsDiv = document.createElement('div');
        buttonsDiv.id = 'actionButtons';
        buttonsDiv.className = 'action-buttons';
        buttonsDiv.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 15px;
            z-index: 1000;
        `;
        document.body.appendChild(buttonsDiv);
    }
    
    buttonsDiv.innerHTML = '';
    
    if (state.isMyTurnAttack && state.table && state.table.length > 0) {
        const endBtn = document.createElement('button');
        endBtn.className = 'action-btn end-btn';
        endBtn.textContent = '✅ Завершить ход';
        endBtn.style.cssText = `
            padding: 10px 20px;
            background: #ff9800;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            font-weight: bold;
        `;
        endBtn.onclick = () => {
            socket.emit('endTurn', {}, (result) => {
                if (result && !result.success) {
                    alert(result.error);
                } else {
                    console.log('Ход завершен');
                }
            });
        };
        buttonsDiv.appendChild(endBtn);
    }
    
    if (state.isMyTurnDefend && state.table && state.table.length > 0) {
        const takeBtn = document.createElement('button');
        takeBtn.className = 'action-btn take-btn';
        takeBtn.textContent = '📥 Забрать карты';
        takeBtn.style.cssText = `
            padding: 10px 20px;
            background: #f44336;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            font-weight: bold;
        `;
        takeBtn.onclick = () => {
            socket.emit('takeCards', {}, (result) => {
                if (result && !result.success) {
                    alert(result.error);
                } else {
                    console.log('Карты забраны');
                }
            });
        };
        buttonsDiv.appendChild(takeBtn);
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM загружен, инициализация GameUI');
    initGameUI();
});