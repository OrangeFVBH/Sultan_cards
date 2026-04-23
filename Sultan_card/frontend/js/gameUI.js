let isMyAttackTurn = false;
let isMyDefendTurn = false;
let isMyAdditionalAttackTurn = false;
let myHand = [];
let tableCards = [];
let socket = null;
let playerName = null;
let gameReady = false;
let stateRequestCount = 0;
let currentGameState = null;

function initGameUI() {
    console.log('initGameUI started');
    
    playerName = sessionStorage.getItem('playerName');
    console.log('Player name from session:', playerName);
    
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
            
            const requestState = () => {
                if (socket && socket.connected) {
                    console.log(`🔄 Запрос состояния игры (попытка ${stateRequestCount + 1}) для`, playerName);
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
            currentGameState = state;
            updateGameState(state);
        });
        
        socket.on('gameOver', (data) => {
            console.log('🏁 Game over:', data);
            const isWinner = data.isWinner || (data.winner && data.winner.includes(playerName));
            if (isWinner) {
                alert(`🏆 ПОБЕДА! 🏆\n${data.winner}`);
            } else if (data.winner === 'Ничья - все победители!') {
                alert(`🤝 НИЧЬЯ! 🤝\n${data.winner}`);
            } else {
                alert(`😢 Вы проиграли!\nПобедитель: ${data.winner}`);
            }
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
    if (!state) return;
    
    console.log('=== updateGameState ===');
    console.log('Received state:', {
        isMyTurnAttack: state.isMyTurnAttack,
        isMyTurnDefend: state.isMyTurnDefend,
        isMyAdditionalAttackTurn: state.isMyAdditionalAttackTurn,
        tableLength: state.table?.length,
        table: state.table?.map(t => ({ type: t.type, card: t.card?.rank + t.card?.suit }))
    });
    
    isMyAttackTurn = state.isMyTurnAttack;
    isMyDefendTurn = state.isMyTurnDefend;
    isMyAdditionalAttackTurn = state.isMyAdditionalAttackTurn || false;
    myHand = state.myHand || [];
    tableCards = state.table || [];
    
    window.gameWinner = state.gameWinner;
    
    renderStatus(state);
    renderTable(state.table);
    renderMyHand(state.myHand, state);
    renderPlayersInfo(state.players, state.currentAttacker, state.currentDefender);
    renderActionButtons(state);
}

function renderStatus(state) {
    const statusBar = document.getElementById('statusBar');
    if (!statusBar) return;
    
    if (state.gameWinner) {
        if (state.gameWinner.includes(playerName)) {
            statusBar.innerHTML = `🏆 ВЫ ПОБЕДИТЕЛЬ! 🏆`;
        } else {
            statusBar.innerHTML = `🏆 ПОБЕДИТЕЛЬ: ${state.gameWinner} 🏆`;
        }
        statusBar.style.background = '#ffd700';
        statusBar.style.color = '#000';
        return;
    }
    
    let statusHtml = '';
    if (isMyAdditionalAttackTurn) {
        statusHtml = '➕ ВЫ МОЖЕТЕ ПОДКИНУТЬ КАРТЫ ➕<br><span style="font-size:12px">Нажмите на карту, чтобы подкинуть</span>';
        statusBar.style.background = '#9c27b0';
    } else if (isMyAttackTurn) {
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
    
    if (otherPlayers[0]) {
        let roleHtml = '';
        let winnerClass = '';
        if (otherPlayers[0].username === attacker) roleHtml = '<div class="role-badge attacker">⚔️ АТАКУЕТ</div>';
        if (otherPlayers[0].username === defender) roleHtml = '<div class="role-badge defender">🛡️ ОТБИВАЕТСЯ</div>';
        if (otherPlayers[0].cardCount === 0) winnerClass = 'player-winner';
        
        playerTop.innerHTML = `
            <div class="player-name ${winnerClass}">${escapeHtml(otherPlayers[0].username)}</div>
            <div class="player-cards">📋 ${otherPlayers[0].cardCount} карт</div>
            ${roleHtml}
        `;
    }
    
    if (otherPlayers[1]) {
        let roleHtml = '';
        let winnerClass = '';
        if (otherPlayers[1].username === attacker) roleHtml = '<div class="role-badge attacker">⚔️ АТАКУЕТ</div>';
        if (otherPlayers[1].username === defender) roleHtml = '<div class="role-badge defender">🛡️ ОТБИВАЕТСЯ</div>';
        if (otherPlayers[1].cardCount === 0) winnerClass = 'player-winner';
        
        playerLeft.innerHTML = `
            <div class="player-name ${winnerClass}">${escapeHtml(otherPlayers[1].username)}</div>
            <div class="player-cards">📋 ${otherPlayers[1].cardCount} карт</div>
            ${roleHtml}
        `;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

function renderMyHand(hand, state) {
    const handEl = document.getElementById('myHand');
    if (!handEl) return;
    
    handEl.innerHTML = '';
    
    if (hand.length === 0) {
        handEl.innerHTML = '<div class="win-message">🏆 ВЫ ПОБЕДИТЕЛЬ! 🏆<br><span style="font-size:14px;">Наблюдайте за игрой</span></div>';
        return;
    }
    
    hand.forEach((card, index) => {
        const onClick = (cardIdx) => {
            if (isMyAdditionalAttackTurn) {
                console.log(`➕ Подкидывание картой ${card.rank} ${card.suit}, индекс ${cardIdx}`);
                socket.emit('additionalAttack', { cardIndex: cardIdx }, (result) => {
                    if (result && !result.success) {
                        alert(result.error || 'Нельзя подкинуть эту карту');
                    }
                });
            } else if (isMyAttackTurn) {
                console.log(`⚔️ Атака картой ${card.rank} ${card.suit}, индекс ${cardIdx}`);
                socket.emit('attack', { cardIndex: cardIdx }, (result) => {
                    if (result && !result.success) {
                        alert(result.error || 'Нельзя сходить этой картой');
                    }
                });
            } else if (isMyDefendTurn) {
                console.log(`🛡️ Защита картой ${card.rank} ${card.suit}, индекс ${cardIdx}`);
                socket.emit('defend', { cardIndex: cardIdx }, (result) => {
                    if (result && !result.success) {
                        alert(result.error || 'Нельзя побить этой картой');
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

function createButton(text, color, onClick) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
        padding: 10px 20px;
        background: ${color};
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 16px;
        font-weight: bold;
        z-index: 1001;
        transition: all 0.3s;
    `;
    btn.onmouseover = () => {
        btn.style.transform = 'translateY(-2px)';
        btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    };
    btn.onmouseout = () => {
        btn.style.transform = 'translateY(0)';
        btn.style.boxShadow = 'none';
    };
    btn.onclick = onClick;
    return btn;
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
    
    const table = state.table || [];
    const attackCount = table.filter(t => t.type === 'attack').length;
    const defendCount = table.filter(t => t.type === 'defend').length;
    const allDefended = attackCount === defendCount && attackCount > 0;
    const hasUndefended = attackCount > defendCount;
    
    console.log('=== renderActionButtons DEBUG ===');
    console.log('isMyTurnAttack:', state.isMyTurnAttack);
    console.log('isMyTurnDefend:', state.isMyTurnDefend);
    console.log('isMyAdditionalAttackTurn:', state.isMyAdditionalAttackTurn);
    console.log('attackCount:', attackCount, 'defendCount:', defendCount);
    
    // Кнопка "Завершить ход" - ТОЛЬКО для обычного атакующего (не для дополнительного)
    // Важно: НЕ показывать эту кнопку, если это дополнительная атака
    if (state.isMyTurnAttack && !state.isMyAdditionalAttackTurn && table.length > 0 && allDefended) {
        const endBtn = createButton('✅ Завершить ход', '#ff9800', () => {
            console.log('Нажата кнопка завершения хода');
            socket.emit('endTurn', {}, (result) => {
                console.log('endTurn result:', result);
                if (result && !result.success) {
                    alert(result.error);
                }
            });
        });
        buttonsDiv.appendChild(endBtn);
        console.log('✅ Добавлена кнопка "Завершить ход"');
    }
    
    // Кнопка "Завершить подкидывание" - ТОЛЬКО для дополнительного атакующего (третьего игрока)
    if (state.isMyAdditionalAttackTurn) {
        const endAdditionalBtn = createButton('✅ Завершить подкидывание', '#9c27b0', () => {
            console.log('Нажата кнопка завершения подкидывания');
            socket.emit('endAdditionalAttack', {}, (result) => {
                console.log('endAdditionalAttack result:', result);
                if (result && !result.success) {
                    alert(result.error);
                }
            });
        });
        buttonsDiv.appendChild(endAdditionalBtn);
        console.log('✅ Добавлена кнопка "Завершить подкидывание"');
    }
    
    // Кнопка "Забрать карты" - только для защитника
    if (state.isMyTurnDefend && hasUndefended) {
        const takeBtn = createButton('📥 Забрать карты', '#f44336', () => {
            console.log('Нажата кнопка забрать карты');
            socket.emit('takeCards', {}, (result) => {
                console.log('takeCards result:', result);
                if (result && !result.success) {
                    alert(result.error);
                }
            });
        });
        buttonsDiv.appendChild(takeBtn);
        console.log('✅ Добавлена кнопка "Забрать карты"');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM загружен, инициализация GameUI');
    initGameUI();
});