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
let winTarget = 3;
let currentCardsPerPlayer = 0;

// Переменные для drag & drop
let draggedCardIndex = null;
let draggedElement = null;
let wasDragged = false;
let touchStartY = 0;
let touchStartX = 0;
let touchCardIndex = null;
let touchElement = null;
let touchClone = null;
let touchMoved = false;

// Блокировка действий
let isActionInProgress = false;
let actionTimeout = null;

// Турнирные очки
let tournamentScores = {};

// Функция для обновления положения кнопок в зависимости от количества карт
function updateButtonsPositionByCardCount() {
    const hand = document.getElementById('myHand');
    if (!hand) return;
    
    const cardCount = hand.children.length;
    const statusBar = document.getElementById('statusBar');
    const actionButtons = document.querySelector('.action-buttons');
    
    // 8 карт и меньше -> cards-few (ВНИЗ)
    // 9 карт и больше -> cards-many (НА УРОВНЕ 11-12)
    if (statusBar) {
        statusBar.classList.remove('cards-few', 'cards-many');
        if (cardCount <= 8) {
            statusBar.classList.add('cards-few');   // ВНИЗ
        } else {
            statusBar.classList.add('cards-many');  // НА УРОВНЕ 11-12
        }
    }
    
    if (actionButtons) {
        actionButtons.classList.remove('cards-few', 'cards-many');
        if (cardCount <= 8) {
            actionButtons.classList.add('cards-few');   // ВНИЗ
        } else {
            actionButtons.classList.add('cards-many');  // НА УРОВНЕ 11-12
        }
    }
    
    console.log(`📊 Обновлено положение: ${cardCount} карт - ${cardCount <= 8 ? 'ВНИЗ (cards-few)' : 'НА УРОВНЕ 11-12 (cards-many)'}`);
}

// =========================================================================
// АВТОМАТИЧЕСКИЙ СЛЕДИТЕЛЬ (MutationObserver)
// =========================================================================
(function() {
    const observer = new MutationObserver((mutations) => {
        let shouldUpdate = false;
        for (let mutation of mutations) {
            if (mutation.type === 'childList') {
                shouldUpdate = true;
                break;
            }
        }
        if (shouldUpdate) {
            updateButtonsPositionByCardCount();
        }
    });

    function startObserving() {
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        updateButtonsPositionByCardCount();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserving);
    } else {
        startObserving();
    }
})();

// Определяем количество игроков и добавляем класс для режима троих
function updatePlayerCountClass() {
    if (currentGameState && currentGameState.players) {
        const playerCount = currentGameState.players.length;
        if (playerCount === 3) {
            document.body.classList.add('players-3');
        } else {
            document.body.classList.remove('players-3');
        }
    }
}

// Добавляем стили для анимаций
(function addGameStyles() {
    const gameStyles = document.createElement('style');
    gameStyles.id = 'gameUIStyles';
    gameStyles.textContent = `
        @keyframes dropPulse {
            0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
        }
        
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
            20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        
        @keyframes flashPulse {
            0% {
                transform: translate(-50%, -50%) scale(0.5);
                opacity: 0.8;
            }
            100% {
                transform: translate(-50%, -50%) scale(1.5);
                opacity: 0;
            }
        }
        
        @keyframes cardArrive {
            0% {
                transform: scale(0.8);
                opacity: 0;
            }
            80% {
                transform: scale(1.05);
            }
            100% {
                transform: scale(1);
                opacity: 1;
            }
        }
        
        @keyframes cardPlaceholderGlow {
            0%, 100% {
                border-color: #d4af37;
                color: #d4af37;
                background: rgba(80, 80, 80, 0.5);
                text-shadow: none;
                filter: drop-shadow(0 0 0 rgba(212, 175, 55, 0));
            }
            50% {
                border-color: #ffd700;
                color: #ffd700;
                background: rgba(80, 80, 80, 0.5);
                text-shadow: 0 0 20px rgba(255, 215, 0, 0.9);
                filter: drop-shadow(0 0 12px rgba(212, 175, 55, 0.8));
            }
        }
        
        .card-placeholder {
            animation: cardPlaceholderGlow 1.2s ease-in-out;
        }
        
        .drop-active {
            box-shadow: 0 0 40px rgba(212, 175, 55, 0.8) !important;
            transition: box-shadow 0.3s ease;
        }
        
        .card[draggable="true"] {
            cursor: grab;
        }
        
        .card[draggable="true"]:active {
            cursor: grabbing;
        }
        
        .card.dragging {
            opacity: 0.5;
            transform: scale(0.95);
        }
        
        .flying-card, .flying-card-to-table {
            will-change: transform;
            filter: drop-shadow(0 8px 20px rgba(0, 0, 0, 0.5));
        }
        
        .flying-card .card, .flying-card-to-table .card {
            width: 100%;
            height: 100%;
            margin: 0;
        }
        
        @keyframes cardFlip {
            0% { transform: rotateY(0deg); }
            100% { transform: rotateY(180deg); }
        }
        
        .card-arrive {
            animation: cardArrive 0.25s ease-out;
        }
        
        .card-back {
            width: 100%;
            height: 100%;
            border-radius: 10px;
            overflow: hidden;
            background: linear-gradient(135deg, #1a237e 0%, #0d47a1 50%, #1565c0 100%);
            border: 2px solid #d4af37;
            box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.3);
            position: relative;
        }
        
        .card-back-img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .card-back-fallback {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 48px;
            color: rgba(212, 175, 55, 0.7);
            background: linear-gradient(135deg, #1a237e 0%, #0d47a1 50%, #1565c0 100%);
        }
        
        @keyframes screenShake {
            0% { transform: translate(0, 0); }
            10% { transform: translate(-8px, -6px); }
            20% { transform: translate(6px, 8px); }
            30% { transform: translate(-5px, 4px); }
            40% { transform: translate(4px, -5px); }
            50% { transform: translate(-3px, 3px); }
            60% { transform: translate(2px, -2px); }
            70% { transform: translate(-2px, 1px); }
            80% { transform: translate(1px, -1px); }
            90% { transform: translate(0, 0); }
            100% { transform: translate(0, 0); }
        }
        
        .screen-shake {
            animation: screenShake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
        }
        
        .spark-particle {
            position: fixed;
            pointer-events: none;
            z-index: 10080;
            will-change: transform, opacity;
        }
        
        @keyframes flashFade {
            0% {
                transform: scale(0.5);
                opacity: 0.8;
            }
            100% {
                transform: scale(1.5);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(gameStyles);
})();

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
        <div style="color: #d4af37; font-size: 28px; letter-spacing: 3px; margin-bottom: 30px; text-shadow: 0 0 20px rgba(212,175,55,0.5);">SULTAN</div>
        <div style="width: 250px; height: 4px; background: rgba(212, 175, 55, 0.2); border-radius: 2px; overflow: hidden; box-shadow: 0 0 10px rgba(212,175,55,0.3);">
            <div id="loadingBar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #b8860b, #d4af37, #ffd700); border-radius: 2px; transition: width 0.5s ease;"></div>
        </div>
        <div id="loadingText" style="color: #c9af7b; margin-top: 15px; font-size: 16px; letter-spacing: 1px;">Подключение к серверу...</div>
    `;
    
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

// ================== ФУНКЦИЯ ОБНОВЛЕНИЯ СТАТУС-БАРА ==================
function forceUpdateStatusBar() {
    if (!currentGameState) return;
    
    const statusBar = document.getElementById('statusBar');
    if (!statusBar) return;
    
    if (statusBar.hasAttribute('data-temp-message')) return;
    
    if (currentGameState.gameWinner) {
        if (currentGameState.gameWinner.includes(playerName)) {
            statusBar.innerHTML = `🏆 ВЫ ПОБЕДИТЕЛЬ! 🏆`;
        } else {
            statusBar.innerHTML = `🏆 ПОБЕДИТЕЛЬ: ${currentGameState.gameWinner} 🏆`;
        }
        statusBar.style.background = 'linear-gradient(135deg, #d4af37, #b8860b)';
        statusBar.style.color = '#1a0f08';
        statusBar.style.borderLeft = '6px solid #ffd700';
        statusBar.style.fontWeight = 'bold';
        return;
    }
    
    let roleText = '';
    let roleColor = '';
    let roleBg = '';
    
    if (currentGameState.isMyTurnAttack) {
        roleText = '⚔️ ВЫ АТАКУЕТЕ ⚔️';
        roleColor = '#ffffff';
        roleBg = 'rgba(220, 53, 69, 0.92)';
        statusBar.style.borderLeft = '6px solid #dc3545';
    } 
    else if (currentGameState.isMyTurnDefend) {
        roleText = '🛡️ ВЫ ОТБИВАЕТЕСЬ 🛡️';
        roleColor = '#ffffff';
        roleBg = 'rgba(40, 167, 69, 0.92)';
        statusBar.style.borderLeft = '6px solid #28a745';
    }
    else if (currentGameState.isMyAdditionalAttackTurn) {
        roleText = '➕ ВЫ ПОДКИДЫВАЕТЕ ➕';
        roleColor = '#1a0f08';
        roleBg = 'rgba(255, 193, 7, 0.92)';
        statusBar.style.borderLeft = '6px solid #ffc107';
    }
    else {
        roleText = '👀 ВЫ НАБЛЮДАЕТЕ 👀';
        roleColor = '#f5e2b0';
        roleBg = 'rgba(10, 6, 4, 0.92)';
        statusBar.style.borderLeft = '6px solid #d4af37';
        statusBar.style.fontWeight = 'normal';
    }
    
    statusBar.innerHTML = roleText;
    statusBar.style.background = roleBg;
    statusBar.style.color = roleColor;
    statusBar.style.fontWeight = 'bold';
}

// ================== АНИМАЦИЯ ВЗЯТИЯ КАРТ ==================
function animateTakeCards(tableCardsArray, targetPlayerName) {
    console.log('🎬 Запуск анимации взятия карт для', targetPlayerName);
    
    const tableZone = document.getElementById('tableZone');
    if (!tableZone) return;
    
    const cardPairs = tableZone.querySelectorAll('.card-pair');
    if (cardPairs.length === 0) return;
    
    let targetPosition = null;
    const isCurrentUser = targetPlayerName === playerName;
    
    if (isCurrentUser) {
        const myHandArea = document.getElementById('myHand');
        if (myHandArea) {
            const rect = myHandArea.getBoundingClientRect();
            targetPosition = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };
        } else {
            targetPosition = { x: window.innerWidth / 2, y: window.innerHeight - 100 };
        }
    } else {
        let playerElement = null;
        const players = document.querySelectorAll('.player-badge');
        for (let player of players) {
            const nameElement = player.querySelector('.player-name');
            if (nameElement && nameElement.textContent === targetPlayerName) {
                playerElement = player;
                break;
            }
        }
        
        if (playerElement) {
            const rect = playerElement.getBoundingClientRect();
            targetPosition = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };
        } else {
            targetPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        }
    }
    
    const allCards = [];
    cardPairs.forEach(pair => {
        const cards = pair.querySelectorAll('.card');
        cards.forEach(card => {
            allCards.push(card);
        });
    });
    
    if (allCards.length === 0) return;
    
    const takeOverlay = document.createElement('div');
    takeOverlay.id = 'takeAnimationOverlay';
    takeOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 10000;
    `;
    document.body.appendChild(takeOverlay);
    
    allCards.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        
        const flyingCard = document.createElement('div');
        flyingCard.className = 'flying-card';
        
        const cardBackDiv = document.createElement('div');
        cardBackDiv.className = 'card-back';
        cardBackDiv.style.cssText = `
            width: 100%;
            height: 100%;
            border-radius: 10px;
            overflow: hidden;
            position: relative;
        `;
        
        const backImg = document.createElement('img');
        backImg.src = '/back.png';
        backImg.alt = 'Рубашка';
        backImg.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: cover;
        `;
        backImg.onerror = () => {
            backImg.style.display = 'none';
            const fallback = document.createElement('div');
            fallback.className = 'card-back-fallback';
            fallback.style.cssText = `
                width: 100%;
                height: 100%;
                background: linear-gradient(135deg, #1a237e 0%, #0d47a1 50%, #1565c0 100%);
                border-radius: 10px;
                border: 2px solid #d4af37;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 48px;
                color: rgba(212, 175, 55, 0.7);
            `;
            fallback.textContent = '🂠';
            cardBackDiv.appendChild(fallback);
        };
        cardBackDiv.appendChild(backImg);
        
        flyingCard.style.cssText = `
            position: fixed;
            left: ${rect.left}px;
            top: ${rect.top}px;
            width: ${rect.width}px;
            height: ${rect.height}px;
            z-index: ${10000 + index};
            transition: all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            transform-origin: center center;
            filter: drop-shadow(0 8px 20px rgba(0, 0, 0, 0.4));
        `;
        
        flyingCard.appendChild(cardBackDiv);
        takeOverlay.appendChild(flyingCard);
        
        card.style.opacity = '0';
        card.style.visibility = 'hidden';
        
        setTimeout(() => {
            const deltaX = targetPosition.x - rect.left - rect.width / 2;
            const deltaY = targetPosition.y - rect.top - rect.height / 2;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            const duration = Math.min(500, Math.max(300, distance / 2.5));
            const randomRotate = Math.random() * 60 - 30;
            
            flyingCard.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.9, 0.4, 1.1), opacity ${duration}ms ease`;
            flyingCard.style.transform = `translate(${deltaX}px, ${deltaY}px) rotate(${randomRotate}deg) scale(0.4)`;
            flyingCard.style.opacity = '0';
            
            createFlyParticles(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }, index * 60);
    });
    
    const maxDelay = allCards.length * 60 + 800;
    setTimeout(() => {
        if (takeOverlay && takeOverlay.parentNode) {
            takeOverlay.remove();
        }
        cardPairs.forEach(pair => {
            const cards = pair.querySelectorAll('.card');
            cards.forEach(card => {
                card.style.opacity = '';
                card.style.visibility = '';
            });
        });
    }, maxDelay);
}

function createFlyParticles(x, y) {
    for (let i = 0; i < 10; i++) {
        const particle = document.createElement('div');
        particle.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            width: 5px;
            height: 5px;
            background: radial-gradient(circle, #ffd700, #d4af37);
            border-radius: 50%;
            pointer-events: none;
            z-index: 10001;
            box-shadow: 0 0 8px rgba(212, 175, 55, 0.8);
        `;
        
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * 60 + 15;
        const duration = 0.5 + Math.random() * 0.3;
        
        particle.style.transition = `transform ${duration}s ease-out, opacity ${duration}s ease-out`;
        
        document.body.appendChild(particle);
        
        setTimeout(() => {
            particle.style.transform = `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px)`;
            particle.style.opacity = '0';
        }, 10);
        
        setTimeout(() => {
            if (particle.parentNode) particle.remove();
        }, duration * 1000);
    }
}

// ================== АНИМАЦИЯ ВЫСТАВЛЕНИЯ КАРТЫ ==================
function animateCardToTableFromData(cardRect, cardClone, onComplete) {
    const tableZone = document.getElementById('tableZone');
    let targetX, targetY;
    
    if (tableZone) {
        const tableRect = tableZone.getBoundingClientRect();
        targetX = tableRect.left + tableRect.width / 2;
        targetY = tableRect.top + tableRect.height / 2;
    } else {
        targetX = window.innerWidth / 2;
        targetY = window.innerHeight / 2;
    }
    
    const flyingCard = document.createElement('div');
    flyingCard.className = 'flying-card-to-table';
    
    cardClone.style.width = '100%';
    cardClone.style.height = '100%';
    cardClone.style.margin = '0';
    
    flyingCard.style.cssText = `
        position: fixed;
        left: ${cardRect.left}px;
        top: ${cardRect.top}px;
        width: ${cardRect.width}px;
        height: ${cardRect.height}px;
        z-index: 10060;
        transition: all 0.4s cubic-bezier(0.2, 0.9, 0.4, 1.1);
        transform-origin: center center;
        filter: drop-shadow(0 8px 20px rgba(0, 0, 0, 0.5));
        opacity: 1;
    `;
    
    flyingCard.appendChild(cardClone);
    document.body.appendChild(flyingCard);
    
    const deltaX = targetX - cardRect.left - cardRect.width / 2;
    const deltaY = targetY - cardRect.top - cardRect.height / 2;
    const randomRotate = (Math.random() - 0.5) * 20;
    
    setTimeout(() => {
        flyingCard.style.transform = `translate(${deltaX}px, ${deltaY}px) rotate(${randomRotate}deg) scale(0.9)`;
        createEnhancedTrailEffect(cardRect.left + cardRect.width / 2, cardRect.top + cardRect.height / 2, targetX, targetY);
    }, 20);
    
    setTimeout(() => {
        if (flyingCard && flyingCard.parentNode) {
            flyingCard.remove();
        }
        if (onComplete) onComplete();
    }, 450);
}

function createEnhancedTrailEffect(startX, startY, endX, endY) {
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = startX + (endX - startX) * t;
        const y = startY + (endY - startY) * t;
        
        setTimeout(() => {
            const trail = document.createElement('div');
            const size = 6 + (1 - t) * 6;
            trail.style.cssText = `
                position: fixed;
                left: ${x}px;
                top: ${y}px;
                width: ${size}px;
                height: ${size}px;
                background: radial-gradient(circle, #ffd700, #d4af37);
                border-radius: 50%;
                pointer-events: none;
                z-index: 10055;
                opacity: ${0.7 - t * 0.5};
                transform: translate(-50%, -50%);
                filter: blur(${2 - t * 1.5}px);
                box-shadow: 0 0 ${8 * (1 - t)}px rgba(212, 175, 55, 0.8);
                transition: opacity 0.2s ease;
            `;
            document.body.appendChild(trail);
            
            setTimeout(() => {
                trail.style.opacity = '0';
                setTimeout(() => trail.remove(), 200);
            }, 100);
        }, i * 25);
    }
    
    setTimeout(() => {
        const flash = document.createElement('div');
        flash.style.cssText = `
            position: fixed;
            left: ${endX}px;
            top: ${endY}px;
            width: 70px;
            height: 70px;
            background: radial-gradient(circle, rgba(212, 175, 55, 0.8), rgba(212, 175, 55, 0.2), transparent);
            border-radius: 50%;
            pointer-events: none;
            z-index: 10054;
            transform: translate(-50%, -50%);
            animation: flashPulse 0.3s ease-out forwards;
        `;
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 300);
    }, 420);
}

// ================== АНИМАЦИЯ КАРТЫ ДРУГОГО ИГРОКА ==================
function animateCardFromPlayerToTable(data) {
    let playerRect = null;
    
    const players = document.querySelectorAll('.player-badge');
    for (let player of players) {
        const nameElement = player.querySelector('.player-name');
        if (nameElement && nameElement.textContent === data.playerUsername) {
            playerRect = player.getBoundingClientRect();
            break;
        }
    }
    
    if (!playerRect) {
        console.log('⚠️ Не найдена позиция игрока:', data.playerUsername);
        return;
    }
    
    const tableZone = document.getElementById('tableZone');
    let endX, endY;
    if (tableZone) {
        const tableRect = tableZone.getBoundingClientRect();
        endX = tableRect.left + tableRect.width / 2;
        endY = tableRect.top + tableRect.height / 2;
    } else {
        endX = window.innerWidth / 2;
        endY = window.innerHeight / 2;
    }
    
    const flyingCard = document.createElement('div');
    flyingCard.className = 'flying-card-to-table';
    
    const cardDiv = document.createElement('div');
    cardDiv.className = 'card';
    cardDiv.innerHTML = `
        <div class="card-back">
            <img src="/back.png" alt="Рубашка" class="card-back-img" onerror="this.style.display='none'; this.parentElement.classList.add('card-back-fallback');">
            <div class="card-back-fallback-content">🂠</div>
        </div>
    `;
    cardDiv.style.cssText = 'width:100%; height:100%; margin:0;';
    flyingCard.appendChild(cardDiv);
    
    const startX = playerRect.left + playerRect.width / 2 - 40;
    const startY = playerRect.top + playerRect.height / 2 - 60;
    
    flyingCard.style.cssText = `
        position: fixed;
        left: ${startX}px;
        top: ${startY}px;
        width: 80px;
        height: 120px;
        z-index: 10060;
        transition: all 0.4s cubic-bezier(0.2, 0.9, 0.4, 1.1);
        transform-origin: center center;
        filter: drop-shadow(0 8px 20px rgba(0, 0, 0, 0.5));
        opacity: 1;
    `;
    
    document.body.appendChild(flyingCard);
    
    const deltaX = endX - startX - 40;
    const deltaY = endY - startY - 60;
    const randomRotate = (Math.random() - 0.5) * 20;
    
    setTimeout(() => {
        flyingCard.style.transform = `translate(${deltaX}px, ${deltaY}px) rotate(${randomRotate}deg) scale(0.9)`;
        createEnhancedTrailEffect(startX + 40, startY + 60, endX, endY);
    }, 20);
    
    setTimeout(() => {
        if (flyingCard && flyingCard.parentNode) {
            flyingCard.remove();
        }
    }, 450);
}

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
        
        socket.emit('reconnectToGame', {
            username: playerName,
            lobbyId: currentLobbyId
        });
        
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
        
        if (typeof window.initGameChat === 'function') {
            console.log('🎮 Инициализация игрового чата для', playerName);
            window.initGameChat(socket, playerName);
        } else {
            console.error('❌ window.initGameChat не найдена!');
        }
        
        console.log('🔄 Отправка запроса на переподключение к игре...');
        socket.emit('reconnectToGame', {
            username: playerName,
            lobbyId: currentLobbyId
        });
        
        requestGameState();
    });

    // ========== НАЧИСЛЕНИЕ 100 КРАНОВ ТОЛЬКО ДЛЯ 2 ИГРОКОВ ==========
    socket.on('roundOver', (data) => {
        console.log('🏁 Раунд окончен:', data);
        
        // Начисление 100 кранов ТОЛЬКО для 2 игроков
        const playerCount = currentGameState?.players?.length || 0;
        
        if (playerCount === 2 && data.allWinners && data.allWinners.includes(playerName)) {
            console.log('💰 Победа в режиме 2 игроков! Начисляем +100 кранов');
            
            fetch('/api/auth/add-coins', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    username: playerName, 
                    amount: 100 
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    console.log(`✅ +100 кранов за победу! Новый баланс: ${data.coins}`);
                    showToast('🏆 Победа в режиме 2 игроков! +100 кранов!');
                }
            })
            .catch(err => console.error('❌ Ошибка начисления кранов:', err));
        }
        // ========== КОНЕЦ НАЧИСЛЕНИЯ ==========
        
        const statusBar = document.getElementById('statusBar');
        if (statusBar && !statusBar.hasAttribute('data-temp-message')) {
            if (data.allWinners && data.allWinners.includes(playerName)) {
                if (data.roundWinner === playerName) {
                    statusBar.innerHTML = `🏆 ВЫ ПОБЕДИЛИ В РАУНДЕ! 🏆<br><span style="font-size:12px">+1 очко! Новый раунд начнется через несколько секунд...</span>`;
                } else {
                    statusBar.innerHTML = `✅ ВЫ СБРОСИЛИ ВСЕ КАРТЫ! ✅<br><span style="font-size:12px">+1 очко! Новый раунд начнется через несколько секунд...</span>`;
                }
            } else {
                if (data.loser === playerName) {
                    statusBar.innerHTML = `💀 ВЫ ОСТАЛИСЬ ДУРАКОМ 💀<br><span style="font-size:12px">Новый раунд начнется через несколько секунд...</span>`;
                } else {
                    statusBar.innerHTML = `📊 Раунд завершен. Победитель: ${data.roundWinner}<br><span style="font-size:12px">Новый раунд начнется через несколько секунд...</span>`;
                }
            }
            statusBar.style.background = 'linear-gradient(135deg, #d4af37, #b8860b)';
            statusBar.style.color = '#1a0f08';
            statusBar.style.borderLeft = '6px solid #ffd700';
            statusBar.style.fontWeight = 'bold';
            statusBar.style.fontSize = '16px';
            statusBar.style.padding = '15px 28px';
        }
        
        // Блокируем карты на время ожидания нового раунда
        const handEl = document.getElementById('myHand');
        if (handEl) {
            const cards = handEl.querySelectorAll('.my-card');
            cards.forEach(card => {
                card.style.pointerEvents = 'none';
                card.style.opacity = '0.5';
                card.draggable = false;
            });
        }
        
        // Скрываем кнопки действий
        const buttonsDiv = document.getElementById('actionButtons');
        if (buttonsDiv) {
            buttonsDiv.style.display = 'none';
        }
    });
    
    socket.on('gameStarted', (data) => {
        console.log('🎮 Получен сигнал gameStarted, lobbyId:', data.lobbyId);
        if (data.winTarget) winTarget = data.winTarget;
        currentLobbyId = data.lobbyId;
        sessionStorage.setItem('currentLobbyId', data.lobbyId);
        socket.currentLobby = data.lobbyId;
        
        if (data.tournamentScores) {
            tournamentScores = data.tournamentScores;
            updateTournamentDisplay();
        }
        
        updateLoadingProgress(60, 'Игра запущена! Ожидание раздачи...');
    });
    
    socket.on('dealAnimation', (data) => {
        console.log('🎴 Получена команда на анимацию раздачи:', data);
        hideLoadingScreen();
        startDealingAnimation(data);
    });
    
    socket.on('gameState', (state) => {
        console.log('📦 Game state received!', state);
        hideLoadingScreen();
        updateGameState(state);
    });
    
    socket.on('tournamentScoresUpdate', (data) => {
        if (data.winTarget) winTarget = data.winTarget;
        console.log('📊 Обновление очков:', data);
        
        tournamentScores = data.scores;
        updateTournamentDisplay();
        
        const statusBar = document.getElementById('statusBar');
        if (statusBar && data.roundWinner && !statusBar.hasAttribute('data-temp-message')) {
            if (data.roundWinner === playerName) {
                statusBar.innerHTML = `🏆 ВЫ ВЫИГРАЛИ РАУНД! 🏆<br><span style="font-size:12px">+1 очко! Ждите новый раунд...</span>`;
            } else if (data.loser === playerName) {
                statusBar.innerHTML = `💀 ВЫ ПРОИГРАЛИ РАУНД 💀<br><span style="font-size:12px">Ждите новый раунд...</span>`;
            } else {
                statusBar.innerHTML = `📊 Раунд выиграл: ${data.roundWinner}<br><span style="font-size:12px">Ждите новый раунд...</span>`;
            }
            statusBar.style.background = 'rgba(212, 175, 55, 0.9)';
            statusBar.style.color = '#1a0f08';
            statusBar.style.borderLeft = '6px solid #ffd700';
        }
    });
    
    socket.on('roundOver', (data) => {
        console.log('🏁 Раунд окончен:', data);
        
        const statusBar = document.getElementById('statusBar');
        if (statusBar && !statusBar.hasAttribute('data-temp-message')) {
            if (data.allWinners && data.allWinners.includes(playerName)) {
                if (data.roundWinner === playerName) {
                    statusBar.innerHTML = `🏆 ВЫ ПОБЕДИЛИ В РАУНДЕ! 🏆<br><span style="font-size:12px">Вы первым сбросили все карты!</span>`;
                } else {
                    statusBar.innerHTML = `✅ ВЫ СБРОСИЛИ ВСЕ КАРТЫ! ✅<br><span style="font-size:12px">Ожидание окончания раунда...</span>`;
                }
            } else {
                if (data.loser === playerName) {
                    statusBar.innerHTML = `💀 ВЫ ОСТАЛИСЬ ДУРАКОМ 💀<br><span style="font-size:12px">У вас остались карты на руках</span>`;
                } else {
                    statusBar.innerHTML = `📊 Раунд завершен. Победитель: ${data.roundWinner}<br><span style="font-size:12px">Ожидание нового раунда...</span>`;
                }
            }
            statusBar.style.background = 'linear-gradient(135deg, #d4af37, #b8860b)';
            statusBar.style.color = '#1a0f08';
            statusBar.style.borderLeft = '6px solid #ffd700';
            statusBar.style.fontWeight = 'bold';
            statusBar.style.fontSize = '16px';
            statusBar.style.padding = '15px 28px';
        }
    });
    
    socket.on('takeCardsAnimation', (data) => {
        console.log('🎬 Получена анимация взятия карт:', data);
        
        const statusBar = document.getElementById('statusBar');
        
        if (statusBar && data.takenBy !== playerName) {
            const tempMessage = `📥 ${data.takenBy} забирает ${data.cardCount} карт со стола!`;
            
            if (!statusBar.hasAttribute('data-temp-message')) {
                statusBar.setAttribute('data-original-html', statusBar.innerHTML);
                statusBar.setAttribute('data-original-bg', statusBar.style.background);
                statusBar.setAttribute('data-temp-message', 'true');
                
                statusBar.innerHTML = tempMessage;
                statusBar.style.background = 'rgba(212, 175, 55, 0.3)';
                
                setTimeout(() => {
                    if (statusBar && statusBar.hasAttribute('data-temp-message')) {
                        const originalHtml = statusBar.getAttribute('data-original-html');
                        const originalBg = statusBar.getAttribute('data-original-bg');
                        
                        if (originalHtml) statusBar.innerHTML = originalHtml;
                        if (originalBg) statusBar.style.background = originalBg;
                        else statusBar.style.background = '';
                        
                        statusBar.removeAttribute('data-temp-message');
                        statusBar.removeAttribute('data-original-html');
                        statusBar.removeAttribute('data-original-bg');
                        
                        forceUpdateStatusBar();
                    }
                }, 2000);
            }
        }
        
        if (currentGameState && currentGameState.table && currentGameState.table.length > 0) {
            animateTakeCards(currentGameState.table, data.takenBy);
        } else {
            const tableZone = document.getElementById('tableZone');
            if (tableZone) {
                const cards = tableZone.querySelectorAll('.card-pair');
                if (cards.length > 0) {
                    animateTakeCards([], data.takenBy);
                }
            }
        }
    });
    
    socket.on('cardAnimation', (data) => {
        console.log('🎬 Получена анимация карты от сервера:', data);
        
        if (data.playerUsername === playerName) {
            console.log('⏩ Пропускаем анимацию для себя (уже обработана локально)');
            return;
        }
        
        animateCardFromPlayerToTable(data);
    });
    
    socket.on('sultanDeclared', (data) => {
        console.log('👑 СУЛТАН ОБЪЯВЛЕН!', data);
        
        const statusBar = document.getElementById('statusBar');
        if (statusBar && !statusBar.hasAttribute('data-temp-message')) {
            if (data.sultan === playerName) {
                statusBar.innerHTML = `👑 ВЫ СТАЛИ СУЛТАНОМ! 👑<br><span style="font-size:14px">Поздравляем с победой!</span>`;
            } else {
                statusBar.innerHTML = `👑 ${data.sultan} СТАЛ СУЛТАНОМ! 👑<br><span style="font-size:14px">Игра окончена</span>`;
            }
            statusBar.style.background = 'linear-gradient(135deg, #ffd700, #ff8c00)';
            statusBar.style.color = '#1a0f08';
            statusBar.style.borderLeft = '6px solid #fff';
            statusBar.style.fontSize = '18px';
            statusBar.style.padding = '20px 30px';
        }
        
        updateTournamentDisplay();
        
        setTimeout(() => {
            window.location.href = '/lobby.html';
        }, 5000);
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
        if (statusBar && !statusBar.hasAttribute('data-temp-message')) {
            statusBar.innerHTML = '⚠️ Потеря соединения. Переподключение...';
            statusBar.style.background = 'rgba(139, 0, 0, 0.7)';
        }
    });
    
    socket.on('reconnect', (attemptNumber) => {
        console.log('🔄 Переподключение успешно (попытка ' + attemptNumber + ')');
        gameReady = true;
        
        const statusBar = document.getElementById('statusBar');
        if (statusBar && !statusBar.hasAttribute('data-temp-message')) {
            statusBar.innerHTML = '✅ Соединение восстановлено!';
            statusBar.style.background = 'rgba(10, 6, 4, 0.92)';
        }
        
        socket.currentLobby = currentLobbyId;
        socket.currentUsername = playerName;
        
        socket.emit('reconnectToGame', {
            username: playerName,
            lobbyId: currentLobbyId
        });
        
        requestGameState();
    });

    socket.on('consecutiveUpdate', (consecutiveInfo) => {
        console.log('🔥 Обновление информации о сериях побед:', consecutiveInfo);
        window.consecutiveInfo = consecutiveInfo;
        updateTournamentDisplay();
    });

    socket.on('allCardsDefeated', (data) => {
        console.log('✨ Получена команда на анимацию отбивания всех карт! Карт:', data.cardCount);
        
        const statusBar = document.getElementById('statusBar');
        if (statusBar && !statusBar.hasAttribute('data-temp-message')) {
            const originalHtml = statusBar.innerHTML;
            statusBar.innerHTML = '✨ КАРТЫ ОТБИТЫ! ✨';
            statusBar.style.background = 'rgba(212, 175, 55, 0.9)';
            statusBar.style.color = '#1a0f08';
            
            setTimeout(() => {
                statusBar.innerHTML = originalHtml;
                statusBar.style.background = '';
            }, 1200);
        }
        
        if (typeof window.animateAllCardsDefeated === 'function') {
            window.animateAllCardsDefeated();
        }
    });

    socket.on('queenDefeated', (data) => {
        console.log('👑 ДАМА ЗАВЕРШИЛА ХОД! Спецэффект!', data);
        
        const tableZone = document.getElementById('tableZone');
        if (tableZone) {
            const rect = tableZone.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            for (let i = 0; i < 30; i++) {
                const particle = document.createElement('div');
                particle.style.cssText = `
                    position: fixed;
                    left: ${centerX + (Math.random() - 0.5) * 100}px;
                    top: ${centerY + (Math.random() - 0.5) * 100}px;
                    width: 8px;
                    height: 8px;
                    background: radial-gradient(circle, #c8a2c8, #9370db, #8b008b);
                    border-radius: 50%;
                    pointer-events: none;
                    z-index: 10080;
                    transition: all 0.6s ease-out;
                    opacity: 1;
                `;
                document.body.appendChild(particle);
                
                const angle = Math.random() * Math.PI * 2;
                const distance = 40 + Math.random() * 120;
                const dx = Math.cos(angle) * distance;
                const dy = Math.sin(angle) * distance;
                
                requestAnimationFrame(() => {
                    particle.style.transform = `translate(${dx}px, ${dy}px)`;
                    particle.style.opacity = '0';
                });
                
                setTimeout(() => {
                    if (particle.parentNode) particle.remove();
                }, 800);
            }
        }
        
        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer) {
            gameContainer.classList.add('screen-shake');
            setTimeout(() => {
                gameContainer.classList.remove('screen-shake');
            }, 300);
        }
        
        const statusBar = document.getElementById('statusBar');
        if (statusBar && !statusBar.hasAttribute('data-temp-message')) {
            const originalHtml = statusBar.innerHTML;
            statusBar.innerHTML = '👑 ДАМА ЗАВЕРШИЛА ХОД! 👑';
            statusBar.style.background = 'rgba(156, 39, 176, 0.8)';
            statusBar.style.color = '#fff';
            
            setTimeout(() => {
                statusBar.innerHTML = originalHtml;
                statusBar.style.background = '';
            }, 1500);
        }
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
                    updateLoadingProgress(100, 'Игра не найдена. Возврат в лобби...');
                    
                    socket.emit('reconnectToLobby', {
                        username: playerName,
                        lobbyId: currentLobbyId
                    });
                    
                    setTimeout(() => {
                        window.location.href = '/lobby.html';
                    }, 2000);
                }
            }
        };
        
        setTimeout(doRequest, 1000);
    }
}

// ================== ТУРНИРНЫЙ ДИСПЛЕЙ ==================
function updateTournamentDisplay() {
    const oldDisplay = document.getElementById('tournamentDisplay');
    if (oldDisplay) oldDisplay.remove();
    
    const oldCrownBtn = document.getElementById('crownToggleBtn');
    if (oldCrownBtn) oldCrownBtn.remove();
    
    if (!tournamentScores || Object.keys(tournamentScores).length === 0) return;
    
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
    
    if (isMobile) {
        const crownBtn = document.createElement('div');
        crownBtn.id = 'crownToggleBtn';
        crownBtn.className = 'crown-toggle-btn';
        crownBtn.innerHTML = '👑';
        crownBtn.setAttribute('aria-label', 'Показать турнирную таблицу');
        document.body.appendChild(crownBtn);
        
        crownBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const display = document.getElementById('tournamentDisplay');
            if (display) {
                display.classList.toggle('active');
                crownBtn.style.animation = 'crownPulse 0.3s ease';
                setTimeout(() => {
                    crownBtn.style.animation = '';
                }, 300);
            }
        });
    }
    
    const display = document.createElement('div');
    display.id = 'tournamentDisplay';
    
    if (isMobile) {
        display.classList.remove('active');
    }
    
    const target = winTarget || 3;
    const consecutiveInfo = window.consecutiveInfo || {};
    
    let html = `
        <div style="color: #d4af37; font-size: 16px; margin-bottom: 10px; font-weight: bold; letter-spacing: 1px; text-align: center;">
            👑 ТУРНИРНАЯ ТАБЛИЦА
        </div>
    `;
    
    const sortedPlayers = Object.entries(tournamentScores).sort((a, b) => b[1] - a[1]);
    
    for (const [username, score] of sortedPlayers) {
        const isMe = username === playerName;
        const consecutive = consecutiveInfo[username] || 0;
        
        html += `
            <div style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                margin: 5px 0;
                background: ${isMe ? 'rgba(212, 175, 55, 0.15)' : 'rgba(30, 20, 12, 0.9)'};
                border-radius: 12px;
                border: 2px solid ${consecutive >= 2 ? '#ff6600' : (consecutive >= 1 ? '#d4af37' : 'rgba(212, 175, 55, 0.3)')};
                transition: all 0.3s ease;
            ">
                <div style="display: flex; flex-direction: column;">
                    <span style="color: ${isMe ? '#d4af37' : '#faf4e0'}; font-size: 14px; font-weight: ${isMe ? 'bold' : 'normal'};">
                        ${isMe ? '👉 ' : ''}${escapeHtml(username)}
                    </span>
                    ${consecutive > 0 ? `<span style="font-size: 10px; color: ${consecutive >= 2 ? '#ff8800' : '#ffaa44'}; margin-top: 2px;">🔥 Серия: ${consecutive} 🔥</span>` : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="
                        color: ${consecutive >= 2 ? '#ff6600' : '#faf4e0'};
                        font-size: 18px;
                        font-weight: bold;
                        background: ${consecutive >= 1 ? 'rgba(255, 102, 0, 0.3)' : 'transparent'};
                        padding: 2px 10px;
                        border-radius: 20px;
                    ">
                        ${'⬤'.repeat(Math.min(score, target))}${score < target ? '○'.repeat(target - score) : ''}
                    </span>
                    ${consecutive >= 2 ? '<span style="font-size: 18px;">👑</span>' : ''}
                </div>
            </div>
        `;
    }
    
    if (currentGameState && currentGameState.totalPot) {
        html += `
            <div style="
                margin-top: 12px;
                padding: 10px;
                background: linear-gradient(135deg, #2a1f12, #1a1208);
                border-radius: 12px;
                text-align: center;
                border: 1px solid #d4af37;
            ">
                <span style="color: #d4af37; font-size: 12px;">💰 ПРИЗОВОЙ БАНК</span>
                <div style="color: #ffd700; font-size: 20px; font-weight: bold;">${currentGameState.totalPot.toLocaleString()}</div>
                <span style="color: #c9af7b; font-size: 10px;">кранов</span>
            </div>
        `;
    }
    
    if (isMobile) {
        html += `
            <button class="mobile-close-btn" onclick="event.stopPropagation(); document.getElementById('tournamentDisplay').classList.remove('active');">✕</button>
        `;
    }
    
    display.innerHTML = html;
    document.body.appendChild(display);
    
    const closeBtn = display.querySelector('.mobile-close-btn');
    if (closeBtn && isMobile) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            display.classList.remove('active');
        });
    }
    
    if (isMobile) {
        if (window._closeTournamentHandler) {
            document.removeEventListener('click', window._closeTournamentHandler);
        }
        
        window._closeTournamentHandler = (e) => {
            const displayEl = document.getElementById('tournamentDisplay');
            const crownBtnEl = document.getElementById('crownToggleBtn');
            if (displayEl && displayEl.classList.contains('active')) {
                if (!displayEl.contains(e.target) && !crownBtnEl?.contains(e.target)) {
                    displayEl.classList.remove('active');
                }
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', window._closeTournamentHandler);
        }, 100);
    }
}

// ================== АНИМАЦИЯ РАЗДАЧИ ==================
function startDealingAnimation(data) {
    if (dealingInProgress) return;
    dealingInProgress = true;
    
    const handEl = document.getElementById('myHand');
    if (handEl) {
        const cards = handEl.querySelectorAll('.my-card');
        cards.forEach(card => {
            card.style.pointerEvents = 'none';
            card.style.opacity = '0.5';
            card.draggable = false;
        });
    }

    const { players, dealerIndex: dealer, cardsPerPlayer = 12 } = data;
    dealerIndex = dealer;
    currentCardsPerPlayer = cardsPerPlayer;
    
    if (players && players.length === 3) {
        document.body.classList.add('players-3');
    } else {
        document.body.classList.remove('players-3');
    }
    
    const dealerName = players[dealerIndex]?.username || 'Случайный игрок';
    
    console.log('🎴 Запуск анимации раздачи. Дилер:', dealerName);
    
    const tableZone = document.getElementById('tableZone');
    const myHandEl = document.getElementById('myHand');
    const playerTop = document.getElementById('playerTop');
    const playerRight = document.getElementById('playerRight');
    
    if (tableZone) tableZone.innerHTML = '';
    if (myHandEl) myHandEl.innerHTML = '';
    
    if (players.length === 2) {
        if (playerRight) playerRight.style.display = 'none';
        const opponent = players.find(p => p.username !== playerName);
        if (playerTop && opponent) {
            playerTop.innerHTML = `
                <div class="badge-info">
                    <div class="player-name">${escapeHtml(opponent.username)}</div>
                    <div class="player-cards">🎴 0 карт</div>
                </div>
            `;
        }
    } else {
        if (playerRight) playerRight.style.display = 'flex';
        const topPlayer = players.find((_, i) => i !== dealerIndex && i === (dealerIndex + 1) % 3);
        const rightPlayer = players.find((_, i) => i !== dealerIndex && i === (dealerIndex + 2) % 3);
        if (playerTop && topPlayer) {
            playerTop.innerHTML = `
                <div class="badge-info">
                    <div class="player-name">${escapeHtml(topPlayer.username)}</div>
                    <div class="player-cards">🎴 0 карт</div>
                </div>
            `;
        }
        if (playerRight && rightPlayer) {
            playerRight.innerHTML = `
                <div class="badge-info">
                    <div class="player-name">${escapeHtml(rightPlayer.username)}</div>
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
                <span class="dealer-name">${escapeHtml(dealerName)}</span>
            </div>
            <div class="deck-wrapper" id="deckWrapper">
                <div class="deck-stack" id="deckStack">
                    ${Array(36).fill(0).map((_, i) => `
                        <div class="deck-card-animated" style="z-index: ${36 - i}; transform: translateY(${-i * 0.3}px) translateX(${i * 0.5}px);">
                            <div class="card-back-pattern">
                                <img src="/back.png" 
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
                ${playerName === dealerName 
                    ? '👆 НАЖМИТЕ НА КОЛОДУ ДЛЯ РАЗДАЧИ' 
                    : `⏳ Ожидание раздачи от ${dealerName}...`}
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
    const isDealer = playerName === dealerName;
    
    if (isDealer) {
        deckWrapper.classList.add('clickable');
        deckWrapper.addEventListener('click', () => {
            handleDeckClick(players, dealerIndex, overlay, cardsPerPlayer);
        });
    } else {
        deckWrapper.style.opacity = '0.7';
        deckWrapper.style.pointerEvents = 'none';
    }

    socket.on('allCardsDefeated', (data) => {
        console.log('✨ Получена команда на анимацию отбивания всех карт! Карт:', data.cardCount);
        
        const statusBar = document.getElementById('statusBar');
        if (statusBar && !statusBar.hasAttribute('data-temp-message')) {
            const originalHtml = statusBar.innerHTML;
            const originalBg = statusBar.style.background;
            
            statusBar.setAttribute('data-original-html', originalHtml);
            statusBar.setAttribute('data-original-bg', originalBg);
            statusBar.setAttribute('data-temp-message', 'true');
            
            statusBar.innerHTML = '✨ КАРТЫ ОТБИТЫ! ✨';
            statusBar.style.background = 'rgba(212, 175, 55, 0.9)';
            statusBar.style.color = '#1a0f08';
            
            setTimeout(() => {
                if (statusBar && statusBar.hasAttribute('data-temp-message')) {
                    const originalHtml = statusBar.getAttribute('data-original-html');
                    const originalBg = statusBar.getAttribute('data-original-bg');
                    
                    if (originalHtml) statusBar.innerHTML = originalHtml;
                    if (originalBg) statusBar.style.background = originalBg;
                    else statusBar.style.background = '';
                    
                    statusBar.removeAttribute('data-temp-message');
                    statusBar.removeAttribute('data-original-html');
                    statusBar.removeAttribute('data-original-bg');
                    
                    forceUpdateStatusBar();
                }
            }, 1500);
        }
        
        if (typeof window.animateAllCardsDefeated === 'function') {
            window.animateAllCardsDefeated();
        }
    });
    
    socket.once('startDealingAnimation', () => {
        animateCardDistribution(players, dealerIndex, overlay, cardsPerPlayer);
    });
}

function handleDeckClick(players, dealerIndex, overlay, cardsPerPlayer) {
    const deckWrapper = document.getElementById('deckWrapper');
    if (deckWrapper) {
        deckWrapper.classList.remove('clickable');
        deckWrapper.style.pointerEvents = 'none';
    }
    socket.emit('startDealingAnimation', { lobbyId: currentLobbyId });
    animateCardDistribution(players, dealerIndex, overlay, cardsPerPlayer);
}

function animateCardDistribution(players, dealerIndex, overlay, cardsPerPlayer) {
    console.log('🃏 Запуск анимации раздачи карт');
    
    const instruction = document.getElementById('dealInstruction');
    if (instruction) {
        instruction.textContent = '🃏 РАЗДАЧА КАРТ...';
        instruction.style.animation = 'none';
        instruction.style.opacity = '0.8';
    }
    
    const playersCount = players.length;
    const deckStack = document.getElementById('deckStack');
    const deckCards = deckStack.querySelectorAll('.deck-card-animated');
    const deckCenterX = window.innerWidth / 2;
    const deckCenterY = window.innerHeight / 2;
    
    let targetPositions = [];
    
    if (playersCount === 2) {
        const bottomPos = { x: window.innerWidth / 2, y: window.innerHeight - 180 };
        const topPos = { x: window.innerWidth / 2, y: 130 };
        const myIndex = players.findIndex(p => p.username === playerName);
        if (myIndex === 0) {
            targetPositions[0] = bottomPos;
            targetPositions[1] = topPos;
        } else {
            targetPositions[0] = topPos;
            targetPositions[1] = bottomPos;
        }
    } else {
        const positions = [
            { x: window.innerWidth / 2, y: window.innerHeight - 180 },
            { x: window.innerWidth / 2, y: 130 },
            { x: window.innerWidth - 180, y: window.innerHeight / 2 }
        ];
        const otherIndices = [0, 1, 2].filter(i => i !== dealerIndex);
        targetPositions[dealerIndex] = positions[0];
        if (otherIndices.length >= 1) targetPositions[otherIndices[0]] = positions[1];
        if (otherIndices.length >= 2) targetPositions[otherIndices[1]] = positions[2];
    }
    
    const totalCardsToDeal = cardsPerPlayer * playersCount;
    
    deckCards.forEach((card, index) => {
        if (index >= totalCardsToDeal) {
            card.style.display = 'none';
            return;
        }
        const playerIndex = Math.floor(index / cardsPerPlayer) % playersCount;
        const target = targetPositions[playerIndex];
        if (!target) return;
        
        setTimeout(() => {
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
        }, index * 20);
    });
    
    setTimeout(() => {
        finishDealingAnimation(overlay);
    }, totalCardsToDeal * 20 + 1500);
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
        if (overlay.parentNode) overlay.remove();
        dealingInProgress = false;
        animationOverlay = null;
        
        // РАЗБЛОКИРУЕМ карты после завершения раздачи
        const handEl = document.getElementById('myHand');
        if (handEl) {
            const cards = handEl.querySelectorAll('.my-card');
            cards.forEach(card => {
                card.style.pointerEvents = '';
                card.style.opacity = '';
                card.draggable = true;
            });
        }
        
        if (currentGameState && currentGameState.myHand && currentGameState.myHand.length > 0) {
            updateGameStateDisplay(currentGameState);
        }
    }, 500);
}

// ================== ОТОБРАЖЕНИЕ ИГРЫ ==================
function updateGameState(state) {
    if (!state) return;
    
    hideLoadingScreen();
    currentGameState = state;
    
    updatePlayerCountClass();
    
    // Если анимация раздачи идёт - показываем только информацию об игроках, НО НЕ ДАЁМ ДЕЙСТВОВАТЬ
    if (dealingInProgress) {
        console.log('🎴 Анимация раздачи идёт, карты скрыты, действия заблокированы');
        if (state.players) {
            renderPlayersInfo(state.players, state.currentAttacker, state.currentDefender);
        }
        forceUpdateStatusBar();
        
        // Блокируем карты во время анимации раздачи
        const handEl = document.getElementById('myHand');
        if (handEl) {
            const cards = handEl.querySelectorAll('.my-card');
            cards.forEach(card => {
                card.style.pointerEvents = 'none';
                card.style.opacity = '0.5';
                card.draggable = false;
            });
        }
        
        // Скрываем кнопки действий
        const buttonsDiv = document.getElementById('actionButtons');
        if (buttonsDiv) {
            buttonsDiv.style.display = 'none';
        }
        return;
    }
    
    // Если игра заморожена (раунд закончен, ждём следующий) - блокируем все действия
    if (state.gameFrozen) {
        console.log('⏸️ Игра заморожена, действия заблокированы');
        
        // Скрываем кнопки действий
        const buttonsDiv = document.getElementById('actionButtons');
        if (buttonsDiv) {
            buttonsDiv.style.display = 'none';
        }
        
        // Делаем карты некликабельными и не перетаскиваемыми
        const handEl = document.getElementById('myHand');
        if (handEl) {
            const cards = handEl.querySelectorAll('.my-card');
            cards.forEach(card => {
                card.style.pointerEvents = 'none';
                card.style.opacity = '0.5';
                card.draggable = false;
            });
        }
        
        // Отображаем информативное сообщение
        const statusBar = document.getElementById('statusBar');
        if (statusBar && !statusBar.hasAttribute('data-temp-message')) {
            if (state.gameWinner) {
                if (state.gameWinner.includes(playerName)) {
                    statusBar.innerHTML = `🏆 ВЫ ПОБЕДИТЕЛЬ! 🏆<br><span style="font-size:12px">Ожидание следующего раунда...</span>`;
                } else {
                    statusBar.innerHTML = `🏆 ПОБЕДИТЕЛЬ: ${state.gameWinner} 🏆<br><span style="font-size:12px">Ожидание следующего раунда...</span>`;
                }
            } else {
                statusBar.innerHTML = `⏳ ОЖИДАНИЕ СЛЕДУЮЩЕГО РАУНДА... ⏳`;
            }
            statusBar.style.background = 'rgba(212, 175, 55, 0.9)';
            statusBar.style.color = '#1a0f08';
        }
        
        // Всё равно обновляем отображение (но без интерактива)
        if (state.players) {
            renderPlayersInfo(state.players, state.currentAttacker, state.currentDefender);
        }
        renderTable(state.table);
        
        // Обновляем турнирную таблицу
        if (state.consecutiveInfo) {
            window.consecutiveInfo = state.consecutiveInfo;
            updateTournamentDisplay();
        }
        
        return;
    }
    
    // Нормальное обновление - снимаем блокировку
    const handEl = document.getElementById('myHand');
    if (handEl) {
        const cards = handEl.querySelectorAll('.my-card');
        cards.forEach(card => {
            card.style.pointerEvents = '';
            card.style.opacity = '';
            card.draggable = true;
        });
    }
    
    updateGameStateDisplay(state);
}

function updateGameStateDisplay(state) {
    console.log('🎴 Отображение карт игрока');
    
    isActionInProgress = false;
    if (actionTimeout) {
        clearTimeout(actionTimeout);
        actionTimeout = null;
    }
    
    isMyAttackTurn = state.isMyTurnAttack;
    isMyDefendTurn = state.isMyTurnDefend;
    isMyAdditionalAttackTurn = state.isMyAdditionalAttackTurn || false;
    myHand = state.myHand || [];
    tableCards = state.table || [];
    
    window.gameWinner = state.gameWinner;
    
    currentGameState = state;
    forceUpdateStatusBar();
    
    renderTable(state.table);
    renderMyHand(state.myHand, state);
    renderPlayersInfo(state.players, state.currentAttacker, state.currentDefender);
    renderActionButtons(state);
}

function renderPlayersInfo(players, attacker, defender) {
    const playerTop = document.getElementById('playerTop');
    const playerRight = document.getElementById('playerRight');
    
    if (!playerTop || !playerRight) return;
    
    const reordered = reorderPlayersForMe(players, playerName);
    
    if (players.length === 2) {
        playerRight.style.display = 'none';
    } else {
        playerRight.style.display = 'flex';
    }
    
    const playerOnTop = reordered.find(p => p.visualPosition === 1);
    const playerOnRight = reordered.find(p => p.visualPosition === 2);
    
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
    
    if (playerOnRight && players.length === 3) {
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

// ================== ФУНКЦИЯ ОТРИСОВКИ КАРТ ==================
function createCardImage(card, className, onClickHandler = null, cardIndex = null) {
    const div = document.createElement('div');
    
    const suitMap = {
        'hearts': '♥',
        'diamonds': '♦',
        'clubs': '♣',
        'spades': '♠'
    };
    
    const rankMap = {
        '6': '6', '7': '7', '8': '8', '9': '9', '10': '10',
        'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A'
    };
    
    const suitSymbol = suitMap[card.suit] || '♦';
    const rankValue = rankMap[card.rank] || card.rank;
    const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
    const valueColor = isRed ? '#ff0000' : '#000000';
    
    div.className = `card ${className} ${card.suit}`;
    div.innerHTML = `
        <div class="card-value" style="color: ${valueColor};">${rankValue}</div>
        <div class="card-suit" style="color: ${valueColor};">${suitSymbol}</div>
        <div class="card-value" style="color: ${valueColor};">${rankValue}</div>
        <div class="card-suit" style="color: ${valueColor};">${suitSymbol}</div>
    `;
    
    if (className === 'my-card') {
        div.draggable = true;
        div.addEventListener('dragstart', handleDragStart);
        div.addEventListener('dragend', handleDragEnd);
        
        div.style.cursor = 'pointer';
        div.addEventListener('click', (e) => {
            e.stopPropagation();
            if (wasDragged) {
                console.log('🚫 Клик проигнорирован (было перетаскивание)');
                return;
            }
            
            if (isActionInProgress) {
                console.log('🚫 Клик проигнорирован (действие выполняется)');
                return;
            }
            
            if (!isMyAttackTurn && !isMyDefendTurn && !isMyAdditionalAttackTurn) {
                showActionError('Сейчас не ваш ход');
                return;
            }
            
            console.log('👆 Клик по карте:', cardIndex);
            handleCardAction(cardIndex);
        });
    }
    
    return div;
}

function renderTable(table) {
    const zone = document.getElementById('tableZone');
    if (!zone) return;
    
    zone.innerHTML = '';
    
    if (!table || table.length === 0) {
        zone.innerHTML = `<div class="empty-text" style="text-align:center; background:rgba(0,0,0,0.5); padding:15px 25px; border-radius:60px;">❖ СТОЛ ПУСТ ❖<br>Перетащите карту сюда</div>`;
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
        attackDiv.classList.add('card');
        pairDiv.appendChild(attackDiv);
        
        if (defendCards[i]) {
            const defendDiv = createCardImage(defendCards[i].card, 'defend-card');
            defendDiv.classList.add('card');
            pairDiv.appendChild(defendDiv);
        } else {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'card-placeholder';
            emptyDiv.textContent = '?';
            emptyDiv.style.cssText = `
                width: 80px;
                height: 120px;
                background: rgba(80, 80, 80, 0.5);
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
                z-index: 10;
                animation: cardPlaceholderGlow 1.2s ease-in-out;
                animation-iteration-count: infinite;
            `;
            pairDiv.appendChild(emptyDiv);
        }
        container.appendChild(pairDiv);
    }
    zone.appendChild(container);
    
    const allPlaceholders = document.querySelectorAll('.card-placeholder');
    allPlaceholders.forEach(placeholder => {
        setInterval(() => {
            if (placeholder && placeholder.parentNode) {
                placeholder.style.animation = 'none';
                setTimeout(() => {
                    if (placeholder && placeholder.parentNode) {
                        placeholder.style.animation = 'cardPlaceholderGlow 1.2s ease-in-out';
                    }
                }, 10);
            }
        }, 6000);
    });
}

// ================== РЕНДЕР РУКИ ==================
function renderMyHand(hand, state) {
    const handEl = document.getElementById('myHand');
    if (!handEl) return;
    handEl.innerHTML = '';
    
    if (hand.length === 0) {
        const playersWithCards = state.players.filter(p => p.cardCount > 0).length;
        const playersWithoutCards = state.players.filter(p => p.cardCount === 0).length;
        
        if (state.isSubRound && playersWithCards === 2 && playersWithoutCards === 1) {
            handEl.innerHTML = '<div style="background:rgba(0,0,0,0.6); padding:15px 30px; border-radius:60px; text-align:center; color:#ff8844; font-size:22px; font-weight:bold;">👀 ВЫ НАБЛЮДАЕТЕ 👀<br><span style="font-size:14px; color:#c9af7b;">Идёт дополнительный раунд между соперниками</span></div>';
        }
        else if (state.isSubRound && playersWithCards === 1 && playersWithoutCards === 2) {
            if (state.gameFrozen) {
                if (state.gameWinner && state.gameWinner.includes(playerName)) {
                    handEl.innerHTML = '<div class="win-message" style="background:rgba(0,0,0,0.6); padding:15px 30px; border-radius:60px; text-align:center; color:#ffd700;">🏆 ВЫ ПОБЕДИТЕЛЬ ДОП.РАУНДА! 🏆<br><span style="font-size:14px; color:#c9af7b;">+1 очко</span></div>';
                } else {
                    handEl.innerHTML = '<div style="background:rgba(0,0,0,0.6); padding:15px 30px; border-radius:60px; text-align:center; color:#ff8844; font-size:22px; font-weight:bold;">👀 ВЫ НАБЛЮДАЕТЕ 👀<br><span style="font-size:14px; color:#c9af7b;">Дополнительный раунд завершён</span></div>';
                }
            } else {
                handEl.innerHTML = '<div style="background:rgba(0,0,0,0.6); padding:15px 30px; border-radius:60px; text-align:center; color:#ff8844; font-size:22px; font-weight:bold;">👀 ВЫ НАБЛЮДАЕТЕ 👀<br><span style="font-size:14px; color:#c9af7b;">Идёт дополнительный раунд</span></div>';
            }
        }
        else if (!state.isSubRound && playersWithCards > 0) {
            handEl.innerHTML = '<div class="win-message" style="background:rgba(0,0,0,0.6); padding:15px 30px; border-radius:60px; text-align:center; color:#ffd700;">🏆 ВЫ ПОБЕДИТЕЛЬ! 🏆<br><span style="font-size:14px; color:#c9af7b;">Наблюдайте за игрой</span></div>';
        }
        else if (playersWithCards === 0) {
            handEl.innerHTML = '<div style="background:rgba(0,0,0,0.6); padding:15px 30px; border-radius:60px; text-align:center; color:#ffd700; font-size:22px; font-weight:bold;">🤝 НИЧЬЯ! 🤝<br><span style="font-size:14px; color:#c9af7b;">Все сбросили карты</span></div>';
        }
        else {
            handEl.innerHTML = '<div style="background:rgba(0,0,0,0.6); padding:15px 30px; border-radius:60px; text-align:center; color:#ff4444; font-size:22px; font-weight:bold;">💀 ВЫ ПРОИГРАЛИ 💀<br><span style="font-size:14px; color:#c9af7b;">Ожидайте следующий раунд</span></div>';
        }
        
        updateButtonsPositionByCardCount();
        return;
    }
    
    hand.forEach((card, index) => {
        const cardDiv = createCardImage(card, 'my-card', null, index);
        cardDiv.setAttribute('data-card-index', index);
        
        cardDiv.addEventListener('touchstart', handleTouchStart, { passive: true });
        cardDiv.addEventListener('touchmove', handleTouchMove, { passive: false });
        cardDiv.addEventListener('touchend', handleTouchEnd);
        
        handEl.appendChild(cardDiv);
    });
    
    setupTableDropZone();
    
    updateButtonsPositionByCardCount();
}

// ================== DRAG & DROP ==================
function handleDragStart(e) {
    if (isActionInProgress) {
        e.preventDefault();
        return;
    }
    
    const cardElement = e.target.closest('.card');
    if (!cardElement) return;
    
    draggedCardIndex = parseInt(cardElement.getAttribute('data-card-index'));
    draggedElement = cardElement;
    wasDragged = false;
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedCardIndex.toString());
    
    setTimeout(() => {
        if (draggedElement) {
            draggedElement.style.opacity = '0.5';
        }
    }, 0);
}

function handleDragEnd(e) {
    if (draggedElement) {
        draggedElement.style.opacity = '1';
    }
    
    if (e.dataTransfer.dropEffect === 'move' && draggedCardIndex !== null) {
        wasDragged = true;
        handleCardAction(draggedCardIndex);
    }
    
    setTimeout(() => {
        draggedCardIndex = null;
        draggedElement = null;
        wasDragged = false;
    }, 200);
}

function setupTableDropZone() {
    const tableZone = document.getElementById('tableZone');
    if (!tableZone) return;
    
    const newTableZone = tableZone.cloneNode(true);
    tableZone.parentNode.replaceChild(newTableZone, tableZone);
    
    newTableZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        newTableZone.classList.add('drop-active');
    });
    
    newTableZone.addEventListener('dragleave', (e) => {
        newTableZone.classList.remove('drop-active');
    });
    
    newTableZone.addEventListener('drop', (e) => {
        e.preventDefault();
        newTableZone.classList.remove('drop-active');
        
        if (draggedCardIndex !== null && !isActionInProgress) {
            wasDragged = true;
            handleCardAction(draggedCardIndex);
        }
        
        setTimeout(() => {
            draggedCardIndex = null;
            wasDragged = false;
        }, 200);
    });
}

// ================== TOUCH ДЛЯ МОБИЛЬНЫХ ==================
function handleTouchStart(e) {
    if (isActionInProgress || e.touches.length !== 1) return;
    
    const touch = e.touches[0];
    const cardElement = e.target.closest('.card');
    if (!cardElement) return;
    
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchCardIndex = parseInt(cardElement.getAttribute('data-card-index'));
    touchElement = cardElement;
    touchMoved = false;
    wasDragged = false;
}

function handleTouchMove(e) {
    if (touchElement === null || isActionInProgress) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    
    if (!touchMoved && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
        touchMoved = true;
        
        touchClone = touchElement.cloneNode(true);
        touchClone.style.position = 'fixed';
        touchClone.style.zIndex = '9999';
        touchClone.style.opacity = '0.9';
        touchClone.style.transform = 'rotate(-5deg) scale(1.1)';
        touchClone.style.pointerEvents = 'none';
        touchClone.style.transition = 'none';
        document.body.appendChild(touchClone);
        
        touchElement.style.opacity = '0.4';
        
        const tableZone = document.getElementById('tableZone');
        if (tableZone) {
            tableZone.classList.add('drop-active');
        }
    }
    
    if (touchMoved && touchClone) {
        touchClone.style.left = (touch.clientX - 44) + 'px';
        touchClone.style.top = (touch.clientY - 61) + 'px';
    }
    
    if (touchMoved) {
        e.preventDefault();
    }
}

function handleTouchEnd(e) {
    if (touchClone) {
        touchClone.remove();
        touchClone = null;
    }
    
    if (touchElement) {
        touchElement.style.opacity = '1';
    }
    
    const tableZone = document.getElementById('tableZone');
    if (tableZone) {
        tableZone.classList.remove('drop-active');
    }
    
    if (touchMoved && touchCardIndex !== null && !isActionInProgress) {
        const touch = e.changedTouches[0];
        const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
        
        if (dropTarget && (dropTarget.closest('#tableZone') || dropTarget.closest('.main-table'))) {
            wasDragged = true;
            createDropEffect(touch.clientX, touch.clientY);
            handleCardAction(touchCardIndex);
        }
    }
    
    setTimeout(() => {
        touchCardIndex = null;
        touchElement = null;
        touchMoved = false;
        wasDragged = false;
    }, 300);
}

// ================== ЭФФЕКТЫ ==================
function createDropEffect(x, y) {
    const effect = document.createElement('div');
    effect.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        width: 80px;
        height: 80px;
        background: radial-gradient(circle, rgba(212, 175, 55, 0.8), transparent);
        border-radius: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
        z-index: 10000;
        animation: dropPulse 0.5s ease-out forwards;
    `;
    
    document.body.appendChild(effect);
    setTimeout(() => effect.remove(), 500);
}

// ================== ОБРАБОТЧИК ДЕЙСТВИЯ ==================
function handleCardAction(cardIndex) {
    // Проверка на заморозку игры
    if (currentGameState && (currentGameState.gameFrozen || !currentGameState.dealingComplete)) {
        console.log('⏸️ Игра заморожена или идёт раздача, действия заблокированы');
        showActionError('Игра временно заблокирована, ожидайте следующий раунд');
        return;
    }
    
    if (isActionInProgress) {
        console.log('⏳ Действие уже выполняется, ожидайте...');
        showActionError('Подождите, действие выполняется...');
        return;
    }
    
    if (cardIndex === null || cardIndex === undefined || cardIndex < 0) {
        console.log('❌ Невалидный индекс карты:', cardIndex);
        return;
    }
    
    const handEl = document.getElementById('myHand');
    const cardElements = handEl ? handEl.querySelectorAll('.my-card') : [];
    const cardElement = cardElements[cardIndex];
    
    if (!cardElement) {
        console.log('❌ Элемент карты не найден');
        return;
    }
    
    if (isMyAttackTurn && !isMyAdditionalAttackTurn) {
        const attackCards = tableCards.filter(t => t.type === 'attack').length;
        const defendCards = tableCards.filter(t => t.type === 'defend').length;
        
        if (attackCards > defendCards) {
            showActionError('Дождитесь отбоя текущей карты');
            return;
        }
    }
    
    const cardRect = cardElement.getBoundingClientRect();
    const cardClone = cardElement.cloneNode(true);
    const cardData = {
        rect: cardRect,
        clone: cardClone,
        element: cardElement,
        index: cardIndex
    };
    
    isActionInProgress = true;
    
    if (actionTimeout) clearTimeout(actionTimeout);
    actionTimeout = setTimeout(() => {
        isActionInProgress = false;
        actionTimeout = null;
        console.log('🔓 Блокировка действий снята по таймауту');
    }, 5000);
    
    let actionType = '';
    let emitData = {};
    
    if (isMyAdditionalAttackTurn) {
        actionType = 'additionalAttack';
        emitData = { cardIndex: cardIndex };
    } else if (isMyAttackTurn) {
        actionType = 'attack';
        emitData = { cardIndex: cardIndex };
    } else if (isMyDefendTurn) {
        actionType = 'defend';
        emitData = { cardIndex: cardIndex };
    } else {
        isActionInProgress = false;
        showActionError('Сейчас не ваш ход');
        return;
    }
    
    console.log(`🎯 Отправка ${actionType}, карта:`, cardIndex);
    
    cardData.element.style.opacity = '0';
    cardData.element.style.visibility = 'hidden';
    cardData.element.style.pointerEvents = 'none';
    
    animateCardToTableFromData(cardData.rect, cardData.clone, () => {
        console.log('✨ Анимация завершена, отправляем подтверждение на сервер');
        
        socket.emit(actionType, emitData, (result) => {
            console.log(`📡 Результат ${actionType}:`, result);
            
            if (result && !result.success) {
                console.log('❌ Ошибка, возвращаем карту');
                showActionError(result?.error || 'Ошибка при выполнении действия');
                cardData.element.style.opacity = '';
                cardData.element.style.visibility = '';
                cardData.element.style.pointerEvents = '';
            }
            
            isActionInProgress = false;
            if (actionTimeout) clearTimeout(actionTimeout);
            if (handEl) handEl.style.pointerEvents = '';
        });
    });
}

function showActionError(message) {
    const statusBar = document.getElementById('statusBar');
    if (statusBar) {
        const originalText = statusBar.innerHTML;
        const originalBg = statusBar.style.background;
        
        statusBar.innerHTML = `⚠️ ${message}`;
        statusBar.style.background = 'rgba(139, 0, 0, 0.9)';
        statusBar.style.animation = 'shake 0.5s ease';
        
        setTimeout(() => {
            statusBar.innerHTML = originalText;
            statusBar.style.background = originalBg;
            statusBar.style.animation = '';
        }, 2000);
    }
}

// ================== ФУНКЦИЯ RENDERACTIONBUTTONS ==================
function renderActionButtons(state) {
    let buttonsDiv = document.getElementById('actionButtons');
    
    // Если игра заморожена или раздача не завершена - скрываем кнопки
    if (state.gameFrozen || !state.dealingComplete) {
        if (buttonsDiv) {
            buttonsDiv.style.display = 'none';
        }
        return;
    }
    
    const table = state.table || [];
    const attackCount = table.filter(t => t.type === 'attack').length;
    const defendCount = table.filter(t => t.type === 'defend').length;
    const allDefended = attackCount === defendCount && attackCount > 0;
    const hasUndefended = attackCount > defendCount;
    
    let showEndTurn = false;
    let showEndAdditional = false;
    let showTakeCards = false;
    
    if (state.isMyTurnAttack && !state.isMyAdditionalAttackTurn && table.length > 0 && allDefended) {
        showEndTurn = true;
    }
    
    if (state.isMyAdditionalAttackTurn && allDefended) {
        showEndAdditional = true;
    }
    
    if (state.isMyTurnDefend && hasUndefended) {
        showTakeCards = true;
    }
    
    if (!showEndTurn && !showEndAdditional && !showTakeCards) {
        if (buttonsDiv) {
            buttonsDiv.style.display = 'none';
        }
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
    
    if (showEndTurn) {
        const endBtn = document.createElement('button');
        endBtn.className = 'action-btn';
        endBtn.textContent = '✅ ЗАВЕРШИТЬ ХОД';
        endBtn.style.background = 'linear-gradient(135deg, #ff1313, #800000)';
        endBtn.onclick = () => {
            console.log('Нажата кнопка Завершить ход');
            if (socket && socket.connected) {
                endBtn.disabled = true;
                endBtn.style.opacity = '0.5';
                socket.emit('endTurn', {}, (result) => {
                    console.log('Результат endTurn:', result);
                    if (result && !result.success) {
                        showActionError(result.error || 'Ошибка');
                        endBtn.disabled = false;
                        endBtn.style.opacity = '1';
                    } else {
                        endBtn.style.display = 'none';
                    }
                });
            }
        };
        buttonsDiv.appendChild(endBtn);
    }
    
    if (showEndAdditional) {
        const endAddBtn = document.createElement('button');
        endAddBtn.className = 'action-btn';
        endAddBtn.textContent = '✅ ЗАВЕРШИТЬ ПОДКИД';
        endAddBtn.style.background = 'linear-gradient(135deg, #b56a1a, #7a3e0a)';
        endAddBtn.onclick = () => {
            console.log('Нажата кнопка Завершить подкид');
            if (socket && socket.connected) {
                endAddBtn.disabled = true;
                endAddBtn.style.opacity = '0.5';
                socket.emit('endAdditionalAttack', {}, (result) => {
                    console.log('Результат endAdditionalAttack:', result);
                    if (result && !result.success) {
                        showActionError(result.error || 'Ошибка');
                        endAddBtn.disabled = false;
                        endAddBtn.style.opacity = '1';
                    } else {
                        endAddBtn.style.display = 'none';
                    }
                });
            }
        };
        buttonsDiv.appendChild(endAddBtn);
    }
    
    if (showTakeCards) {
        const takeBtn = document.createElement('button');
        takeBtn.className = 'action-btn-take';
        takeBtn.textContent = '📥 ЗАБРАТЬ КАРТЫ';
        takeBtn.onclick = () => {
            console.log('Нажата кнопка Забрать карты');
            if (socket && socket.connected) {
                takeBtn.disabled = true;
                takeBtn.style.opacity = '0.5';
                socket.emit('takeCards', {}, (result) => {
                    if (result && !result.success) {
                        showActionError(result.error || 'Ошибка');
                        takeBtn.disabled = false;
                        takeBtn.style.opacity = '1';
                    } else {
                        takeBtn.style.display = 'none';
                    }
                });
            }
        };
        buttonsDiv.appendChild(takeBtn);
    }
}

// ================== АНИМАЦИЯ ОТБИВАНИЯ ВСЕХ КАРТ ==================
function animateAllCardsDefeated() {
    console.log('✨ Анимация отбивания всех карт!');
    
    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) {
        gameContainer.classList.add('screen-shake');
        setTimeout(() => {
            gameContainer.classList.remove('screen-shake');
        }, 500);
    }
    
    const tablePairs = document.querySelectorAll('.card-pair');
    const allCards = [];
    
    tablePairs.forEach(pair => {
        const cards = pair.querySelectorAll('.card');
        cards.forEach(card => {
            allCards.push(card);
        });
    });
    
    if (allCards.length === 0) return;
    
    const tableZone = document.getElementById('tableZone');
    const tableRect = tableZone ? tableZone.getBoundingClientRect() : null;
    
    allCards.forEach((card, index) => {
        setTimeout(() => {
            const rect = card.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            const cardClone = card.cloneNode(true);
            cardClone.style.position = 'fixed';
            cardClone.style.left = rect.left + 'px';
            cardClone.style.top = rect.top + 'px';
            cardClone.style.width = rect.width + 'px';
            cardClone.style.height = rect.height + 'px';
            cardClone.style.margin = '0';
            cardClone.style.zIndex = '10075';
            cardClone.style.pointerEvents = 'none';
            document.body.appendChild(cardClone);
            
            card.style.opacity = '0';
            card.style.visibility = 'hidden';
            
            const flyAngle = Math.random() * Math.PI * 2;
            const flyDistance = 150 + Math.random() * 200;
            const flyX = Math.cos(flyAngle) * flyDistance;
            const flyY = Math.sin(flyAngle) * flyDistance - 50;
            const flyRot = (Math.random() - 0.5) * 180;
            
            cardClone.style.transition = `all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
            cardClone.style.transform = `translate(${flyX}px, ${flyY}px) rotate(${flyRot}deg) scale(0.3)`;
            cardClone.style.opacity = '0';
            
            createSparksExplosion(centerX, centerY, 50, tableRect);
            
            setTimeout(() => {
                if (cardClone && cardClone.parentNode) cardClone.remove();
            }, 600);
            
        }, index * 50);
    });
    
    if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate([80, 50, 80]);
    }
    
    setTimeout(() => {
        const tableZone = document.getElementById('tableZone');
        if (tableZone) {
            const rect = tableZone.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            createSparksExplosion(centerX, centerY, 80, rect);
        }
    }, allCards.length * 50 + 200);
}

function createSparksExplosion(x, y, count = 50, boundaryRect = null) {
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const particle = document.createElement('div');
            particle.className = 'spark-particle';
            
            let dx, dy;
            
            if (boundaryRect) {
                const angle = Math.random() * Math.PI * 2;
                const maxDistance = Math.min(boundaryRect.width, boundaryRect.height) / 2;
                const distance = 10 + Math.random() * (maxDistance * 0.8);
                dx = Math.cos(angle) * distance;
                dy = Math.sin(angle) * distance;
                
                const newX = x + dx;
                const newY = y + dy;
                
                if (newX < boundaryRect.left + 20 || newX > boundaryRect.right - 20 ||
                    newY < boundaryRect.top + 20 || newY > boundaryRect.bottom - 20) {
                    const correctedDx = (boundaryRect.left + boundaryRect.width / 2 - x) * 0.5;
                    const correctedDy = (boundaryRect.top + boundaryRect.height / 2 - y) * 0.5;
                    dx = correctedDx + (Math.random() - 0.5) * 30;
                    dy = correctedDy + (Math.random() - 0.5) * 30;
                }
            } else {
                const angle = Math.random() * Math.PI * 2;
                const distance = 20 + Math.random() * 100;
                dx = Math.cos(angle) * distance;
                dy = Math.sin(angle) * distance;
            }
            
            const size = 3 + Math.random() * 6;
            
            const colors = ['#ffd700', '#ffcc00', '#ffaa00', '#ff8800', '#ff6600', '#ff4400', '#ffff00', '#ffdd55'];
            const color = colors[Math.floor(Math.random() * colors.length)];
            
            const offsetX = (Math.random() - 0.5) * 30;
            const offsetY = (Math.random() - 0.5) * 30;
            
            particle.style.cssText = `
                position: fixed;
                left: ${x + offsetX}px;
                top: ${y + offsetY}px;
                width: ${size}px;
                height: ${size}px;
                background: ${color};
                border-radius: 50%;
                pointer-events: none;
                z-index: 10080;
                box-shadow: 0 0 ${4 + Math.random() * 6}px ${color};
                transition: all ${0.5 + Math.random() * 0.4}s ease-out;
                opacity: 1;
            `;
            
            document.body.appendChild(particle);
            
            requestAnimationFrame(() => {
                particle.style.transform = `translate(${dx}px, ${dy}px)`;
                particle.style.opacity = '0';
            });
            
            setTimeout(() => {
                if (particle && particle.parentNode) particle.remove();
            }, 800);
        }, i * 2);
    }
}

function animateSingleCardDefeated(cardElement) {
    if (!cardElement) return;
    
    const rect = cardElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const tableZone = document.getElementById('tableZone');
    const tableRect = tableZone ? tableZone.getBoundingClientRect() : null;
    
    const cardClone = cardElement.cloneNode(true);
    cardClone.style.position = 'fixed';
    cardClone.style.left = rect.left + 'px';
    cardClone.style.top = rect.top + 'px';
    cardClone.style.width = rect.width + 'px';
    cardClone.style.height = rect.height + 'px';
    cardClone.style.margin = '0';
    cardClone.style.zIndex = '10075';
    cardClone.style.pointerEvents = 'none';
    document.body.appendChild(cardClone);
    
    cardElement.style.opacity = '0';
    cardElement.style.visibility = 'hidden';
    
    const flyAngle = Math.random() * Math.PI * 2;
    const flyDistance = 100 + Math.random() * 150;
    const flyX = Math.cos(flyAngle) * flyDistance;
    const flyY = Math.sin(flyAngle) * flyDistance - 30;
    const flyRot = (Math.random() - 0.5) * 180;
    
    cardClone.style.transition = `all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
    cardClone.style.transform = `translate(${flyX}px, ${flyY}px) rotate(${flyRot}deg) scale(0.3)`;
    cardClone.style.opacity = '0';
    
    createSparksExplosion(centerX, centerY, 30, tableRect);
    
    setTimeout(() => {
        if (cardClone && cardClone.parentNode) cardClone.remove();
    }, 500);
}

function createSparkExplosion(x, y, count = 20) {
    createSparksExplosion(x, y, count);
}

function createFlashEffect(x, y) {
    const tableZone = document.getElementById('tableZone');
    if (!tableZone) return;
    
    const tableRect = tableZone.getBoundingClientRect();
    
    if (x < tableRect.left - 50 || x > tableRect.right + 50 ||
        y < tableRect.top - 50 || y > tableRect.bottom + 50) {
        return;
    }
    
    const flash = document.createElement('div');
    flash.style.cssText = `
        position: fixed;
        left: ${x - 20}px;
        top: ${y - 20}px;
        width: 40px;
        height: 40px;
        background: radial-gradient(circle, rgba(255, 215, 0, 0.8), rgba(255, 100, 0, 0.4), transparent);
        border-radius: 50%;
        pointer-events: none;
        z-index: 10079;
        animation: flashFade 0.3s ease-out forwards;
    `;
    document.body.appendChild(flash);
    
    setTimeout(() => {
        if (flash.parentNode) flash.remove();
    }, 300);
}

function createFinalFlash() {
    const tableZone = document.getElementById('tableZone');
    if (!tableZone) return;
    
    const rect = tableZone.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const bigFlash = document.createElement('div');
    bigFlash.style.cssText = `
        position: fixed;
        left: ${centerX - 80}px;
        top: ${centerY - 80}px;
        width: 160px;
        height: 160px;
        background: radial-gradient(circle, rgba(255, 215, 0, 0.7), rgba(255, 100, 0, 0.3), transparent);
        border-radius: 50%;
        pointer-events: none;
        z-index: 10078;
        animation: shatterEffect 0.5s ease-out forwards;
    `;
    document.body.appendChild(bigFlash);
    
    setTimeout(() => {
        if (bigFlash.parentNode) bigFlash.remove();
    }, 500);
}

window.animateAllCardsDefeated = animateAllCardsDefeated;
window.animateSingleCardDefeated = animateSingleCardDefeated;

function reorderPlayersForMe(players, myUsername) {
    const myIndex = players.findIndex(p => p.username === myUsername);
    if (myIndex === -1) return players;
    
    const totalPlayers = players.length;
    const reordered = [];
       
    for (let i = 0; i < totalPlayers; i++) {
        const idx = (myIndex + i) % totalPlayers;
        reordered.push({
            ...players[idx],
            visualPosition: i
        });
    }
    
    return reordered;
}

function exitGame() {
    if (confirm('Выйти из игры? Вы вернетесь в лобби.')) {
        window.location.href = '/lobby.html';
    }
}

function adjustGameLayout() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isLandscape = window.innerWidth > window.innerHeight;
    
    if (isMobile) {
        const statusBar = document.getElementById('statusBar');
        const actionButtons = document.querySelector('.action-buttons');
        
        if (isLandscape) {
            const chatContainer = document.getElementById('chatContainer');
            if (chatContainer) chatContainer.style.display = 'none';
            if (statusBar) statusBar.style.fontSize = '10px';
            if (actionButtons) actionButtons.style.padding = '4px 8px';
        } else {
            const chatContainer = document.getElementById('chatContainer');
            if (chatContainer) chatContainer.style.display = '';
            if (statusBar) statusBar.style.fontSize = '';
            if (actionButtons) actionButtons.style.padding = '';
        }
        
        const myHand = document.getElementById('myHand');
        if (myHand) {
            const cardCount = myHand.children.length;
            if (cardCount > 6) {
                myHand.style.gap = '-20px';
            } else if (cardCount > 4) {
                myHand.style.gap = '-15px';
            } else {
                myHand.style.gap = '';
            }
        }
    }
}

function disableHoverOnMobile() {
    if ('ontouchstart' in window) {
        const style = document.createElement('style');
        style.textContent = `
            .card:hover {
                transform: none !important;
            }
            .card:active {
                transform: scale(0.95) !important;
            }
            .action-btn:hover, .action-btn-take:hover {
                transform: none !important;
            }
            .action-btn:active, .action-btn-take:active {
                transform: scale(0.98) !important;
            }
            .lobby-item:hover {
                transform: none !important;
            }
            .join-lobby-btn:hover, .create-lobby-btn:hover {
                transform: none !important;
            }
            .start-game-btn:hover, .leave-lobby-btn:hover {
                transform: none !important;
            }
        `;
        document.head.appendChild(style);
    }
}

// ================== ФУНКЦИЯ ДЛЯ УВЕДОМЛЕНИЙ ==================
function showToast(message) {
    const oldToast = document.querySelector('.toast-notification');
    if (oldToast) oldToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 200px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #d4af37, #b8860b);
        color: #1a0f08;
        padding: 12px 24px;
        border-radius: 50px;
        z-index: 99999;
        font-family: 'Oswald', sans-serif;
        font-weight: bold;
        font-size: 16px;
        box-shadow: 0 4px 30px rgba(212, 175, 55, 0.6);
        border: 2px solid #ffd700;
        animation: toastSlideUp 0.3s ease;
        text-align: center;
        pointer-events: none;
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

if (!document.getElementById('toastStyles')) {
    const style = document.createElement('style');
    style.id = 'toastStyles';
    style.textContent = `
        @keyframes toastSlideUp {
            from { opacity: 0; transform: translateX(-50%) translateY(20px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
    `;
    document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded', () => {
    adjustGameLayout();
    disableHoverOnMobile();
    window.addEventListener('resize', adjustGameLayout);
    window.addEventListener('orientationchange', () => setTimeout(adjustGameLayout, 100));
});

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM загружен, инициализация GameUI (Luxury Casino)');
    initGameUI();
});
