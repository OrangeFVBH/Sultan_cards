let isMyAttackTurn = false;
let isMyDefendTurn = false;
let myHand = [];
let tableCards = [];
let socket = null;
let playerName = null;

function initGameUI() {
    console.log('initGameUI started');
    
    // Получаем имя игрока из sessionStorage
    playerName = sessionStorage.getItem('playerName');
    console.log('Player name from session:', playerName);
    
    if (typeof io === 'undefined') {
        console.error('socket.io не загружен!');
        setTimeout(initGameUI, 500);
        return;
    }
    
    if (!socket) {
        socket = io({
            reconnection: true,
            reconnectionAttempts: 5
        });
        
        socket.on('connect', () => {
            console.log('✅ Socket connected in gameUI, id:', socket.id);
            
            // Восстанавливаем соединение с игрой
            if (playerName) {
                console.log('🔄 Восстановление соединения для', playerName);
                socket.emit('requestGameState', playerName);
            }
        });
        
        socket.on('gameState', (state) => {
            console.log('Game state received!', state);
            if (state.myHand) {
                console.log('Карт в руке:', state.myHand.length);
                if (state.myHand.length > 0) {
                    console.log('Первая карта:', state.myHand[0]);
                }
            }
            updateGameState(state);
        });
        
        socket.on('gameOver', (data) => {
            console.log('Game over:', data);
            alert(`Игра окончена!\nПобедитель: ${data.winner}`);
            setTimeout(() => {
                window.location.href = '/';
            }, 3000);
        });
        
        socket.on('error', (error) => {
            console.error('Socket error:', error);
            alert(error);
        });
        
        socket.on('playerLeft', (data) => {
            console.log('Player left:', data);
            alert(data.message);
        });
        
        socket.on('disconnect', () => {
            console.log('Socket disconnected in gameUI');
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
        statusBar.textContent = `🏆 ПОБЕДИТЕЛЬ: ${state.gameWinner} 🏆`;
        statusBar.style.color = '#ffd700';
        return;
    }
    
    if (isMyAttackTurn) {
        statusBar.innerHTML = '🔥 ВЫ АТАКУЕТЕ 🔥<br><span style="font-size:14px">Нажмите на карту, чтобы сходить</span>';
        statusBar.style.color = '#ff9800';
    } else if (isMyDefendTurn) {
        statusBar.innerHTML = '🛡️ ВЫ ОТБИВАЕТЕСЬ 🛡️<br><span style="font-size:14px">Нажмите на карту, чтобы побить</span>';
        statusBar.style.color = '#4caf50';
    } else {
        statusBar.innerHTML = `🎴 Ходит: ${state.currentAttacker || '—'} → отбивается: ${state.currentDefender || '—'}<br><span style="font-size:14px">Козырь: ♢ БУБНЫ</span>`;
        statusBar.style.color = '#fff';
    }
}

function renderPlayersInfo(players, attacker, defender) {
    const playerTop = document.getElementById('playerTop');
    const playerLeft = document.getElementById('playerLeft');
    const playerRight = document.getElementById('playerRight');
    
    if (!playerTop || !playerLeft || !playerRight) return;
    
    const otherPlayers = players.filter(p => p.id !== socket.id);
    
    const zones = [playerTop, playerLeft, playerRight];
    otherPlayers.forEach((player, index) => {
        if (zones[index]) {
            let roleHtml = '';
            if (player.username === attacker) roleHtml = '<span class="role-attacker">⚔️ АТАКУЕТ</span>';
            if (player.username === defender) roleHtml = '<span class="role-defender">🛡️ ОТБИВАЕТСЯ</span>';
            
            zones[index].innerHTML = `
                <div class="player-name">${player.username}</div>
                <div class="player-cards">📋 ${player.cardCount} карт</div>
                ${roleHtml}
            `;
        }
    });
}

function getCardImagePath(card) {
    return `/cards/${card.rank}_of_${card.suit}.png`;
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
        div.onclick = () => onClickHandler(cardIndex);
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
                console.log(`Атака картой ${card.rank} ${card.suit}, индекс ${cardIdx}`);
                socket.emit('attack', { cardIndex: cardIdx }, (result) => {
                    if (!result || !result.success) {
                        alert(result?.error || 'Нельзя сходить этой картой');
                    }
                });
            } else if (isMyDefendTurn) {
                console.log(`Защита картой ${card.rank} ${card.suit}, индекс ${cardIdx}`);
                socket.emit('defend', { cardIndex: cardIdx }, (result) => {
                    if (!result || !result.success) {
                        alert(result?.error || 'Нельзя побить этой картой');
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
        document.getElementById('gameContainer')?.appendChild(buttonsDiv);
    }
    
    buttonsDiv.innerHTML = '';
    
    if (state.isMyTurnAttack && state.table && state.table.length > 0) {
        const endBtn = document.createElement('button');
        endBtn.className = 'action-btn end-btn';
        endBtn.textContent = '✅ Завершить ход';
        endBtn.onclick = () => {
            socket.emit('endTurn', {}, (result) => {
                if (!result || !result.success) alert(result?.error);
                else console.log('Ход завершен');
            });
        };
        buttonsDiv.appendChild(endBtn);
    }
    
    if (state.isMyTurnDefend && state.table && state.table.length > 0) {
        const takeBtn = document.createElement('button');
        takeBtn.className = 'action-btn take-btn';
        takeBtn.textContent = '📥 Забрать карты';
        takeBtn.onclick = () => {
            socket.emit('takeCards', {}, (result) => {
                if (!result || !result.success) alert(result?.error);
                else console.log('Карты забраны');
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