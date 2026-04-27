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
let currentLobbyId = null;

function initGameUI() {
    console.log('initGameUI started');
    
    playerName = sessionStorage.getItem('playerName');
    console.log('Player name from session:', playerName);
    
    const urlParams = new URLSearchParams(window.location.search);
    currentLobbyId = urlParams.get('lobbyId') || sessionStorage.getItem('currentLobbyId');
    console.log('LobbyId:', currentLobbyId);
    
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
    
    window.addEventListener('beforeunload', () => {
        if (socket && socket.connected) {
            socket.emit('leaveLobby', {});
        }
    });
    
    if (!socket) {
        socket = io({
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000
        });
        
        socket.on('connect', () => {
            console.log('✅ Socket connected in gameUI, id:', socket.id);
            
            if (!currentLobbyId) {
                console.error('❌ Нет lobbyId!');
                alert('Ошибка: не удалось определить лобби. Перенаправление...');
                window.location.href = '/lobby.html';
                return;
            }
            
            socket.currentLobby = currentLobbyId;
            socket.currentUsername = playerName;
            sessionStorage.setItem('currentLobbyId', currentLobbyId);
            
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
        statusBar.style.background = 'linear-gradient(135deg, #d4af37, #b8860b)';
        statusBar.style.color = '#1a0f08';
        statusBar.style.borderLeft = '6px solid #ffd700';
        return;
    }
    
    let statusHtml = '';
    if (isMyAdditionalAttackTurn) {
        statusHtml = '➕ ПОДКИДЫВАНИЕ КАРТ ➕<br><span style="font-size:12px">Нажмите на карту, чтобы подкинуть</span>';
        statusBar.style.background = 'rgba(106, 27, 154, 0.92)';
        statusBar.style.borderLeft = '6px solid #d4af37';
    } else if (isMyAttackTurn) {
        statusHtml = '🔥 ВЫ АТАКУЕТЕ 🔥<br><span style="font-size:12px">Нажмите на карту, чтобы сходить</span>';
        statusBar.style.background = 'rgba(198, 76, 0, 0.92)';
        statusBar.style.borderLeft = '6px solid #d4af37';
    } else if (isMyDefendTurn) {
        statusHtml = '🛡️ ВЫ ОТБИВАЕТЕСЬ 🛡️<br><span style="font-size:12px">Нажмите на карту, чтобы побить</span>';
        statusBar.style.background = 'rgba(33, 99, 33, 0.92)';
        statusBar.style.borderLeft = '6px solid #d4af37';
    } else {
        statusHtml = `🎴 Ходит: ${state.currentAttacker || '—'} → отбивается: ${state.currentDefender || '—'}<br><span style="font-size:12px">♢ КОЗЫРЬ: БУБНЫ</span>`;
        statusBar.style.background = 'rgba(10, 6, 4, 0.92)';
        statusBar.style.borderLeft = '6px solid #d4af37';
    }
    
    statusBar.innerHTML = statusHtml;
    statusBar.style.color = '#f5e2b0';
}

function renderPlayersInfo(players, attacker, defender) {
    const playerTop = document.getElementById('playerTop');
    const playerRight = document.getElementById('playerRight');
    
    if (!playerTop || !playerRight) return;
    
    const otherPlayers = players.filter(p => p.id !== socket.id);
    
    if (otherPlayers[0]) {
        let roleHtml = '';
        let winnerClass = '';
        if (otherPlayers[0].username === attacker) roleHtml = '<div class="role-badge attacker">⚔️ АТАКУЕТ</div>';
        if (otherPlayers[0].username === defender) roleHtml = '<div class="role-badge defender">🛡️ ОТБИВАЕТСЯ</div>';
        if (otherPlayers[0].cardCount === 0) winnerClass = 'player-winner';
        
        playerTop.innerHTML = `
            <div class="badge-info">
                <div class="player-name ${winnerClass}">${escapeHtml(otherPlayers[0].username)}</div>
                <div class="player-cards">🎴 ${otherPlayers[0].cardCount} карт</div>
                ${roleHtml}
            </div>
        `;
    }
    
    if (otherPlayers[1]) {
        let roleHtml = '';
        let winnerClass = '';
        if (otherPlayers[1].username === attacker) roleHtml = '<div class="role-badge attacker">⚔️ АТАКУЕТ</div>';
        if (otherPlayers[1].username === defender) roleHtml = '<div class="role-badge defender">🛡️ ОТБИВАЕТСЯ</div>';
        if (otherPlayers[1].cardCount === 0) winnerClass = 'player-winner';
        
        playerRight.innerHTML = `
            <div class="badge-info">
                <div class="player-name ${winnerClass}">${escapeHtml(otherPlayers[1].username)}</div>
                <div class="player-cards">🎴 ${otherPlayers[1].cardCount} карт</div>
                ${roleHtml}
            </div>
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
    const imgPath = `/cards/${card.rank}_of_${card.suit}.png`;
    img.src = imgPath;
    img.alt = `${card.rank} ${card.suit}`;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.borderRadius = '10px';
    
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
            background: linear-gradient(145deg, #fffcf5, #fff0e0);
            border-radius: 10px;
            color: ${isRed ? '#b12a2a' : '#2c2c2c'};
            font-size: 28px;
            font-weight: bold;
            font-family: 'Playfair Display', serif;
        `;
        textDiv.innerHTML = `<div style="font-size: 32px;">${card.rank}</div><div style="font-size: 36px;">${suits[card.suit]}</div>`;
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
        div.style.position = 'relative';
        div.appendChild(queenMark);
    }
    
    return div;
}

function renderTable(table) {
    const zone = document.getElementById('tableZone');
    if (!zone) return;
    
    zone.innerHTML = '';
    
    if (!table || table.length === 0) {
        zone.innerHTML = `<div class="empty-text" style="text-align:center; background:rgba(0,0,0,0.5); padding:15px 25px; border-radius:60px;">❖ СТОЛ ПУСТ ❖<br>Сделайте ход</div>`;
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
                width: 88px;
                height: 122px;
                background: rgba(0,0,0,0.65);
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #d4af37;
                font-size: 32px;
                font-weight: bold;
                position: absolute;
                top: 15px;
                left: 15px;
                border: 1px dashed #d4af37;
                backdrop-filter: blur(4px);
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
        handEl.innerHTML = '<div class="win-message" style="background:rgba(0,0,0,0.6); padding:15px 30px; border-radius:60px; text-align:center;">🏆 ВЫ ПОБЕДИТЕЛЬ! 🏆<br><span style="font-size:14px; color:#c9af7b;">Наблюдайте за игрой</span></div>';
        return;
    }
    
    hand.forEach((card, index) => {
        const onClick = (cardIdx) => {
            if (isMyAdditionalAttackTurn) {
                socket.emit('additionalAttack', { cardIndex: cardIdx }, (result) => {
                    if (result && !result.success) alert(result.error || 'Нельзя подкинуть эту карту');
                });
            } else if (isMyAttackTurn) {
                socket.emit('attack', { cardIndex: cardIdx }, (result) => {
                    if (result && !result.success) alert(result.error || 'Нельзя сходить этой картой');
                });
            } else if (isMyDefendTurn) {
                socket.emit('defend', { cardIndex: cardIdx }, (result) => {
                    if (result && !result.success) alert(result.error || 'Нельзя побить этой картой');
                });
            } else {
                alert('Сейчас не ваш ход');
            }
        };
        const cardDiv = createCardImage(card, 'my-card', onClick, index);
        handEl.appendChild(cardDiv);
    });
}

function createButton(text, bgGradient, onClick) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.className = 'action-btn';
    btn.style.background = bgGradient;
    btn.onclick = onClick;
    return btn;
}

function renderActionButtons(state) {
    let buttonsDiv = document.getElementById('actionButtons');
    
    const table = state.table || [];
    const attackCount = table.filter(t => t.type === 'attack').length;
    const defendCount = table.filter(t => t.type === 'defend').length;
    const allDefended = attackCount === defendCount && attackCount > 0;
    const hasUndefended = attackCount > defendCount;
    
    let hasAnyButton = false;
    
    if (state.isMyTurnAttack && !state.isMyAdditionalAttackTurn && table.length > 0 && allDefended) {
        hasAnyButton = true;
    }
    if (state.isMyAdditionalAttackTurn) {
        hasAnyButton = true;
    }
    if (state.isMyTurnDefend && hasUndefended) {
        hasAnyButton = true;
    }
    
    if (!hasAnyButton) {
        if (buttonsDiv) buttonsDiv.style.display = 'none';
        return;
    }
    
    if (!buttonsDiv) {
        buttonsDiv = document.createElement('div');
        buttonsDiv.id = 'actionButtons';
        buttonsDiv.className = 'action-buttons';
        document.body.appendChild(buttonsDiv);
    }
    
    buttonsDiv.style.display = 'flex';
    buttonsDiv.innerHTML = '';
    
    if (state.isMyTurnAttack && !state.isMyAdditionalAttackTurn && table.length > 0 && allDefended) {
        const endBtn = createButton('✅ ЗАВЕРШИТЬ ХОД', 'linear-gradient(135deg, #b56a1a, #7a3e0a)', () => {
            socket.emit('endTurn', {}, (result) => { if (result && !result.success) alert(result.error); });
        });
        buttonsDiv.appendChild(endBtn);
    }
    if (state.isMyAdditionalAttackTurn) {
        const endAddBtn = createButton('✅ ЗАВЕРШИТЬ ПОДКИД', 'linear-gradient(135deg, #6a1b9a, #3e0a5a)', () => {
            socket.emit('endAdditionalAttack', {}, (result) => { if (result && !result.success) alert(result.error); });
        });
        buttonsDiv.appendChild(endAddBtn);
    }
    if (state.isMyTurnDefend && hasUndefended) {
        const takeBtn = createButton('📥 ЗАБРАТЬ КАРТЫ', 'linear-gradient(135deg, #8b0000, #5c0000)', () => {
            socket.emit('takeCards', {}, (result) => { if (result && !result.success) alert(result.error); });
        });
        buttonsDiv.appendChild(takeBtn);
    }
}

function exitGame() {
    if (confirm('Выйти из игры?')) {
        if (socket && socket.connected) {
            socket.emit('leaveLobby', {}, () => {
                window.location.href = '/lobby.html';
            });
        } else {
            window.location.href = '/lobby.html';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM загружен, инициализация GameUI (Luxury Casino)');
    initGameUI();
});