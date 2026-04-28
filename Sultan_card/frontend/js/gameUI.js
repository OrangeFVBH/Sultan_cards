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

// ================== ЗАГРУЗОЧНЫЙ ЭКРАН ==================
function showLoadingScreen() {
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'loadingOverlay';
    loadingOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: radial-gradient(ellipse at 30% 20%, #2a1508 0%, #0a0502 100%);
        z-index: 9999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-family: 'Oswald', sans-serif;
    `;
    
    loadingOverlay.innerHTML = `
        <div style="font-size: 60px; margin-bottom: 20px; animation: cardSpin 2s ease-in-out infinite;">🎴</div>
        <div style="color: #d4af37; font-size: 28px; letter-spacing: 3px; margin-bottom: 30px; text-shadow: 0 0 20px rgba(212,175,55,0.5);">SULTAN CASINO</div>
        <div style="width: 250px; height: 4px; background: rgba(212, 175, 55, 0.2); border-radius: 2px; overflow: hidden; box-shadow: 0 0 10px rgba(212,175,55,0.3);">
            <div id="loadingBar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #b8860b, #d4af37, #ffd700); border-radius: 2px; transition: width 0.5s ease;"></div>
        </div>
        <div id="loadingText" style="color: #c9af7b; margin-top: 15px; font-size: 16px; letter-spacing: 1px;">Подключение к серверу...</div>
    `;
    
    // Добавляем стиль анимации
    if (!document.getElementById('loadingStyles')) {
        const style = document.createElement('style');
        style.id = 'loadingStyles';
        style.textContent = `
            @keyframes cardSpin {
                0%, 100% { transform: rotateY(0deg); }
                50% { transform: rotateY(180deg); }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(loadingOverlay);
}

function updateLoadingProgress(percent, text) {
    const loadingBar = document.getElementById('loadingBar');
    const loadingText = document.getElementById('loadingText');
    if (loadingBar) loadingBar.style.width = percent + '%';
    if (loadingText) loadingText.textContent = text;
}

function hideLoadingScreen() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.transition = 'opacity 0.5s ease';
        loadingOverlay.style.opacity = '0';
        setTimeout(() => {
            if (loadingOverlay.parentNode) {
                loadingOverlay.remove();
            }
        }, 500);
    }
}

// Показываем загрузку сразу
showLoadingScreen();
updateLoadingProgress(10, 'Подключение к серверу...');

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
        updateLoadingProgress(100, 'Ошибка: игра не найдена');
        setTimeout(() => {
            window.location.href = '/lobby.html';
        }, 2000);
        return;
    }
    
    playerName = sessionStorage.getItem('playerName');
    console.log('Player name from session:', playerName);
    console.log('LobbyId from URL:', lobbyId);
    
    currentLobbyId = lobbyId;
    sessionStorage.setItem('currentLobbyId', lobbyId);
    
    if (!playerName) {
        console.error('Нет имени игрока!');
        updateLoadingProgress(100, 'Ошибка: игрок не определен');
        setTimeout(() => {
            window.location.href = '/lobby.html';
        }, 2000);
        return;
    }
    
    updateLoadingProgress(20, 'Загрузка модулей...');
    
    if (typeof io === 'undefined') {
        console.error('socket.io не загружен!');
        const script = document.createElement('script');
        script.src = '/socket.io/socket.io.js';
        script.onload = () => {
            console.log('socket.io загружен динамически');
            initGameUI();
        };
        script.onerror = () => {
            updateLoadingProgress(100, 'Ошибка загрузки socket.io');
            setTimeout(() => window.location.href = '/lobby.html', 2000);
        };
        document.head.appendChild(script);
        return;
    }
    
    updateLoadingProgress(30, 'Подключение к игровому серверу...');
    
    window.addEventListener('beforeunload', () => {
        console.log('Страница закрывается');
    });
    
    if (socket && socket.connected) {
        console.log('Сокет уже подключен');
        socket.currentLobby = currentLobbyId;
        socket.currentUsername = playerName;
        updateLoadingProgress(40, 'Восстановление соединения...');
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
        updateLoadingProgress(40, 'Соединение установлено. Ожидание игры...');
        
        requestGameState();
    });
    
    socket.on('gameStarted', (data) => {
        console.log('🎮 Получен сигнал gameStarted, lobbyId:', data.lobbyId);
        currentLobbyId = data.lobbyId;
        sessionStorage.setItem('currentLobbyId', data.lobbyId);
        socket.currentLobby = data.lobbyId;
        updateLoadingProgress(60, 'Игра запущена! Ожидание раздачи...');
    });
    
    socket.on('dealAnimation', (data) => {
        console.log('🎴 Получена команда на анимацию раздачи:', data);
        hideLoadingScreen();
        startDealingAnimation(data);
    });
    
    socket.on('gameState', (state) => {
        console.log('📦 Game state received!', state);
        // Всегда скрываем загрузку при получении gameState
        hideLoadingScreen();
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
        hideLoadingScreen();
        const statusBar = document.getElementById('statusBar');
        if (statusBar) {
            statusBar.innerHTML = `⚠️ ${error}`;
            statusBar.style.background = 'rgba(139, 0, 0, 0.9)';
        }
    });
    
    socket.on('disconnect', (reason) => {
        console.log('🔌 Socket disconnected. Reason:', reason);
        gameReady = false;
        const statusBar = document.getElementById('statusBar');
        if (statusBar) {
            statusBar.innerHTML = '⚠️ Потеря соединения. Переподключение...';
            statusBar.style.background = 'rgba(139, 0, 0, 0.7)';
        }
    });
    
    socket.on('reconnect', (attemptNumber) => {
        console.log('🔄 Переподключение успешно (попытка ' + attemptNumber + ')');
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
    
    function requestGameState() {
        stateRequestCount = 0;
        
        const doRequest = () => {
            if (currentGameState && currentGameState.myHand && currentGameState.myHand.length > 0) {
                console.log('✅ Состояние уже получено');
                return;
            }
            
            if (socket && socket.connected) {
                socket.emit('requestGameState', { 
                    username: playerName, 
                    lobbyId: currentLobbyId 
                });
                stateRequestCount++;
                
                updateLoadingProgress(40 + stateRequestCount * 3, `Поиск игры... (попытка ${stateRequestCount})`);
                
                if (stateRequestCount < 15) {
                    setTimeout(doRequest, 1500);
                } else {
                    updateLoadingProgress(100, 'Игра не найдена');
                    setTimeout(() => {
                        window.location.href = '/lobby.html';
                    }, 2000);
                }
            }
        };
        
        setTimeout(doRequest, 1000);
    }
}

// ================== АНИМАЦИЯ РАЗДАЧИ ==================
function startDealingAnimation(data) {
    if (dealingInProgress) return;
    dealingInProgress = true;
    
    const { players, dealerIndex: dealer } = data;
    dealerIndex = dealer;
    
    console.log('🎴 Запуск анимации раздачи. Дилер:', players[dealerIndex]?.username);
    
    const tableZone = document.getElementById('tableZone');
    const myHandEl = document.getElementById('myHand');
    const playerTop = document.getElementById('playerTop');
    const playerRight = document.getElementById('playerRight');
    
    if (tableZone) tableZone.innerHTML = '';
    if (myHandEl) myHandEl.innerHTML = '';
    
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
            .deal-container { text-align: center; }
            .dealer-info {
                margin-bottom: 30px;
                color: #faf4e0;
                font-family: 'Oswald', sans-serif;
                font-size: 24px;
                letter-spacing: 2px;
                text-shadow: 0 0 20px rgba(212, 175, 55, 0.5);
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
            .deck-wrapper.clickable:hover { transform: scale(1.05); }
            .deck-wrapper.clickable:hover .deck-glow { opacity: 1; }
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
                0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
                80% { opacity: 0.7; }
                100% { transform: translate(var(--fly-x), var(--fly-y)) rotate(var(--fly-rot)) scale(0.7); opacity: 0; }
            }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
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
    
    socket.emit('startDealingAnimation', { lobbyId: currentLobbyId });
    animateCardDistribution(players, dealerIndex, overlay);
}

function animateCardDistribution(players, dealerIndex, overlay) {
    console.log('🃏 Запуск анимации раздачи карт');
    
    const instruction = document.getElementById('dealInstruction');
    if (instruction) {
        instruction.textContent = '🃏 РАЗДАЧА КАРТ...';
        instruction.style.animation = 'none';
        instruction.style.opacity = '0.8';
    }
    
    const positions = {
        top: { x: window.innerWidth / 2, y: 130 },
        right: { x: window.innerWidth - 180, y: window.innerHeight / 2 },
        bottom: { x: window.innerWidth / 2, y: window.innerHeight - 180 }
    };
    
    const playerPositions = {};
    const otherIndices = [0, 1, 2].filter(i => i !== dealerIndex);
    
    playerPositions[dealerIndex] = { ...positions.bottom, name: players[dealerIndex].username };
    
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
                
                if (index % 3 === 0) {
                    setTimeout(() => {
                        createDealParticles(target.x, target.y);
                    }, 400 + index * 5);
                }
            }
        }, index * 20);
    });
    
    setTimeout(() => {
        finishDealingAnimation(overlay);
    }, 36 * 20 + 1500);
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
        
        // Если состояние уже получено - отображаем карты
        if (currentGameState && currentGameState.myHand && currentGameState.myHand.length > 0) {
            console.log('Отображаем карты после анимации');
            updateGameStateDisplay(currentGameState);
        }
    }, 500);
}

// ================== ОТОБРАЖЕНИЕ ИГРЫ ==================
function updateGameState(state) {
    if (!state) return;
    
    // Скрываем загрузку
    hideLoadingScreen();
    
    // Сохраняем состояние
    currentGameState = state;
    
    // Если анимация раздачи еще идет - не показываем карты
    if (dealingInProgress) {
        console.log('Анимация раздачи еще идет, карты скрыты');
        if (state.players) {
            renderPlayersInfo(state.players, state.currentAttacker, state.currentDefender);
        }
        renderStatus(state);
        return;
    }
    
    // Отображаем карты
    updateGameStateDisplay(state);
}

function updateGameStateDisplay(state) {
    console.log('🎴 Отображение карт игрока, isMyTurnAttack:', state.isMyTurnAttack);
    console.log('   isMyAdditionalAttackTurn:', state.isMyAdditionalAttackTurn);
    console.log('   isMyTurnDefend:', state.isMyTurnDefend);
    
    // Обновляем глобальные переменные
    isMyAttackTurn = state.isMyTurnAttack;
    isMyDefendTurn = state.isMyTurnDefend;
    isMyAdditionalAttackTurn = state.isMyAdditionalAttackTurn || false;
    myHand = state.myHand || [];
    tableCards = state.table || [];
    
    window.gameWinner = state.gameWinner;
    
    // Обновляем UI
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
    
    // Режим дополнительной атаки (третий игрок подкидывает)
    if (state.isMyAdditionalAttackTurn) {
        statusHtml = '➕ ВЫ ПОДКИДЫВАЕТЕ КАРТЫ ➕<br><span style="font-size:12px">Нажмите на карту, чтобы подкинуть</span>';
        statusBar.style.background = 'rgba(106, 27, 154, 0.92)';
        statusBar.style.borderLeft = '6px solid #d4af37';
    } 
    // Обычная атака
    else if (state.isMyTurnAttack) {
        statusHtml = '🔥 ВЫ АТАКУЕТЕ 🔥<br><span style="font-size:12px">Нажмите на карту, чтобы сходить</span>';
        statusBar.style.background = 'rgba(198, 76, 0, 0.92)';
        statusBar.style.borderLeft = '6px solid #d4af37';
    } 
    // Защита
    else if (state.isMyTurnDefend) {
        statusHtml = '🛡️ ВЫ ОТБИВАЕТЕСЬ 🛡️<br><span style="font-size:12px">Нажмите на карту, чтобы побить</span>';
        statusBar.style.background = 'rgba(33, 99, 33, 0.92)';
        statusBar.style.borderLeft = '6px solid #d4af37';
    } 
    // Наблюдение
    else {
        let additionalInfo = '';
        if (state.additionalAttacker) {
            additionalInfo = ` | ✨ Подкидывает: ${state.additionalAttacker}`;
        }
        statusHtml = `🎴 Ходит: ${state.currentAttacker || '—'} → отбивается: ${state.currentDefender || '—'}${additionalInfo}<br><span style="font-size:12px">♢ КОЗЫРЬ: БУБНЫ</span>`;
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
    
    // Переупорядочиваем игроков относительно текущего пользователя
    const reordered = reorderPlayersForMe(players, playerName);
    
    // visualPosition:
    // 0 - я (не отображаем здесь)
    // 1 - следующий по ЧАСОВОЙ - должен быть СВЕРХУ
    // 2 - следующий по ЧАСОВОЙ - должен быть СПРАВА
    
    const playerOnTop = reordered.find(p => p.visualPosition === 1);
    const playerOnRight = reordered.find(p => p.visualPosition === 2);
    
    // Отображаем игрока сверху (первый по ходу ПО ЧАСОВОЙ)
    if (playerOnTop) {
        let roleHtml = '';
        let winnerClass = '';
        if (playerOnTop.username === attacker) roleHtml = '<div class="role-badge attacker">⚔️ АТАКУЕТ</div>';
        if (playerOnTop.username === defender) roleHtml = '<div class="role-badge defender">🛡️ ОТБИВАЕТСЯ</div>';
        if (playerOnTop.cardCount === 0) winnerClass = 'player-winner';
        
        playerTop.innerHTML = `
            <div class="badge-info">
                <div class="player-name ${winnerClass}">${escapeHtml(playerOnTop.username)}</div>
                <div class="player-cards">🎴 ${playerOnTop.cardCount} карт</div>
                ${roleHtml}
            </div>
        `;
    }
    
    // Отображаем игрока справа (второй по ходу ПО ЧАСОВОЙ)
    if (playerOnRight) {
        let roleHtml = '';
        let winnerClass = '';
        if (playerOnRight.username === attacker) roleHtml = '<div class="role-badge attacker">⚔️ АТАКУЕТ</div>';
        if (playerOnRight.username === defender) roleHtml = '<div class="role-badge defender">🛡️ ОТБИВАЕТСЯ</div>';
        if (playerOnRight.cardCount === 0) winnerClass = 'player-winner';
        
        playerRight.innerHTML = `
            <div class="badge-info">
                <div class="player-name ${winnerClass}">${escapeHtml(playerOnRight.username)}</div>
                <div class="player-cards">🎴 ${playerOnRight.cardCount} карт</div>
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
    
    // Определяем, какие кнопки нужны
    let showEndTurn = false;        // Завершить ход (для атакующего, когда все отбито И нет режима доп. атаки)
    let showEndAdditional = false;   // Завершить подкид (для третьего игрока)
    let showTakeCards = false;       // Забрать карты (для защитника, если не может отбить)
    
    // Атакующий может завершить ход ТОЛЬКО если:
    // 1. Это его ход (isMyTurnAttack = true)
    // 2. Нет активной дополнительной атаки (isMyAdditionalAttackTurn = false)
    // 3. На столе есть карты
    // 4. Все карты отбиты
    if (state.isMyTurnAttack && !state.isMyAdditionalAttackTurn && table.length > 0 && allDefended) {
        showEndTurn = true;
    }
    
    // Дополнительная атака (третий игрок подкидывает)
    if (state.isMyAdditionalAttackTurn) {
        showEndAdditional = true;
    }
    
    // Защитник может забрать карты, если есть неотбитые
    if (state.isMyTurnDefend && hasUndefended) {
        showTakeCards = true;
    }
    
    // Если нет ни одной кнопки - скрываем панель
    if (!showEndTurn && !showEndAdditional && !showTakeCards) {
        if (buttonsDiv) {
            buttonsDiv.style.display = 'none';
        }
        return;
    }
    
    // Создаем контейнер для кнопок если его нет
    if (!buttonsDiv) {
        buttonsDiv = document.createElement('div');
        buttonsDiv.id = 'actionButtons';
        buttonsDiv.className = 'action-buttons';
        document.body.appendChild(buttonsDiv);
    }
    
    buttonsDiv.style.display = 'flex';
    buttonsDiv.innerHTML = '';
    
    // Кнопка "Завершить ход" (для атакующего)
    if (showEndTurn) {
        const endBtn = document.createElement('button');
        endBtn.className = 'action-btn';
        endBtn.textContent = '✅ ЗАВЕРШИТЬ ХОД';
        endBtn.style.background = 'linear-gradient(135deg, #b56a1a, #7a3e0a)';
        endBtn.onclick = function() {
            console.log('Нажата кнопка Завершить ход');
            if (socket && socket.connected) {
                // Блокируем кнопку и скрываем её сразу
                endBtn.disabled = true;
                endBtn.style.display = 'none';
                
                socket.emit('endTurn', {}, function(result) {
                    console.log('Результат endTurn:', result);
                    if (result && !result.success) {
                        alert(result.error || 'Ошибка');
                        // Если ошибка - возвращаем кнопку
                        endBtn.disabled = false;
                        endBtn.style.display = 'block';
                    }
                    // При успехе кнопка исчезнет навсегда (из-за обновления состояния)
                });
            }
        };
        buttonsDiv.appendChild(endBtn);
    }
    
    // Кнопка "Завершить подкид" (для третьего игрока)
    if (showEndAdditional) {
        const endAddBtn = document.createElement('button');
        endAddBtn.className = 'action-btn';
        endAddBtn.textContent = '✅ ЗАВЕРШИТЬ ПОДКИД';
        endAddBtn.style.background = 'linear-gradient(135deg, #6a1b9a, #3e0a5a)';
        endAddBtn.onclick = function() {
            console.log('Нажата кнопка Завершить подкид');
            if (socket && socket.connected) {
                endAddBtn.disabled = true;
                endAddBtn.style.display = 'none';
                
                socket.emit('endAdditionalAttack', {}, function(result) {
                    console.log('Результат endAdditionalAttack:', result);
                    if (result && !result.success) {
                        alert(result.error || 'Ошибка');
                        endAddBtn.disabled = false;
                        endAddBtn.style.display = 'block';
                    }
                });
            }
        };
        buttonsDiv.appendChild(endAddBtn);
    }
    
    // Кнопка "Забрать карты"
    if (showTakeCards) {
        const takeBtn = document.createElement('button');
        takeBtn.className = 'action-btn';
        takeBtn.textContent = '📥 ЗАБРАТЬ КАРТЫ';
        takeBtn.style.background = 'linear-gradient(135deg, #8b0000, #5c0000)';
        takeBtn.onclick = function() {
            console.log('Нажата кнопка Забрать карты');
            if (socket && socket.connected) {
                takeBtn.disabled = true;
                takeBtn.style.display = 'none';
                
                socket.emit('takeCards', {}, function(result) {
                    if (result && !result.success) {
                        alert(result.error || 'Ошибка');
                        takeBtn.disabled = false;
                        takeBtn.style.display = 'block';
                    }
                });
            }
        };
        buttonsDiv.appendChild(takeBtn);
    }
}

function reorderPlayersForMe(players, myUsername) {
    // Находим индекс текущего игрока
    const myIndex = players.findIndex(p => p.username === myUsername);
    if (myIndex === -1) return players;
    
    const totalPlayers = players.length;
    const reordered = [];
       
    for (let i = 0; i < totalPlayers; i++) {
        const idx = (myIndex + i) % totalPlayers;
        reordered.push({
            ...players[idx],
            visualPosition: i  // 0 = я (снизу), 1 = следующий (сверху), 2 = следующий (справа)
        });
    }
    
    return reordered;
}

function exitGame() {
    if (confirm('Выйти из игры? Вы вернетесь в лобби.')) {
        window.location.href = '/lobby.html';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM загружен, инициализация GameUI (Luxury Casino)');
    initGameUI();
});