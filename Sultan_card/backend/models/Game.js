const { createDeck, shuffle } = require('../utils/deck');

class Game {
    constructor(players) {
        console.log('🏗️ Создание игры с игроками:', players.map(p => p.username));
        
        this.players = players;
        this.deck = shuffle(createDeck());
        this.trumpSuit = 'diamonds';
        this.table = [];
        this.allowedRanks = new Set();
        this.currentAttackerIndex = 0;
        this.currentDefenderIndex = 1;
        this.additionalAttackerIndex = null;
        this.dealingComplete = false; // Флаг завершения раздачи

        this.dealCards();
        this.findFirstAttacker();
        
        console.log('✅ Игра создана. Козырь: ♢ БУБНЫ');
        console.log('Атакующий:', this.players[this.currentAttackerIndex]?.username);
        console.log('Защищающийся:', this.players[this.currentDefenderIndex]?.username);
    }

    // НОВЫЙ МЕТОД: Анимация раздачи карт
    startDealingAnimation() {
        console.log('🎴 Запуск анимации раздачи карт');
        
        const dealerIndex = Math.floor(Math.random() * this.players.length);
        
        const playersForAnimation = this.players.map(p => ({
            username: p.username,
            id: p.id
        }));
        
        this.players.forEach(p => {
            if (p.socket && p.socket.connected) {
                p.socket.emit('dealAnimation', {
                    players: playersForAnimation,
                    dealerIndex: dealerIndex,
                    totalCards: 36,
                    cardsPerPlayer: 12
                });
                console.log(`📨 Отправлена анимация раздачи для ${p.username}`);
            }
        });
        
        setTimeout(() => {
            this.dealingComplete = true;
            console.log('✅ Анимация раздачи завершена, начинаем игру');
            this.broadcast();
        }, 6000);
    }

    additionalAttack(playerId, cardIndex) {
        // Проверяем, что это дополнительный атакующий
        if (this.additionalAttackerIndex === null) {
            return { success: false, error: 'Сейчас нет дополнительной атаки' };
        }
        
        const attacker = this.players[this.additionalAttackerIndex];
        if (attacker.id !== playerId) {
            return { success: false, error: 'Не ваш ход для подкидывания' };
        }
        
        const card = attacker.hand[cardIndex];
        if (!card) return { success: false, error: 'Карта не найдена' };
        
        // Проверяем, можно ли подкинуть эту карту
        const ranksOnTable = new Set();
        for (const item of this.table) {
            ranksOnTable.add(item.card.rank);
        }
        
        if (!ranksOnTable.has(card.rank)) {
            return { success: false, error: 'Можно подкидывать только карты того же достоинства' };
        }
        
        // Подкидываем карту
        attacker.hand.splice(cardIndex, 1);
        this.table.push({ type: 'attack', card });
        this.allowedRanks.add(card.rank);
        
        console.log(`➕ ${attacker.username} подкидывает карту ${card.rank} ${card.suit}`);
        
        return { success: true };
    }

    endAdditionalAttack(playerId) {
        if (this.additionalAttackerIndex === null) {
            return { success: false, error: 'Нет дополнительной атаки' };
        }
        
        const attacker = this.players[this.additionalAttackerIndex];
        if (attacker.id !== playerId) {
            return { success: false, error: 'Не ваш ход' };
        }
        
        // Завершаем бой полностью
        console.log(`✅ Дополнительная атака завершена, заканчиваем бой`);
        this.endBout(true);
        
        return { success: true };
    }

    getWinner() {
        const playersWithoutCards = this.players.filter(p => p.hand.length === 0);
        const playersWithCards = this.players.filter(p => p.hand.length > 0);
        
        // Если остался 1 игрок с картами - он проиграл, остальные победили
        if (playersWithCards.length === 1 && playersWithoutCards.length === 2) {
            return playersWithoutCards.map(w => w.username).join(', ');
        }
        // Если все без карт - ничья
        if (playersWithCards.length === 0) {
            return 'Ничья - все победители!';
        }
        return null;
    }

    dealCards() {
        const cardsPerPlayer = 12;
        console.log(`📤 Раздача карт (по ${cardsPerPlayer} карт каждому)`);
        
        this.players.forEach((player, index) => {
            player.hand = this.deck.splice(0, cardsPerPlayer);
            console.log(`Игрок ${player.username} получил ${player.hand.length} карт`);
            if (player.hand.length > 0) {
                console.log(`Первые 3 карты: ${player.hand.slice(0, 3).map(c => `${c.rank}${c.suit}`).join(', ')}`);
            }
        });
        
        console.log(`В колоде осталось карт: ${this.deck.length}`);
    }

    findFirstAttacker() {
        for (let i = 0; i < this.players.length; i++) {
            const hasSixDiamonds = this.players[i].hand.some(c => c.rank === '6' && c.suit === 'diamonds');
            if (hasSixDiamonds) {
                this.currentAttackerIndex = i;
                this.currentDefenderIndex = (i + 1) % this.players.length;
                console.log(`🎯 Первый атакующий: ${this.players[i].username} (есть 6♦)`);
                return;
            }
        }
        this.currentAttackerIndex = 0;
        this.currentDefenderIndex = 1;
        console.log(`🎯 Первый атакующий (случайный): ${this.players[0].username}`);
    }

    canBeat(attackCard, defendCard) {
        // Пики бьются только пиками
        if (attackCard.suit === 'clubs') {
            return defendCard.suit === 'clubs' && defendCard.value > attackCard.value;
        }

        // Козырь (бубны) бьёт всё, кроме пик
        if (defendCard.isTrump) {
            return true;
        }

        // Если атакует козырь
        if (attackCard.isTrump) {
            return defendCard.isTrump && defendCard.value > attackCard.value;
        }

        // Обычное сравнение по масти
        return defendCard.suit === attackCard.suit && defendCard.value > attackCard.value;
    }

    attack(playerId, cardIndex) {
        const attacker = this.players[this.currentAttackerIndex];
        if (attacker.id !== playerId) return { success: false, error: 'Не ваш ход' };

        const card = attacker.hand[cardIndex];
        if (!card) return { success: false, error: 'Карта не найдена' };

        if (this.table.length > 0 && !this.allowedRanks.has(card.rank)) {
            return { success: false, error: 'Можно подкидывать только карты того же достоинства' };
        }

        attacker.hand.splice(cardIndex, 1);
        this.table.push({ type: 'attack', card });
        this.allowedRanks.add(card.rank);

        console.log(`⚔️ ${attacker.username} атакует картой ${card.rank} ${card.suit}`);
        return { success: true };
    }

    defend(playerId, cardIndex) {
        const defender = this.players[this.currentDefenderIndex];
        if (defender.id !== playerId) return { success: false, error: 'Не ваш ход' };

        // Находим последнюю неотбитую атаку
        let lastAttackIndex = -1;
        for (let i = this.table.length - 1; i >= 0; i--) {
            if (this.table[i].type === 'attack') {
                lastAttackIndex = i;
                break;
            }
        }
        
        if (lastAttackIndex === -1) {
            return { success: false, error: 'Нет карты для отбоя' };
        }

        const attackCard = this.table[lastAttackIndex].card;
        const defendCard = defender.hand[cardIndex];

        if (this.canBeat(attackCard, defendCard)) {
            defender.hand.splice(cardIndex, 1);
            this.table.push({ type: 'defend', card: defendCard });
            this.allowedRanks.add(defendCard.rank);

            console.log(`🛡️ ${defender.username} отбивается картой ${defendCard.rank} ${defendCard.suit} от ${attackCard.rank} ${attackCard.suit}`);

            // Дама завершает бой
            if (defendCard.rank === 'Q') {
                console.log(`♕ Дама завершает ход!`);
                // Завершаем бой - все карты считаются отбитыми
                this.endBout(true);
            }

            return { success: true };
        }

        return { success: false, error: 'Нельзя побить этой картой' };
    }

    endBout(success = true) {
        if (success) {
            this.table = [];
            this.allowedRanks.clear();
        } else {
            this.table = [];
            this.allowedRanks.clear();
        }
        
        // Переход хода к следующему игроку
        const oldAttackerIndex = this.currentAttackerIndex;
        this.currentAttackerIndex = this.currentDefenderIndex;
        this.currentDefenderIndex = this.getNextActivePlayer(this.currentAttackerIndex);
        this.additionalAttackerIndex = null;
        
        console.log(`🔄 Бой завершен. Ход переходит от ${this.players[oldAttackerIndex]?.username} к ${this.players[this.currentAttackerIndex]?.username}`);
        console.log(`   Новый защитник: ${this.players[this.currentDefenderIndex]?.username}`);
        
        // Проверяем, не закончилась ли игра
        this.checkWinCondition();
    }


    skipEliminatedPlayers() {
        const activePlayers = this.players.filter(p => p.hand.length > 0);
        
        if (activePlayers.length <= 1) return;
        
        // Убедимся, что атакующий и защитник - разные игроки с картами
        let attempts = 0;
        const maxAttempts = this.players.length * 2;
        
        while (attempts < maxAttempts) {
            const attacker = this.players[this.currentAttackerIndex];
            const defender = this.players[this.currentDefenderIndex];
            
            // Если атакующий без карт - передаем ход
            if (!attacker || attacker.hand.length === 0) {
                this.currentAttackerIndex = this.getNextActivePlayer(this.currentAttackerIndex);
                this.currentDefenderIndex = this.getNextActivePlayer(this.currentAttackerIndex);
                attempts++;
                continue;
            }
            
            // Если защитник без карт - ищем следующего
            if (!defender || defender.hand.length === 0) {
                this.currentDefenderIndex = this.getNextActivePlayer(this.currentDefenderIndex);
                attempts++;
                continue;
            }
            
            // Если атакующий и защитник - один и тот же игрок (для 2 игроков)
            if (this.currentAttackerIndex === this.currentDefenderIndex) {
                this.currentDefenderIndex = this.getNextActivePlayer(this.currentAttackerIndex);
                attempts++;
                continue;
            }
            
            // Все хорошо
            break;
        }
        
        console.log(`📋 После проверки: атакующий=${this.players[this.currentAttackerIndex]?.username}, защитник=${this.players[this.currentDefenderIndex]?.username}`);
    }

    getActivePlayersCount() {
        return this.players.filter(p => p.hand.length > 0).length;
    }

    takeCards(playerId) {
        const defender = this.players[this.currentDefenderIndex];
        if (defender.id !== playerId) return { success: false, error: 'Не ваш ход' };

        const takenCards = [...this.table.map(t => t.card)];
        defender.hand.push(...takenCards);
        
        console.log(`📥 ${defender.username} забирает ${takenCards.length} карт`);
        
        this.table = [];
        this.allowedRanks.clear();
        this.additionalAttackerIndex = null;

        // Защитник, который забрал карты, становится атакующим
        this.currentAttackerIndex = this.currentDefenderIndex;
        // Следующий активный игрок становится защитником
        this.currentDefenderIndex = this.getNextActivePlayer(this.currentAttackerIndex);
        
        this.checkWinCondition();
        return { success: true };
    }

    

    getNextActivePlayer(currentIndex) {
        const activePlayers = this.getActivePlayersCount();
        if (activePlayers <= 1) return currentIndex;
        
        let nextIndex = (currentIndex + 1) % this.players.length;
        let attempts = 0;
        
        while (attempts < this.players.length) {
            if (this.players[nextIndex].hand.length > 0) {
                return nextIndex;
            }
            nextIndex = (nextIndex + 1) % this.players.length;
            attempts++;
        }
        
        return currentIndex;
    }

    endTurn(playerId) {
        const currentAttacker = this.players[this.currentAttackerIndex];
        
        if (currentAttacker.id !== playerId) {
            return { success: false, error: 'Не ваш ход' };
        }
        
        // Проверяем, что ВСЕ карты на столе отбиты
        let attackCount = 0;
        let defendCount = 0;
        
        for (const item of this.table) {
            if (item.type === 'attack') attackCount++;
            if (item.type === 'defend') defendCount++;
        }
        
        if (attackCount > defendCount) {
            return { success: false, error: 'Сначала нужно отбить все карты' };
        }
        
        if (this.table.length === 0) {
            return { success: false, error: 'На столе нет карт' };
        }
        
        // Находим третьего игрока (который не атаковал и не защищался)
        const thirdPlayerIndex = [0, 1, 2].find(i => 
            i !== this.currentAttackerIndex && i !== this.currentDefenderIndex
        );
        
        const thirdPlayer = this.players[thirdPlayerIndex];
        
        // Проверяем, может ли третий игрок подкинуть карты
        const canThirdPlayerAttack = thirdPlayer && 
                                    thirdPlayer.hand.length > 0 && 
                                    this.canThirdPlayerAttack(thirdPlayer);
        
        console.log(`🔄 Завершение хода атакующего ${currentAttacker.username}`);
        console.log(`   Третий игрок: ${thirdPlayer?.username}, может атаковать: ${canThirdPlayerAttack}`);
        
        if (canThirdPlayerAttack) {
            // Даем ход третьему игроку для подкидывания
            this.additionalAttackerIndex = thirdPlayerIndex;
            this.currentAttackerIndex = thirdPlayerIndex;
            
            console.log(`✨ Третий игрок ${thirdPlayer.username} может подкинуть карты`);
            return { success: true, additionalAttack: true };
        } else {
            // Если третий игрок не может или не хочет подкидывать, завершаем бой
            console.log(`✅ Бой завершен, все карты отбиты`);
            this.endBout(true);
            return { success: true };
        }
    }

    canThirdPlayerAttack(thirdPlayer) {
        // Третий игрок может подкинуть, если у него есть карты того же достоинства, что на столе
        const ranksOnTable = new Set();
        for (const item of this.table) {
            ranksOnTable.add(item.card.rank);
        }
        
        // Проверяем, есть ли у третьего игрока карты подходящего достоинства
        for (const card of thirdPlayer.hand) {
            if (ranksOnTable.has(card.rank)) {
                return true;
            }
        }
        
        return false;
    }

    async checkWinCondition() {
        // Находим игроков с картами
        const playersWithCards = this.players.filter(p => p.hand.length > 0);
        const playersWithoutCards = this.players.filter(p => p.hand.length === 0);
        
        console.log(`📊 Статус игроков:`);
        this.players.forEach(p => {
            console.log(`   ${p.username}: ${p.hand.length} карт`);
        });
        
        // Если остался только 1 игрок с картами - он проиграл (дурак)
        if (playersWithCards.length === 1) {
            const loser = playersWithCards[0];
            const winners = playersWithoutCards;
            
            console.log(`🏆 ИГРА ОКОНЧЕНА!`);
            console.log(`   Проигравший (дурак): ${loser.username}`);
            console.log(`   Победители: ${winners.map(w => w.username).join(', ')}`);
            
            // Обновляем статистику через API
            for (const winner of winners) {
                await this.updatePlayerStats(winner.username, true);
            }
            // Проигравший получает поражение
            await this.updatePlayerStats(loser.username, false);
            
            // Отправляем gameOver всем
            this.players.forEach(p => {
                if (p.socket && p.socket.connected) {
                    const isWinner = winners.some(w => w.username === p.username);
                    p.socket.emit('gameOver', { 
                        winner: winners.map(w => w.username).join(', '),
                        isWinner: isWinner
                    });
                }
            });
            return true;
        }
        
        // Если ни у кого нет карт (все выбыли одновременно) - ничья (никто не проиграл)
        if (playersWithCards.length === 0) {
            console.log(`🤝 НИЧЬЯ! Все игроки выбыли одновременно`);
            this.players.forEach(p => {
                if (p.socket && p.socket.connected) {
                    p.socket.emit('gameOver', { winner: 'Ничья - все победители!' });
                }
            });
            return true;
        }
        
        return false;
    }

    async updatePlayerStats(username, isWinner) {
        try {
            const fetch = require('node-fetch');
            const response = await fetch('http://localhost:3000/api/auth/update-stats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, won: isWinner })
            });
            if (response.ok) {
                console.log(`✅ Статистика обновлена для ${username}: ${isWinner ? 'победа' : 'поражение'}`);
            }
        } catch (error) {
            console.error(`❌ Ошибка обновления статистики для ${username}:`, error);
        }
    }

    getStateForPlayer(playerId) {
        const myIndex = this.players.findIndex(p => p.id === playerId);
        const player = this.players[myIndex];

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
            isMyTurnAttack: myIndex === this.currentAttackerIndex,
            isMyTurnDefend: myIndex === this.currentDefenderIndex,
            isMyAdditionalAttackTurn: myIndex === this.additionalAttackerIndex,
            trumpSuit: this.trumpSuit,
            gameWinner: this.getWinner(),
            dealingComplete: this.dealingComplete
        };
    }

    broadcast() {
        console.log('📡 Рассылка состояния игры...');
        this.players.forEach(p => {
            if (p.socket && p.socket.connected) {
                const state = this.getStateForPlayer(p.id);
                p.socket.emit('gameState', state);
                console.log(`  → ${p.username}: ${state.myHand.length} карт, атакует: ${state.isMyTurnAttack}, защищается: ${state.isMyTurnDefend}`);
            }
        });
    }
}

module.exports = Game;