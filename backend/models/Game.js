const { createDeck, shuffle } = require('../utils/deck');

class Game {
    constructor(players, maxPlayers = 3, lobbyId = null, totalPot = 0) {
        this.players = players;
        this.maxPlayers = maxPlayers;
        // Устанавливаем цель в зависимости от количества игроков
        this.scoreToWin = maxPlayers === 2 ? 5 : 3;
        this.consecutiveWinsNeeded = maxPlayers === 2 ? 5 : 3;
        this.deck = shuffle(createDeck());
        this.trumpSuit = 'diamonds';
        this.table = [];
        this.allowedRanks = new Set();
        this.currentAttackerIndex = 0;
        this.currentDefenderIndex = 1;
        this.additionalAttackerIndex = null;
        this.dealingComplete = false;
        this._roundOverSent = false;
        this._gameFrozen = false;
        this._roundWinner = null;
        this._subRoundCompleted = false;
        this._previousLoser = null;
        this.currentDealerIndex = null;
        this.lobbyId = lobbyId;
        this.totalPot = totalPot;
        this._isDraw = false;
        this._subRoundStarted = false;
        this._subRoundFinished = false;
        this._roundFinished = false;
        this._drawProcessed = false;
        
        this._tournamentData = {
            consecutiveWinner: null,
            consecutiveCount: 0,
            lastRoundWinner: null,
            playersConsecutive: new Map(),
            wasSeriesBroken: false
        };
        
        this.players.forEach(p => {
            this._tournamentData.playersConsecutive.set(p.username, 0);
        });

        this.dealCards();
        this.findFirstAttacker();
        console.log(`✅ Игра создана. Козырь: ♢ БУБНЫ`);
        console.log(`👑 Условие победы: ${maxPlayers === 2 ? '5 побед в общем' : '3 победы подряд'}`);
        console.log(`💰 Банк игры: ${this.totalPot} кранов`);
        console.log(`👥 Режим игры: ${maxPlayers} игрока(ов)`);
    }

    broadcastCardAnimation(actionType, data) {
        const roomId = this.lobbyId;
        if (!roomId) return;
        
        const io = require('../server');
        if (io && io.io) {
            io.io.to(`game_${roomId}`).emit('cardAnimation', {
                action: actionType,
                playerUsername: data.playerUsername,
                card: {
                    rank: data.card.rank,
                    suit: data.card.suit,
                    value: data.card.value
                },
                cardIndex: data.cardIndex,
                targetPosition: data.targetPosition,
                attackCard: data.attackCard ? {
                    rank: data.attackCard.rank,
                    suit: data.attackCard.suit
                } : null
            });
        }
    }

    broadcastTakeAnimation(takenBy, cards) {
        const roomId = this.lobbyId;
        if (!roomId) return;
        
        const io = require('../server');
        if (io && io.io) {
            io.io.to(`game_${roomId}`).emit('takeCardsAnimation', {
                takenBy: takenBy,
                cards: cards,
                cardCount: cards.length
            });
        }
    }

    startDealingAnimation() {
        console.log('🎴 Запуск анимации раздачи карт');
        
        // Размораживаем игру перед раздачей
        this._gameFrozen = false;
        this._roundOverSent = false;
        this.dealingComplete = false;
        
        if (this.currentDealerIndex === null) {
            this.currentDealerIndex = Math.floor(Math.random() * this.players.length);
        }
        const dealerIndex = this.currentDealerIndex;
        
        const playersForAnimation = this.players.map(p => ({
            username: p.username,
            id: p.id
        }));
        
        const cardsPerPlayer = this.maxPlayers === 2 ? 6 : 12;
        
        this.players.forEach(p => {
            if (p.socket && p.socket.connected) {
                p.socket.emit('dealAnimation', {
                    players: playersForAnimation,
                    dealerIndex: dealerIndex,
                    totalCards: 36,
                    cardsPerPlayer: cardsPerPlayer
                });
            }
        });
        
        setTimeout(() => {
            this.dealingComplete = true;
            this._gameFrozen = false;  // Убеждаемся что игра разморожена
            this.broadcast();
            console.log('✅ Раздача завершена, игра активна');
        }, 6000);
    }

    startSubRound(loserPlayer, tournamentScores, lobbyId) {
        // ⚠️ ПРОВЕРКА: Если доп. раунд уже запущен или завершен - пропускаем
        if (this._subRoundStarted || this._subRoundCompleted) {
            console.log('⚠️ Дополнительный раунд уже запущен или завершен, пропускаем');
            return;
        }
        
        console.log('========================================');
        console.log('🎯 ЗАПУСК ДОПОЛНИТЕЛЬНОГО РАУНДА');
        console.log('========================================');
        
        // Размораживаем игру для дополнительного раунда
        this._gameFrozen = false;
        this._roundOverSent = false;
        this._subRoundStarted = true; // ← Устанавливаем флаг
        
        const loserConsecutive = this._tournamentData.playersConsecutive.get(loserPlayer.username) || 0;
        
        if (loserConsecutive >= 1) {
            console.log(`⚠️ ${loserPlayer.username} имеет серию побед (${loserConsecutive})! Доп.раунд не запускается!`);
            
            this.players.forEach(p => {
                if (p.socket && p.socket.connected) {
                    p.socket.emit('chatMessage', {
                        username: '⚠️ СИСТЕМА',
                        message: `${loserPlayer.username} имел серию из ${loserConsecutive} побед, но проиграл! Игра заканчивается НИЧЬЕЙ!`
                    });
                }
            });
            
            this._isDraw = true;
            this._gameFrozen = true;
            
            this.refundCoinsOnDraw().then(() => {
                this.players.forEach(p => {
                    if (p.socket && p.socket.connected) {
                        p.socket.emit('gameOver', {
                            winner: 'Ничья - серия султана прервана',
                            isDraw: true,
                            message: `Игрок ${loserPlayer.username} имел серию из ${loserConsecutive} побед, но проиграл.`
                        });
                    }
                });
            });
            return;
        }
        
        this._previousLoser = loserPlayer;
        
        const activePlayers = this.players.filter(p => p.username !== loserPlayer.username);
        
        if (activePlayers.length !== 2) {
            console.error('❌ Ошибка: должно быть ровно 2 активных игрока');
            this._subRoundStarted = false;
            return;
        }
        
        const dealer = loserPlayer;
        dealer.clearHand();
        
        const fullDeck = shuffle(createDeck());
        
        activePlayers[0].hand = fullDeck.splice(0, 6);
        activePlayers[1].hand = fullDeck.splice(0, 6);
        
        dealer.hand = [];
        
        this.table = [];
        this.allowedRanks.clear();
        this.dealingComplete = false;
        this._roundOverSent = false;
        this._gameFrozen = false;
        this._subRoundCompleted = false;
        this.additionalAttackerIndex = null;
        
        let attackerIdx = -1, lowestDiamond = Infinity;
        
        for (let i = 0; i < this.players.length; i++) {
            const player = this.players[i];
            if (player.username === dealer.username) continue;
            
            const diamonds = player.hand.filter(c => c.suit === 'diamonds');
            for (const d of diamonds) {
                if (d.value < lowestDiamond) {
                    lowestDiamond = d.value;
                    attackerIdx = i;
                }
            }
        }
        
        if (attackerIdx === -1) {
            const activeIndices = this.players.reduce((acc, p, i) => {
                if (p.username !== dealer.username) acc.push(i);
                return acc;
            }, []);
            attackerIdx = activeIndices[Math.floor(Math.random() * activeIndices.length)];
        }
        
        this.currentAttackerIndex = attackerIdx;
        this.currentDefenderIndex = this.players.findIndex((p, i) => 
            i !== attackerIdx && p.username !== dealer.username
        );
        
        const dealerIndex = this.players.indexOf(dealer);
        const playersForAnimation = [
            { username: this.players[attackerIdx].username, id: this.players[attackerIdx].id },
            { username: this.players[this.currentDefenderIndex].username, id: this.players[this.currentDefenderIndex].id },
            { username: dealer.username, id: dealer.id }
        ];
        
        this.players.forEach(p => {
            if (p.socket && p.socket.connected) {
                p.socket.emit('dealAnimation', {
                    players: playersForAnimation,
                    dealerIndex: 2,
                    totalCards: 12,
                    cardsPerPlayer: 6
                });
            }
        });
        
        setTimeout(() => {
            this.dealingComplete = true;
            this.broadcast();
        }, 6000);
    }

    resetForNewRound() {
        console.log('🔄 Сброс игры для нового раунда');
        
        this.deck = shuffle(createDeck());
        this.table = [];
        this.allowedRanks.clear();
        this.dealingComplete = false;
        this.additionalAttackerIndex = null;
        this._roundOverSent = false;
        this._gameFrozen = false;
        this._roundWinner = null;
        this._subRoundCompleted = false;
        this._subRoundStarted = false;
        this._subRoundFinished = false;
        this._roundFinished = false;
        this._drawProcessed = false;
        this._previousLoser = null;
        this._isDraw = false;
        
        this.players.forEach(p => p.clearHand());
        
        this.dealCards();
        this.findFirstAttacker();
        
        console.log('✅ Игра разморожена для нового раунда');
    }

    dealCards() {
        const cardsPerPlayer = this.maxPlayers === 2 ? 6 : 12;
        this.players.forEach((player, index) => {
            player.hand = this.deck.splice(0, cardsPerPlayer);
        });
    }

    findFirstAttacker() {
        if (this.players.length === 2) {
            let attackerIdx = 0, lowestRank = Infinity;
            for (let i = 0; i < 2; i++) {
                const diamond = this.players[i].hand.find(c => c.suit === 'diamonds');
                if (diamond && diamond.value < lowestRank) {
                    lowestRank = diamond.value;
                    attackerIdx = i;
                }
            }
            if (lowestRank === Infinity) attackerIdx = Math.floor(Math.random() * 2);
            this.currentAttackerIndex = attackerIdx;
            this.currentDefenderIndex = (attackerIdx + 1) % 2;
            console.log(`🎲 Первый атакующий: ${this.players[attackerIdx].username}`);
            return;
        }
        
        for (let i = 0; i < this.players.length; i++) {
            if (this.players[i].hand.some(c => c.rank === '6' && c.suit === 'diamonds')) {
                this.currentAttackerIndex = i;
                this.currentDefenderIndex = this.getNextActivePlayer(i);
                console.log(`🎲 Первый атакующий (6♦): ${this.players[i].username}`);
                return;
            }
        }
        this.currentAttackerIndex = 0;
        this.currentDefenderIndex = this.getNextActivePlayer(0);
        console.log(`🎲 Первый атакующий (случайный): ${this.players[0].username}`);
    }

    attack(playerId, cardIndex) {
        if (this._gameFrozen) return { success: false, error: 'Раунд окончен' };
        const attacker = this.players[this.currentAttackerIndex];
        if (!attacker || attacker.id !== playerId) return { success: false, error: 'Не ваш ход' };
        if (attacker.hand.length === 0) return { success: false, error: 'У вас нет карт' };
        
        let attackCount = this.table.filter(t => t.type === 'attack').length;
        let defendCount = this.table.filter(t => t.type === 'defend').length;
        
        if (attackCount > defendCount) return { success: false, error: 'Дождитесь отбоя' };
        
        const card = attacker.hand[cardIndex];
        if (!card) return { success: false, error: 'Карта не найдена' };
        
        if (this.table.length > 0 && attackCount === defendCount) {
            if (!this.allowedRanks.has(card.rank)) {
                return { success: false, error: 'Можно подкидывать только карты того же достоинства' };
            }
        }
        
        const playedCard = { rank: card.rank, suit: card.suit, value: card.value };
        
        attacker.hand.splice(cardIndex, 1);
        this.table.push({ type: 'attack', card });
        this.allowedRanks.add(card.rank);
        
        this.broadcastCardAnimation('attack', {
            playerUsername: attacker.username,
            card: playedCard,
            cardIndex: cardIndex,
            targetPosition: 'table'
        });
        
        console.log(`⚔️ ${attacker.username} атакует картой ${card.rank} ${card.suit} (осталось: ${attacker.hand.length})`);
        
        this.checkWinCondition();
        return { success: true };
    }

    defend(playerId, cardIndex) {
        if (this._gameFrozen) return { success: false, error: 'Раунд окончен' };
        const defender = this.players[this.currentDefenderIndex];
        if (!defender || defender.id !== playerId) return { success: false, error: 'Не ваш ход' };
        if (defender.hand.length === 0) return { success: false, error: 'У вас нет карт' };
        
        let lastAttackIdx = -1;
        for (let i = this.table.length - 1; i >= 0; i--) {
            if (this.table[i].type === 'attack') {
                const defended = this.table.some((item, idx) => 
                    idx > i && item.type === 'defend' && item.pairIndex === i
                );
                if (!defended) {
                    lastAttackIdx = i;
                    break;
                }
            }
        }
        
        if (lastAttackIdx === -1) return { success: false, error: 'Нет карты для отбоя' };
        
        const attackCard = this.table[lastAttackIdx].card;
        const defendCard = defender.hand[cardIndex];
        
        if (!this.canBeat(attackCard, defendCard)) {
            return { success: false, error: 'Нельзя побить этой картой' };
        }
        
        const playedCard = { rank: defendCard.rank, suit: defendCard.suit, value: defendCard.value };
        
        defender.hand.splice(cardIndex, 1);
        this.table.push({ type: 'defend', card: defendCard, pairIndex: lastAttackIdx });
        this.allowedRanks.add(defendCard.rank);
        
        this.broadcastCardAnimation('defend', {
            playerUsername: defender.username,
            card: playedCard,
            cardIndex: cardIndex,
            targetPosition: 'table',
            attackCard: attackCard
        });
        
        console.log(`🛡️ ${defender.username} отбивается картой ${defendCard.rank} ${defendCard.suit} (осталось: ${defender.hand.length})`);
        
        // Дама завершает ход автоматически
        if (defendCard.rank === 'Q') {
            console.log(`♕ Дама завершает ход!`);
            
            // Отправляем спецэффект для дамы
            const roomId = this.lobbyId;
            if (roomId) {
                const io = require('../server');
                if (io && io.io) {
                    io.io.to(`game_${roomId}`).emit('queenDefeated', {
                        playerUsername: defender.username
                    });
                }
            }
            
            this.endBout();
            return { success: true, queenPlayed: true };
        }
        
        this.checkWinCondition();
        return { success: true };
    }

    endBout(isDraw = false) {
        console.log('🔄 endBout вызван (отбой)');
        
        // Если на столе есть карты и все они отбиты
        const attackCount = this.table.filter(t => t.type === 'attack').length;
        const defendCount = this.table.filter(t => t.type === 'defend').length;
        const allDefended = attackCount === defendCount && attackCount > 0;
        
        if (allDefended) {
            console.log('✨ ВСЕ КАРТЫ ОТБИТЫ! Запускаем анимацию разрыва!');
            
            // Отправляем событие на клиент для анимации
            const roomId = this.lobbyId;
            if (roomId) {
                const io = require('../server');
                if (io && io.io) {
                    io.io.to(`game_${roomId}`).emit('allCardsDefeated', {
                        cardCount: attackCount
                    });
                }
            }
        }
        
        this.table = [];
        this.allowedRanks.clear();
        this.additionalAttackerIndex = null;
        
        const playersWithCards = this.players.filter(p => p.hand.length > 0);
        
        if (playersWithCards.length === 0) {
            this.checkWinCondition();
            return;
        }
        
        if (playersWithCards.length === 1) {
            this.checkWinCondition();
            return;
        }
        
        if (this.maxPlayers === 2) {
            // Для игры на двоих: отбивающийся становится атакующим
            this.currentAttackerIndex = this.currentDefenderIndex;
            this.currentDefenderIndex = (this.currentAttackerIndex + 1) % 2;
        } else {
            // Для игры на троих: отбивающийся становится атакующим
            this.currentAttackerIndex = this.currentDefenderIndex;
            
            let nextDefender = (this.currentAttackerIndex + 1) % this.players.length;
            let attempts = 0;
            while (attempts < this.players.length && this.players[nextDefender].hand.length === 0) {
                nextDefender = (nextDefender + 1) % this.players.length;
                attempts++;
            }
            this.currentDefenderIndex = nextDefender;
        }
        
        console.log(`🔄 ОТБОЙ! Отбивающийся теперь атакует`);
        console.log(`   Атакующий: ${this.players[this.currentAttackerIndex]?.username} (${this.players[this.currentAttackerIndex]?.hand.length} карт)`);
        console.log(`   Защитник: ${this.players[this.currentDefenderIndex]?.username} (${this.players[this.currentDefenderIndex]?.hand.length} карт)`);
        
        if (!isDraw) {
            this.checkWinCondition();
        }
    }

    getNextActivePlayer(currentIndex) {
        let nextIndex = (currentIndex + 1) % this.players.length;
        let attempts = 0;
        
        while (attempts < this.players.length) {
            const player = this.players[nextIndex];
            if (player && player.hand.length > 0 && nextIndex !== currentIndex) {
                return nextIndex;
            }
            nextIndex = (nextIndex + 1) % this.players.length;
            attempts++;
        }
        return currentIndex;
    }

    takeCards(playerId) {
        if (this._gameFrozen) return { success: false, error: 'Раунд окончен' };
        const defender = this.players[this.currentDefenderIndex];
        if (!defender || defender.id !== playerId) return { success: false, error: 'Не ваш ход' };
        
        const takenCards = this.table.map(item => item.card);
        
        const cardsForAnimation = takenCards.map(card => ({
            rank: card.rank,
            suit: card.suit,
            value: card.value
        }));
        
        defender.hand.push(...takenCards);
        
        this.broadcastTakeAnimation(defender.username, cardsForAnimation);
        
        this.table = [];
        this.allowedRanks.clear();
        this.additionalAttackerIndex = null;
        
        if (this.maxPlayers === 2) {
            this.currentAttackerIndex = (this.currentDefenderIndex + 1) % 2;
            this.currentDefenderIndex = (this.currentAttackerIndex + 1) % 2;
        } else {
            let nextAttacker = (this.currentDefenderIndex + 1) % this.players.length;
            let attempts = 0;
            while (attempts < this.players.length && this.players[nextAttacker].hand.length === 0) {
                nextAttacker = (nextAttacker + 1) % this.players.length;
                attempts++;
            }
            this.currentAttackerIndex = nextAttacker;
            
            let nextDefender = (this.currentAttackerIndex + 1) % this.players.length;
            attempts = 0;
            while (attempts < this.players.length && this.players[nextDefender].hand.length === 0) {
                nextDefender = (nextDefender + 1) % this.players.length;
                attempts++;
            }
            this.currentDefenderIndex = nextDefender;
        }
        
        console.log(`📥 ВЗЯТИЕ КАРТ! ${defender.username} забрал ${takenCards.length} карт и теряет ход`);
        console.log(`   Атакующий: ${this.players[this.currentAttackerIndex]?.username} (${this.players[this.currentAttackerIndex]?.hand.length} карт)`);
        console.log(`   Защитник: ${this.players[this.currentDefenderIndex]?.username} (${this.players[this.currentDefenderIndex]?.hand.length} карт)`);
        
        this.checkWinCondition();
        return { success: true };
    }

    endTurn(playerId) {
        if (this._gameFrozen) return { success: false, error: 'Раунд окончен' };
        const attacker = this.players[this.currentAttackerIndex];
        if (!attacker || attacker.id !== playerId) return { success: false, error: 'Не ваш ход' };
        if (this.table.length === 0) return { success: false, error: 'На столе нет карт' };
        
        let attackCount = this.table.filter(t => t.type === 'attack').length;
        let defendCount = this.table.filter(t => t.type === 'defend').length;
        if (attackCount > defendCount) return { success: false, error: 'Сначала отбейтесь' };
        
        console.log(`🔄 ${attacker.username} завершает ход. Атак: ${attackCount}, защит: ${defendCount}`);
        
        const playersWithCards = this.players.filter(p => p.hand.length > 0);
        
        if (this.maxPlayers === 2) {
            // Для игры на двоих: после завершения хода атакующего - сразу отбой
            this.endBout();
            return { success: true, additionalAttack: false };
        } else {
            // Для игры на троих: после завершения хода атакующего - право подкидывать переходит к третьему игроку
            let thirdIdx = -1;
            for (let i = 0; i < this.players.length; i++) {
                if (i !== this.currentAttackerIndex && i !== this.currentDefenderIndex && this.players[i].hand.length > 0) {
                    thirdIdx = i;
                    break;
                }
            }
            
            if (thirdIdx !== -1 && this.canThirdPlayerAttack(this.players[thirdIdx])) {
                this.additionalAttackerIndex = thirdIdx;
                console.log(`✨ Право подкидывания перешло к ${this.players[thirdIdx].username}`);
                return { success: true, additionalAttack: true };
            } else {
                // Если третий игрок не может подкинуть - сразу отбой
                this.endBout();
                return { success: true, additionalAttack: false };
            }
        }
    }

    additionalAttack(playerId, cardIndex) {
        if (this._gameFrozen || this.additionalAttackerIndex === null) {
            return { success: false, error: 'Нет дополнительной атаки' };
        }
        
        // Проверяем, что подкидывает ТОТ, у кого есть право (третий игрок)
        const allowedPlayer = this.players[this.additionalAttackerIndex];
        if (!allowedPlayer || allowedPlayer.id !== playerId) {
            return { success: false, error: 'Сейчас не ваш ход подкидывать' };
        }
        
        if (allowedPlayer.hand.length === 0) return { success: false, error: 'У вас нет карт' };
        
        const card = allowedPlayer.hand[cardIndex];
        if (!card) return { success: false, error: 'Карта не найдена' };
        
        const attackCount = this.table.filter(t => t.type === 'attack').length;
        const defendCount = this.table.filter(t => t.type === 'defend').length;
        const hasUndefended = attackCount > defendCount;
        
        if (hasUndefended) {
            return { success: false, error: 'Сначала дождитесь отбоя текущей карты!' };
        }
        
        // Проверяем, можно ли подкинуть эту карту (по рангу)
        const ranksOnTable = new Set(this.table.map(t => t.card.rank));
        if (!ranksOnTable.has(card.rank)) {
            return { success: false, error: 'Можно подкидывать только карты того же достоинства' };
        }
        
        const playedCard = { rank: card.rank, suit: card.suit, value: card.value };
        
        allowedPlayer.hand.splice(cardIndex, 1);
        this.table.push({ type: 'attack', card });
        this.allowedRanks.add(card.rank);
        
        this.broadcastCardAnimation('additionalAttack', {
            playerUsername: allowedPlayer.username,
            card: playedCard,
            cardIndex: cardIndex,
            targetPosition: 'table'
        });
        
        console.log(`➕ ${allowedPlayer.username} подкидывает карту ${card.rank} ${card.suit} (осталось: ${allowedPlayer.hand.length})`);
        
        // После успешного подкидывания проверяем, может ли третий игрок подкинуть ЕЩЕ
        if (!this.canThirdPlayerAttack(allowedPlayer)) {
            console.log(`✨ ${allowedPlayer.username} больше не может подкидывать`);
            this.additionalAttackerIndex = null;
        }
        
        if (allowedPlayer.hand.length === 0) {
            console.log(`🏆 ${allowedPlayer.username} избавился от всех карт!`);
        }
        
        this.checkWinCondition();
        return { success: true };
    }

    endAdditionalAttack(playerId) {
        if (this._gameFrozen || this.additionalAttackerIndex === null) return { success: false };
        const allowedPlayer = this.players[this.additionalAttackerIndex];
        if (!allowedPlayer || allowedPlayer.id !== playerId) return { success: false };
        
        console.log(`✅ ${allowedPlayer.username} завершает подкидывание карт`);
        
        this.additionalAttackerIndex = null;
        this.endBout();
        
        return { success: true };
    }

    canThirdPlayerAttack(thirdPlayer) {
        const ranksOnTable = new Set(this.table.map(t => t.card.rank));
        return thirdPlayer.hand.some(card => ranksOnTable.has(card.rank));
    }

    canBeat(attackCard, defendCard) {
        if (attackCard.suit === 'spades') {
            return defendCard.suit === 'spades' && defendCard.value > attackCard.value;
        }
        if (defendCard.isTrump) {
            if (attackCard.isTrump) {
                return defendCard.value > attackCard.value;
            }
            return true;
        }
        return defendCard.suit === attackCard.suit && defendCard.value > attackCard.value;
    }

    getWinner() {
        const playersWithoutCards = this.players.filter(p => p.hand.length === 0);
        const playersWithCards = this.players.filter(p => p.hand.length > 0);
        if (playersWithCards.length === 1 && playersWithoutCards.length >= 1) {
            return playersWithoutCards.map(w => w.username).join(', ');
        }
        if (playersWithCards.length === 0) {
            return 'Ничья - все победители!';
        }
        return null;
    }

    checkWinCondition() {
        // Если игра уже заморожена - не проверяем
        if (this._gameFrozen) return false;
        
        const playersWithCards = this.players.filter(p => p.hand.length > 0);
        const playersWithoutCards = this.players.filter(p => p.hand.length === 0);
        
        // ============ ПРОВЕРКА ДЛЯ 2 ИГРОКОВ ============
        if (this.maxPlayers === 2) {
            if (playersWithCards.length === 1 && playersWithoutCards.length === 1) {
                if (this._roundOverSent) return true;
                this._roundOverSent = true;
                this._gameFrozen = true;
                
                const loser = playersWithCards[0];
                const winner = playersWithoutCards[0];
                
                this.players.forEach(p => {
                    if (p.socket && p.socket.connected) {
                        p.socket.emit('roundOver', {
                            roundWinner: winner.username,
                            loser: loser.username,
                            allWinners: [winner.username],
                            isSubRound: false,
                            needSubRound: false
                        });
                    }
                });
                return true;
            }
            
            if (playersWithCards.length === 0 && !this._roundOverSent) {
                this._roundOverSent = true;
                this._gameFrozen = true;
                
                this.players.forEach(p => {
                    if (p.socket && p.socket.connected) {
                        p.socket.emit('roundOver', {
                            roundWinner: 'Ничья',
                            loser: null,
                            allWinners: this.players.map(w => w.username),
                            isSubRound: false,
                            isDraw: true
                        });
                    }
                });
                return true;
            }
            return false;
        }
        
        // ============ ПРОВЕРКА ДЛЯ 3 ИГРОКОВ ============
        
        // Проверка для дополнительного раунда
        if (this._previousLoser && playersWithCards.length === 1 && playersWithoutCards.length === 2) {
            if (this._roundOverSent) return true;
            this._roundOverSent = true;
            this._gameFrozen = true;
            
            const subRoundWinner = playersWithoutCards.find(p => p.username !== this._previousLoser?.username);
            const subRoundLoser = playersWithCards[0];
            
            // ⚠️ ПРОВЕРКА: Если у проигравшего в доп. раунде была серия → НИЧЬЯ!
            const consecutiveInfo = this._tournamentData?.playersConsecutive?.get(subRoundLoser.username) || 0;
            
            if (consecutiveInfo >= 1) {
                console.log(`⚠️ ${subRoundLoser.username} имел серию побед (${consecutiveInfo}), но проиграл в ДОПОЛНИТЕЛЬНОМ раунде! НИЧЬЯ!`);
                this._isDraw = true;
                this._drawProcessed = true;
                
                this.players.forEach(p => {
                    if (p.socket && p.socket.connected) {
                        p.socket.emit('chatMessage', {
                            username: '⚠️ СИСТЕМА',
                            message: `${subRoundLoser.username} имел серию из ${consecutiveInfo} побед, но проиграл в дополнительном раунде! Ничья!`
                        });
                        p.socket.emit('roundOver', {
                            roundWinner: 'НИЧЬЯ',
                            loser: subRoundLoser.username,
                            allWinners: [],
                            isSubRound: true,
                            isDraw: true,
                            isSeriesBroken: true
                        });
                    }
                });
                return true;
            }
            
            this.players.forEach(p => {
                if (p.socket && p.socket.connected) {
                    p.socket.emit('roundOver', {
                        roundWinner: subRoundWinner?.username || 'Неизвестно',
                        loser: subRoundLoser?.username || 'Неизвестно',
                        allWinners: [subRoundWinner?.username],
                        isSubRound: true
                    });
                }
            });
            return true;
        }
        
        // ============ ОСНОВНОЙ РАУНД (3 игрока) ============
        if (playersWithCards.length === 1 && playersWithoutCards.length >= 1) {
            if (this._roundOverSent) return true;
            this._roundOverSent = true;
            this._gameFrozen = true;
            
            const loser = playersWithCards[0];
            const winners = playersWithoutCards;
            const roundWinner = winners[0];
            
            // ⚠️ ПРОВЕРКА: Если у проигравшего в основном раунде была серия → НИЧЬЯ!
            const consecutiveInfo = this._tournamentData?.playersConsecutive?.get(loser.username) || 0;
            
            if (consecutiveInfo >= 1) {
                console.log(`⚠️ ${loser.username} имел серию побед (${consecutiveInfo}), но проиграл в основном раунде! НИЧЬЯ!`);
                this._isDraw = true;
                this._drawProcessed = true;
                
                this.players.forEach(p => {
                    if (p.socket && p.socket.connected) {
                        p.socket.emit('chatMessage', {
                            username: '⚠️ СИСТЕМА',
                            message: `${loser.username} имел серию из ${consecutiveInfo} побед, но проиграл в основном раунде! Ничья!`
                        });
                        p.socket.emit('roundOver', {
                            roundWinner: 'НИЧЬЯ',
                            loser: loser.username,
                            allWinners: [],
                            isSubRound: false,
                            isDraw: true,
                            isSeriesBroken: true,
                            needSubRound: false
                        });
                    }
                });
                return true;
            }
            
            this.players.forEach(p => {
                if (p.socket && p.socket.connected) {
                    p.socket.emit('roundOver', {
                        roundWinner: roundWinner.username,
                        loser: loser.username,
                        allWinners: winners.map(w => w.username),
                        isSubRound: false,
                        needSubRound: this.players.length === 3
                    });
                }
            });
            return true;
        }
        
        // Ничья (все сбросили карты)
        if (playersWithCards.length === 0 && !this._roundOverSent) {
            this._roundOverSent = true;
            this._gameFrozen = true;
            this._isDraw = true;
            
            this.players.forEach(p => {
                if (p.socket && p.socket.connected) {
                    p.socket.emit('roundOver', {
                        roundWinner: 'Ничья',
                        loser: null,
                        allWinners: this.players.map(w => w.username),
                        isSubRound: false,
                        isDraw: true
                    });
                }
            });
            return true;
        }
        
        // Проверка на случай, если атакующий или защитник остался без карт
        const attacker = this.players[this.currentAttackerIndex];
        const defender = this.players[this.currentDefenderIndex];
        
        if (attacker && attacker.hand.length === 0) {
            this.endBout(true);
            return true;
        }
        
        if (defender && defender.hand.length === 0) {
            this.endBout(true);
            return true;
        }
        
        return false;
    }

    async checkSultan(lobbyId, tournamentScores, roundWinner, isSubRound = false) {
        if (!tournamentScores) return null;
        
        // ============ ДЛЯ 2 ИГРОКОВ ============
        if (this.maxPlayers === 2) {
            // Накопительный счет до 5 побед (НЕ ПОДРЯД)
            const currentScore = (tournamentScores.get(roundWinner) || 0) + 1;
            tournamentScores.set(roundWinner, currentScore);
            
            console.log(`📊 Счет 2 игрока: ${roundWinner} = ${currentScore}/5`);
            
            // Обновляем счет для всех игроков
            const scoresObj = Object.fromEntries(tournamentScores);
            this.players.forEach(p => {
                if (p.socket && p.socket.connected) {
                    p.socket.emit('tournamentScoresUpdate', {
                        scores: scoresObj,
                        roundWinner: roundWinner,
                        loser: null,
                        winTarget: 5,
                        isSubRound: false,
                        isTwoPlayerMode: true
                    });
                }
            });
            
            // Проверяем, достиг ли игрок 5 побед
            if (currentScore >= 5) {
                // Победитель! Начисляем 500 кранов
                await this.awardWinnerCoins(roundWinner, 500);
                
                this.players.forEach(p => {
                    if (p.socket && p.socket.connected) {
                        p.socket.emit('sultanDeclared', {
                            sultan: roundWinner,
                            scores: scoresObj,
                            totalPrize: 500,
                            consecutiveWins: currentScore,
                            isTwoPlayerMode: true
                        });
                        p.socket.emit('chatMessage', {
                            username: '🏆 СИСТЕМА',
                            message: `🏆 ${roundWinner} выиграл 5 раундов и получает 500 кранов!`
                        });
                    }
                });
                
                return roundWinner;
            }
            
            return null;
        }
        
        // ============ ДЛЯ 3 ИГРОКОВ ============
        const currentConsecutive = this._tournamentData.playersConsecutive.get(roundWinner) || 0;
        
        // Проверка на прерывание серии (если победитель сменился)
        if (this._tournamentData.lastRoundWinner && 
            this._tournamentData.lastRoundWinner !== roundWinner &&
            this._tournamentData.playersConsecutive.get(this._tournamentData.lastRoundWinner) >= 1) {
            
            const brokenSeriesCount = this._tournamentData.playersConsecutive.get(this._tournamentData.lastRoundWinner);
            
            this._isDraw = true;
            this._tournamentData.wasSeriesBroken = true;
            
            this.players.forEach(p => {
                if (p.socket && p.socket.connected) {
                    p.socket.emit('chatMessage', {
                        username: '⚠️ СИСТЕМА',
                        message: `Серия ${this._tournamentData.lastRoundWinner} из ${brokenSeriesCount} побед прервана! Ничья!`
                    });
                    p.socket.emit('gameOver', {
                        winner: 'Ничья - серия прервана',
                        isDraw: true
                    });
                }
            });
            
            await this.refundCoinsOnDraw();
            return 'draw';
        }
        
        // Обновляем серию побед
        const newConsecutive = currentConsecutive + 1;
        this._tournamentData.playersConsecutive.set(roundWinner, newConsecutive);
        this._tournamentData.lastRoundWinner = roundWinner;
        
        // Сбрасываем серии у других игроков
        for (const [username, _] of this._tournamentData.playersConsecutive) {
            if (username !== roundWinner) {
                this._tournamentData.playersConsecutive.set(username, 0);
            }
        }
        
        // Отправляем обновление серий
        const consecutiveInfo = Object.fromEntries(this._tournamentData.playersConsecutive);
        this.players.forEach(p => {
            if (p.socket && p.socket.connected) {
                p.socket.emit('consecutiveUpdate', consecutiveInfo);
            }
        });
        
        // Проверяем, достиг ли игрок 3 побед подряд
        if (newConsecutive >= this.consecutiveWinsNeeded) {
            await this.awardWinnerCoins(roundWinner, this.totalPot);
            
            this.players.forEach(p => {
                if (p.socket && p.socket.connected) {
                    p.socket.emit('sultanDeclared', {
                        sultan: roundWinner,
                        scores: Object.fromEntries(tournamentScores),
                        consecutiveWins: newConsecutive,
                        totalPrize: this.totalPot
                    });
                    p.socket.emit('chatMessage', {
                        username: '👑 СИСТЕМА',
                        message: `👑 ${roundWinner} стал СУЛТАНОМ и забирает ${this.totalPot} кранов!`
                    });
                }
            });
            
            return roundWinner;
        }
        
        return null;
    }

    async awardWinnerCoins(winnerUsername, amount) {
        try {
            const User = require('./User');
            
            const winner = await User.findOne({ username: winnerUsername });
            if (winner) {
                winner.coins += amount;
                await winner.save();
                
                console.log(`💰 ${winnerUsername} выиграл ${amount} кранов. Новый баланс: ${winner.coins}`);
                
                this.players.forEach(p => {
                    if (p.socket && p.socket.connected) {
                        p.socket.emit('chatMessage', {
                            username: '🏆 СИСТЕМА',
                            message: `${winnerUsername} выиграл ${amount} кранов! 👑`
                        });
                        p.socket.emit('coinsUpdated', { coins: winner.coins });
                    }
                });
                
                return true;
            }
            return false;
        } catch (error) {
            console.error('Ошибка начисления призовых:', error);
            return false;
        }
    }

    async refundCoinsOnDraw() {
        try {
            const User = require('./User');
            const refundPerPlayer = 500;
            
            for (const player of this.players) {
                const user = await User.findOne({ username: player.username });
                if (user) {
                    user.coins += refundPerPlayer;
                    await user.save();
                    
                    console.log(`💰 ${player.username} возвращено ${refundPerPlayer} кранов. Новый баланс: ${user.coins}`);
                    
                    if (player.socket && player.socket.connected) {
                        player.socket.emit('coinsUpdated', { coins: user.coins });
                        player.socket.emit('chatMessage', {
                            username: '🔄 СИСТЕМА',
                            message: `Ничья! Вам возвращено ${refundPerPlayer} кранов.`
                        });
                    }
                }
            }
            return true;
        } catch (error) {
            console.error('Ошибка возврата монет:', error);
            return false;
        }
    }

    getStateForPlayer(playerId) {
        const myIndex = this.players.findIndex(p => p.id === playerId);
        const player = this.players[myIndex];
        
        let isMyTurnAttack = false;
        let isMyAdditionalAttackTurn = false;
        let isMyTurnDefend = false;
        
        if (this._gameFrozen) {
            isMyTurnAttack = false;
            isMyAdditionalAttackTurn = false;
            isMyTurnDefend = false;
        } else if (this.additionalAttackerIndex !== null) {
            // Фаза подкидывания от третьего игрока
            // Подкидывать может только ТРЕТИЙ игрок
            isMyAdditionalAttackTurn = (myIndex === this.additionalAttackerIndex);
            isMyTurnAttack = false;
            isMyTurnDefend = (myIndex === this.currentDefenderIndex);
        } else {
            // Обычная фаза - атакует и подкидывает АТАКУЮЩИЙ
            isMyTurnAttack = (myIndex === this.currentAttackerIndex);
            isMyTurnDefend = (myIndex === this.currentDefenderIndex);
            isMyAdditionalAttackTurn = false;
        }
        
        return {
            myHand: player ? player.hand : [],
            table: this.table,
            players: this.players.map(p => ({
                id: p.id,
                username: p.username,
                cardCount: p.hand.length
            })),
            currentAttacker: this.players[this.currentAttackerIndex]?.username || '—',
            currentDefender: this.players[this.currentDefenderIndex]?.username || '—',
            additionalAttacker: this.additionalAttackerIndex !== null ? this.players[this.additionalAttackerIndex]?.username : null,
            isMyTurnAttack: isMyTurnAttack,
            isMyTurnDefend: isMyTurnDefend,
            isMyAdditionalAttackTurn: isMyAdditionalAttackTurn,
            trumpSuit: this.trumpSuit,
            gameWinner: this._gameFrozen ? null : this.getWinner(),
            dealingComplete: this.dealingComplete,
            gameFrozen: this._gameFrozen,
            isSubRound: !!this._previousLoser,
            consecutiveInfo: Object.fromEntries(this._tournamentData.playersConsecutive),
            totalPot: this.totalPot,
            consecutiveWinsNeeded: this.consecutiveWinsNeeded
        };
    }

    broadcast() {
        if (this._gameFrozen) return;
        
        const attacker = this.players[this.currentAttackerIndex];
        const defender = this.players[this.currentDefenderIndex];
        
        if (attacker && attacker.hand.length === 0) {
            this.checkWinCondition();
            return;
        }
        
        if (defender && defender.hand.length === 0) {
            this.checkWinCondition();
            return;
        }
        
        this.players.forEach(p => {
            if (p.socket && p.socket.connected) {
                const state = this.getStateForPlayer(p.id);
                p.socket.emit('gameState', state);
            }
        });
    }
    cleanupLobbyAfterGame(lobbyId) {
        const io = require('../server');
        const lobbies = global.lobbies || new Map();
        const readyStatus = global.readyStatus || new Map();
        
        const lobby = lobbies.get(lobbyId);
        if (lobby) {
            const readyMap = readyStatus.get(lobbyId);
            if (readyMap) readyMap.clear();
            
            lobby.status = 'waiting';
            lobby.playersCount = lobby.players.length;
            
            lobby.players.forEach(player => {
                const playerSocket = io.io?.sockets?.sockets?.get(player.socketId);
                if (playerSocket && playerSocket.connected) {
                    playerSocket.currentLobby = null;
                    playerSocket.currentUsername = null;
                    playerSocket.emit('forceLeaveLobby', { message: 'Игра завершена' });
                    playerSocket.emit('lobbyLeft', { force: true });
                }
            });
            
            lobbies.delete(lobbyId);
            readyStatus.delete(lobbyId);
            
            if (io.io) io.io.emit('lobbiesList', []);
        }
    }
}



module.exports = Game;