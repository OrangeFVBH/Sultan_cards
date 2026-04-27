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
let dealingInProgress = false;
let dealerIndex = null;
let animationOverlay = null;

function initGameUI() {
    console.log('initGameUI started');
    
    const urlParams = new URLSearchParams(window.location.search);
    const lobbyId = urlParams.get('lobbyId');
    
    if (!lobbyId) {
        console.error('Нет lobbyId в URL!');
        const savedLobbyId = sessionStorage.getItem('currentLobbyId');
        if (savedLobbyId) {
            console.log('Найден lobbyId в sessionStorage, перенаправляем...');
            window.location.href = `/game.html?lobbyId=${savedLobbyId}`;
            return;
        }
        alert('Ошибка: игра не найдена. Возврат в лобби...');
        window.location.href = '/lobby.html';
        return;
    }
    
    playerName = sessionStorage.getItem('playerName');
    console.log('Player name from session:', playerName);
    console.log('LobbyId from URL:', lobbyId);
    
    currentLobbyId = lobbyId;
    sessionStorage.setItem('currentLobbyId', lobbyId);
    
    if (!playerName) {
        console.error('Нет имени игрока!');
        alert('Ошибка: не удалось определить игрока. Перенаправление в лобби...');
        window.location.href = '/lobby.html';
        return;
    }
    
    if (typeof io === 'undefined') {
        console.error('socket.io не загружен!');
        const script = document.createElement('script');
        script.src = '/socket.io/socket.io.js';
        script.onload = () => {
            console.log('socket.io загружен динамически');
            initGameUI();
        };
        script.onerror = () => {
            console.error('Не удалось загрузить socket.io');
            alert('Ошибка загрузки. Обновите страницу.');
        };
        document.head.appendChild(script);
        return;
    }
    
    window.addEventListener('beforeunload', () => {
        console.log('Страница закрывается, игра продолжается на сервере');
    });
    
    if (socket && socket.connected) {
        console.log('Сокет уже подключен, запрашиваем состояние игры');
        socket.currentLobby = currentLobbyId;
        socket.currentUsername = playerName;
        requestGameState();
        return;
    }
    
    socket = io({
        reconnection: true,
        reconnectionAttempts: 20,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
    });
    
    socket.on('connect', () => {
        console.log('✅ Socket connected in gameUI, id:', socket.id);
        
        socket.currentLobby = currentLobbyId;
        socket.currentUsername = playerName;
        
        gameReady = true;
        
        requestGameState();
    });
    
    socket.on('gameStarted', (data) => {
        console.log('🎮 Получен сигнал gameStarted, lobbyId:', data.lobbyId);
        currentLobbyId = data.lobbyId;
        sessionStorage.setItem('currentLobbyId', data.lobbyId);
        socket.currentLobby = data.lobbyId;
    });
    
    socket.on('dealAnimation', (data) => {
        console.log('🎴 Получена команда на анимацию раздачи:', data);
        startDealingAnimation(data);
    });
    
    socket.on('gameState', (state) => {
        console.log('📦 Game state received!', state);
        currentGameState = state;
        updateGameState(state);
    });
    
    socket.on('gameOver', (data) => {
        console.log('🏁 Game over:', data);
        let message = '';
        const isWinner = data.isWinner || (data.winner && data.winner.includes(playerName));
        
        if (data.disconnectedPlayer) {
            message = `Игра прервана!\nИгрок ${data.disconnectedPlayer} отключился.`;
        } else if (isWinner) {
            message = `🏆 ПОБЕДА! 🏆\n${data.winner}`;
        } else if (data.winner === 'Ничья - все победители!') {
            message = `🤝 НИЧЬЯ! 🤝\n${data.winner}`;
        } else {
            message = `😢 Вы проиграли!\nПобедитель: ${data.winner}`;
        }
        
        const statusBar = document.getElementById('statusBar');
        if (statusBar) {
            statusBar.innerHTML = message.replace(/\n/g, '<br>');
            statusBar.style.background = 'linear-gradient(135deg, #d4af37, #b8860b)';
            statusBar.style.color = '#1a0f08';
        }
        
        setTimeout(() => {
            window.location.href = '/lobby.html';
        }, 3000);
    });
    
    socket.on('error', (error) => {
        console.error('❌ Socket error:', error);
        const statusBar = document.getElementById('statusBar');
        if (statusBar) {
            statusBar.innerHTML = `⚠️ ${error}`;
            statusBar.style.background = 'rgba(139, 0, 0, 0.9)';
        }
    });
    
    socket.on('disconnect', (reason) => {
        console.log('🔌 Socket disconnected in gameUI. Reason:', reason);
        gameReady = false;
        const statusBar = document.getElementById('statusBar');
        if (statusBar) {
            statusBar.innerHTML = '⚠️ Потеря соединения с сервером. Переподключение...';
            statusBar.style.background = 'rgba(139, 0, 0, 0.7)';
        }
    });
    
    socket.on('reconnect', (attemptNumber) => {
        console.log('🔄 Переподключение к серверу успешно (попытка ' + attemptNumber + ')');
        gameReady = true;
        
        const statusBar = document.getElementById('statusBar');
        if (statusBar) {
            statusBar.innerHTML = '✅ Соединение восстановлено!';
            statusBar.style.background = 'rgba(10, 6, 4, 0.92)';
        }
        
        socket.currentLobby = currentLobbyId;
        socket.currentUsername = playerName;
        
        requestGameState();
    });
    
    socket.on('reconnect_attempt', (attemptNumber) => {
        console.log('🔄 Попытка переподключения #' + attemptNumber);
        const statusBar = document.getElementById('statusBar');
        if (statusBar) {
            statusBar.innerHTML = `🔄 Переподключение... (попытка ${attemptNumber})`;
        }
    });
    
    socket.on('reconnect_error', (error) => {
        console.error('❌ Ошибка переподключения:', error);
    });
    
    socket.on('reconnect_failed', () => {
        console.error('❌ Не удалось переподключиться к серверу');
        const statusBar = document.getElementById('statusBar');
        if (statusBar) {
            statusBar.innerHTML = '❌ Не удалось подключиться к серверу. Обновите страницу.';
        }
    });
    
    function requestGameState() {
        stateRequestCount = 0;
        
        const doRequest = () => {
            // Прекращаем запросы если уже получили состояние
            if (currentGameState && currentGameState.myHand && currentGameState.myHand.length > 0) {
                console.log('✅ Состояние игры уже получено, запросы прекращены');
                return;
            }
            
            if (socket && socket.connected) {
                console.log(`🔄 Запрос состояния игры (попытка ${stateRequestCount + 1}) для ${playerName}`);
                socket.emit('requestGameState', { 
                    username: playerName, 
                    lobbyId: currentLobbyId 
                });
                stateRequestCount++;
                
                if (stateRequestCount < 15) {
                    setTimeout(doRequest, 1500);
                } else {
                    console.log('❌ Не удалось получить состояние игры после 15 попыток');
                    const statusBar = document.getElementById('statusBar');
                    if (statusBar) {
                        statusBar.innerHTML = '❌ Не удалось загрузить игру. Возврат в лобби...';
                    }
                    setTimeout(() => {
                        window.location.href = '/lobby.html';
                    }, 2000);
                }
            }
        };
        
        setTimeout(doRequest, 1000);
    }
}

function startDealingAnimation(data) {
    if (dealingInProgress) return;
    dealingInProgress = true;
    
    const { players, dealerIndex: dealer } = data;
    dealerIndex = dealer;
    
    console.log('🎴 Запуск анимации раздачи. Дилер:', players[dealerIndex]?.username);
    
    // Очищаем стол и руки перед анимацией
    const tableZone = document.getElementById('tableZone');
    const myHandEl = document.getElementById('myHand');
    const playerTop = document.getElementById('playerTop');
    const playerRight = document.getElementById('playerRight');
    
    if (tableZone) tableZone.innerHTML = '';
    if (myHandEl) myHandEl.innerHTML = '';
    
    // Обновляем информацию об игроках
    if (playerTop) {
        const topPlayer = players.find((_, i) => i !== dealerIndex && i === (dealerIndex + 1) % 3);
        if (topPlayer || players[0]) {
            const p = topPlayer || players[0];
            playerTop.innerHTML = `
                <div class="badge-info">
                    <div class="player-name">${escapeHtml(p.username)}</div>
                    <div class="player-cards">🎴 0 карт</div>
                </div>
            `;
        }
    }
    
    if (playerRight) {
        const rightPlayer = players.find((_, i) => i !== dealerIndex && i === (dealerIndex + 2) % 3);
        if (rightPlayer || players[1]) {
            const p = rightPlayer || players[1];
            playerRight.innerHTML = `
                <div class="badge-info">
                    <div class="player-name">${escapeHtml(p.username)}</div>
                    <div class="player-cards">🎴 0 карт</div>
                </div>
            `;
        }
    }
    
    // Создаем оверлей с колодой
    const overlay = document.createElement('div');
    overlay.id = 'dealAnimationOverlay';
    overlay.className = 'deal-overlay';
    overlay.innerHTML = `
        <div class="deal-container">
            <div class="dealer-info">
                <span class="dealer-label">🎩 Дилер:</span>
                <span class="dealer-name">${escapeHtml(players[dealerIndex]?.username || 'Случайный игрок')}</span>
            </div>
            <div class="deck-wrapper" id="deckWrapper">
                <div class="deck-stack" id="deckStack">
                    ${Array(36).fill(0).map((_, i) => `
                        <div class="deck-card-animated" style="z-index: ${i}; transform: translateY(${-i * 0.3}px) translateX(${i * 0.5}px);">
                            <div class="card-back-pattern">
                                <img src="/cards/back.png" 
                                     alt="Карта" 
                                     class="card-back-image"
                                     onerror="this.style.display='none'; this.parentElement.classList.add('card-back-fallback');" />
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="deck-glow"></div>
            </div>
            <div class="deal-instruction" id="dealInstruction">
                ${playerName === players[dealerIndex]?.username 
                    ? '👆 НАЖМИТЕ НА КОЛОДУ ДЛЯ РАЗДАЧИ' 
                    : `⏳ Ожидание раздачи от ${players[dealerIndex]?.username || 'дилера'}...`}
            </div>
        </div>
    `;
    
    // Добавляем стили для анимации
    if (!document.getElementById('dealAnimStyles')) {
        const style = document.createElement('style');
        style.id = 'dealAnimStyles';
        style.textContent = `
            .deal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.85);
                backdrop-filter: blur(10px);
                z-index: 5000;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: fadeIn 0.5s ease;
            }
            
            .deal-container {
                text-align: center;
            }
            
            .dealer-info {
                margin-bottom: 30px;
                color: #faf4e0;
                font-family: 'Oswald', sans-serif;
                font-size: 24px;
                letter-spacing: 2px;
                text-shadow: 0 0 20px rgba(212, 175, 55, 0.5);
            }
            
            .dealer-label {
                color: #c9af7b;
            }
            
            .dealer-name {
                color: #d4af37;
                font-weight: bold;
                font-size: 28px;
                text-shadow: 0 0 30px rgba(212, 175, 55, 0.8);
            }
            
            .deck-wrapper {
                position: relative;
                display: inline-block;
                transition: transform 0.3s ease;
            }
            
            .deck-wrapper.clickable {
                cursor: pointer;
                animation: glowPulse 2s ease-in-out infinite;
            }
            
            .deck-wrapper.clickable:hover {
                transform: scale(1.05);
            }
            
            .deck-wrapper.clickable:hover .deck-glow {
                opacity: 1;
            }
            
            .deck-stack {
                position: relative;
                width: 160px;
                height: 224px;
                margin: 0 auto;
            }
            
            .deck-card-animated {
                position: absolute;
                width: 100%;
                height: 100%;
                border-radius: 14px;
                transition: all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            }
            
            .card-back-pattern {
                width: 100%;
                height: 100%;
                border-radius: 14px;
                border: 2px solid #d4af37;
                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(212, 175, 55, 0.4);
                overflow: hidden;
                position: relative;
                background: linear-gradient(135deg, #1a237e 0%, #0d47a1 50%, #1565c0 100%);
            }
            
            .card-back-pattern.card-back-fallback::after {
                content: "🂠";
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 60px;
                color: rgba(212, 175, 55, 0.6);
                text-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
            }
            
            .card-back-pattern.card-back-fallback::before {
                content: "";
                position: absolute;
                top: 10px;
                left: 10px;
                right: 10px;
                bottom: 10px;
                border: 2px solid rgba(212, 175, 55, 0.3);
                border-radius: 8px;
            }
            
            .card-back-image {
                width: 100%;
                height: 100%;
                object-fit: cover;
                border-radius: 14px;
                display: block;
            }
            
            .deck-glow {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 220px;
                height: 300px;
                background: radial-gradient(ellipse, rgba(212, 175, 55, 0.25) 0%, transparent 70%);
                border-radius: 50%;
                opacity: 0;
                transition: opacity 0.5s ease;
                pointer-events: none;
            }
            
            .deal-instruction {
                margin-top: 35px;
                color: #d4af37;
                font-family: 'Oswald', sans-serif;
                font-size: 22px;
                letter-spacing: 2px;
                text-shadow: 0 0 20px rgba(212, 175, 55, 0.6);
                animation: pulse 2s ease-in-out infinite;
            }
            
            @keyframes dealCardFly {
                0% { 
                    transform: translate(0, 0) rotate(0deg);
                    opacity: 1;
                }
                80% {
                    opacity: 0.7;
                }
                100% { 
                    transform: translate(var(--fly-x), var(--fly-y)) rotate(var(--fly-rot)) scale(0.7);
                    opacity: 0;
                }
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            @keyframes glowPulse {
                0%, 100% { filter: drop-shadow(0 0 20px rgba(212, 175, 55, 0.3)); }
                50% { filter: drop-shadow(0 0 45px rgba(212, 175, 55, 0.7)); }
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.6; transform: scale(1.05); }
            }
            
            @keyframes particleBurst {
                0% { transform: translate(0, 0) scale(1); opacity: 1; }
                100% { transform: translate(var(--px), var(--py)) scale(0); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(overlay);
    animationOverlay = overlay;
    
    const deckWrapper = document.getElementById('deckWrapper');
    const isDealer = playerName === players[dealerIndex]?.username;
    
    if (isDealer) {
        deckWrapper.classList.add('clickable');
        deckWrapper.addEventListener('click', () => {
            handleDeckClick(players, dealerIndex, overlay);
        });
    } else {
        deckWrapper.style.opacity = '0.7';
        deckWrapper.style.pointerEvents = 'none';
    }
    
    // Слушаем событие от сервера для синхронизации
    socket.once('startDealingAnimation', () => {
        animateCardDistribution(players, dealerIndex, overlay);
    });
}

function handleDeckClick(players, dealerIndex, overlay) {
    const deckWrapper = document.getElementById('deckWrapper');
    if (deckWrapper) {
        deckWrapper.classList.remove('clickable');
        deckWrapper.style.pointerEvents = 'none';
    }
    
    // Отправляем событие на сервер для синхронизации
    socket.emit('startDealingAnimation', { lobbyId: currentLobbyId });
    
    // Запускаем анимацию локально
    animateCardDistribution(players, dealerIndex, overlay);
}

function animateCardDistribution(players, dealerIndex, overlay) {
    console.log('🃏 Запуск анимации раздачи карт');
    
    // Скрываем инструкцию
    const instruction = document.getElementById('dealInstruction');
    if (instruction) {
        instruction.textContent = '🃏 РАЗДАЧА КАРТ...';
        instruction.style.animation = 'none';
        instruction.style.opacity = '0.8';
    }
    
    // Определяем позиции для раздачи
    const positions = {
        top: { x: window.innerWidth / 2, y: 130 },
        right: { x: window.innerWidth - 180, y: window.innerHeight / 2 },
        bottom: { x: window.innerWidth / 2, y: window.innerHeight - 180 }
    };
    
    // Определяем, какой игрок где находится
    const playerPositions = {};
    const otherIndices = [0, 1, 2].filter(i => i !== dealerIndex);
    
    // Дилер всегда снизу
    playerPositions[dealerIndex] = { ...positions.bottom, name: players[dealerIndex].username };
    
    // Остальные игроки
    if (otherIndices.length >= 1) {
        playerPositions[otherIndices[0]] = { ...positions.top, name: players[otherIndices[0]].username };
    }
    if (otherIndices.length >= 2) {
        playerPositions[otherIndices[1]] = { ...positions.right, name: players[otherIndices[1]].username };
    }
    
    const deckStack = document.getElementById('deckStack');
    const deckCards = deckStack.querySelectorAll('.deck-card-animated');
    const deckCenterX = window.innerWidth / 2;
    const deckCenterY = window.innerHeight / 2;
    
    // Анимируем каждую карту
    deckCards.forEach((card, index) => {
        setTimeout(() => {
            const playerIndex = Math.floor(index / 12) % 3;
            const target = playerPositions[playerIndex];
            
            if (target) {
                const spreadX = (Math.random() * 60 - 30);
                const spreadY = (Math.random() * 60 - 30);
                const flyX = target.x - deckCenterX + spreadX;
                const flyY = target.y - deckCenterY + spreadY;
                const flyRot = Math.random() * 40 - 20;
                
                card.style.setProperty('--fly-x', `${flyX}px`);
                card.style.setProperty('--fly-y', `${flyY}px`);
                card.style.setProperty('--fly-rot', `${flyRot}deg`);
                card.style.animation = `dealCardFly 0.6s ease-in forwards`;
                card.style.animationDelay = `${index * 15}ms`;
                
                // Частицы при приземлении
                if (index % 3 === 0) {
                    setTimeout(() => {
                        createDealParticles(target.x, target.y);
                    }, 400 + index * 5);
                }
            }
        }, index * 20);
    });
    
    // Завершаем анимацию
    const totalCards = 36;
    setTimeout(() => {
        finishDealingAnimation(overlay);
    }, totalCards * 20 + 1500);
}

function createDealParticles(x, y) {
    for (let i = 0; i < 6; i++) {
        const particle = document.createElement('div');
        particle.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            width: 6px;
            height: 6px;
            background: radial-gradient(circle, #ffd700, #d4af37);
            border-radius: 50%;
            pointer-events: none;
            z-index: 6000;
            box-shadow: 0 0 10px rgba(212, 175, 55, 0.8);
        `;
        
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * 60 + 20;
        particle.style.setProperty('--px', `${Math.cos(angle) * distance}px`);
        particle.style.setProperty('--py', `${Math.sin(angle) * distance}px`);
        particle.style.animation = 'particleBurst 0.5s ease-out forwards';
        
        document.body.appendChild(particle);
        
        setTimeout(() => particle.remove(), 500);
    }
}

function finishDealingAnimation(overlay) {
    console.log('✨ Анимация раздачи завершена');
    
    overlay.style.transition = 'opacity 0.5s ease';
    overlay.style.opacity = '0';
    
    setTimeout(() => {
        if (overlay.parentNode) {
            overlay.remove();
        }
        dealingInProgress = false;
        animationOverlay = null;
        
        // Показываем сообщение
        const statusBar = document.getElementById('statusBar');
        if (statusBar) {
            statusBar.innerHTML = '♠️ КАРТЫ РОЗДАНЫ! ♠️<br><span style="font-size:12px">Игра начинается</span>';
            statusBar.style.background = 'linear-gradient(135deg, rgba(212, 175, 55, 0.95), rgba(184, 134, 11, 0.95))';
            statusBar.style.color = '#1a0f08';
            statusBar.style.borderLeft = '6px solid #ffd700';
            
            setTimeout(() => {
                statusBar.style.background = 'rgba(10, 6, 4, 0.92)';
                statusBar.style.color = '#f5e2b0';
                statusBar.style.borderLeft = '6px solid #d4af37';
            }, 2500);
        }
    }, 500);
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
    if (confirm('Выйти из игры? Вы вернетесь в лобби.')) {
        window.location.href = '/lobby.html';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM загружен, инициализация GameUI (Luxury Casino) с анимацией раздачи');
    initGameUI();
});