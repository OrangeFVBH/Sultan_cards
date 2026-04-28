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
        this.dealingComplete = false;

        this.dealCards();
        this.findFirstAttacker();
        
        console.log('✅ Игра создана. Козырь: ♢ БУБНЫ');
        console.log('Атакующий:', this.players[this.currentAttackerIndex]?.username);
        console.log('Защищающийся:', this.players[this.currentDefenderIndex]?.username);
    }

    startDealingAnimation() {
        console.log('🎴 Запуск анимации раздачи карт');
        
        const dealerIndex = Math.floor(Math.random() * this.players.length);
        
        const playersForAnimation = this.players.map(p => ({
            username: p.username,
            id: p.id
        }));
        
        // Отправляем событие анимации всем игрокам
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
        
        // Увеличиваем время до 6 секунд
        setTimeout(() => {
            this.dealingComplete = true;
            console.log('✅ Анимация раздачи завершена, отправляем карты игрокам');
            // Отправляем состояние ВСЕМ игрокам
            this.broadcast();
        }, 6000);
    }

    additionalAttack(playerId, cardIndex) {
        // Проверяем, есть ли активная дополнительная атака
        if (this.additionalAttackerIndex === null) {
            const possibleAttacker = this.getNextPlayerCounterClockwise(this.currentDefenderIndex);
            if (possibleAttacker !== this.currentAttackerIndex && 
                possibleAttacker !== this.currentDefenderIndex &&
                this.players[possibleAttacker].hand.length > 0) {
                this.additionalAttackerIndex = possibleAttacker;
            } else {
                return { success: false, error: 'Нет игрока для дополнительной атаки' };
            }
        }
        
        // Только третий игрок (который подкидывает) может атаковать
        const allowedAttacker = this.players[this.additionalAttackerIndex];
        if (allowedAttacker.id !== playerId) {
            return { success: false, error: 'Только игрок, подкидывающий карты, может атаковать' };
        }
        
        // Проверяем, что у игрока есть карты
        if (allowedAttacker.hand.length === 0) {
            return { success: false, error: 'У вас нет карт' };
        }
        
        const card = allowedAttacker.hand[cardIndex];
        if (!card) return { success: false, error: 'Карта не найдена' };
        
        // Проверяем, можно ли подкинуть эту карту (ранг должен быть на столе)
        const ranksOnTable = new Set();
        for (const item of this.table) {
            ranksOnTable.add(item.card.rank);
        }
        
        if (!ranksOnTable.has(card.rank)) {
            return { success: false, error: 'Можно подкидывать только карты того же достоинства, что уже есть на столе' };
        }
        
        // Убираем карту из руки
        allowedAttacker.hand.splice(cardIndex, 1);
        
        // Добавляем на стол как атаку
        this.table.push({ type: 'attack', card });
        this.allowedRanks.add(card.rank);
        
        console.log(`➕ ${allowedAttacker.username} подкидывает карту ${card.rank} ${card.suit} (осталось карт: ${allowedAttacker.hand.length})`);
        
        // Проверяем, не закончились ли у него карты
        if (allowedAttacker.hand.length === 0) {
            console.log(`🏆 ${allowedAttacker.username} избавился от всех карт!`);
        }
        
        this.checkWinCondition();
        
        return { success: true };
    }

    endAdditionalAttack(playerId) {
        // Проверяем, что есть дополнительная атака
        if (this.additionalAttackerIndex === null) {
            return { success: false, error: 'Нет дополнительной атаки' };
        }
        
        const additionalAttacker = this.players[this.additionalAttackerIndex];
        
        // Проверяем, что игрок имеет право завершить подкид
        if (additionalAttacker.id !== playerId) {
            return { success: false, error: 'Не ваш ход' };
        }
        
        console.log(`✅ ${additionalAttacker.username} завершает подкидывание карт`);
        
        // Завершаем бой - атакующим становится бывший защитник
        // Защитником становится следующий игрок
        const oldDefender = this.players[this.currentDefenderIndex];
        
        this.table = [];
        this.allowedRanks.clear();
        
        // Атакующим становится бывший защитник
        this.currentAttackerIndex = this.currentDefenderIndex;
        
        // Следующий игрок после бывшего защитника становится новым защитником
        this.currentDefenderIndex = this.getNextActivePlayer(this.currentAttackerIndex);
        
        // Сбрасываем дополнительного атакующего
        this.additionalAttackerIndex = null;
        
        console.log(`🔄 После подкидывания:`);
        console.log(`   Новый атакующий: ${this.players[this.currentAttackerIndex]?.username} (карт: ${this.players[this.currentAttackerIndex]?.hand.length})`);
        console.log(`   Новый защитник: ${this.players[this.currentDefenderIndex]?.username} (карт: ${this.players[this.currentDefenderIndex]?.hand.length})`);
        
        this.checkWinCondition();
        
        return { success: true };
    }

    getWinner() {
        const playersWithoutCards = this.players.filter(p => p.hand.length === 0);
        const playersWithCards = this.players.filter(p => p.hand.length > 0);
        
        if (playersWithCards.length === 1 && playersWithoutCards.length === 2) {
            return playersWithCards[0].username; // Оставшийся с картами - дурак
        }
        if (playersWithCards.length === 1 && playersWithoutCards.length >= 1) {
            return playersWithoutCards.map(w => w.username).join(', ');
        }
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
        });
        
        console.log(`В колоде осталось карт: ${this.deck.length}`);
    }

    findFirstAttacker() {
        for (let i = 0; i < this.players.length; i++) {
            const hasSixDiamonds = this.players[i].hand.some(c => c.rank === '6' && c.suit === 'diamonds');
            if (hasSixDiamonds) {
                this.currentAttackerIndex = i;
                this.currentDefenderIndex = this.getNextActivePlayer(i);
                console.log(`🎯 Первый атакующий: ${this.players[i].username} (есть 6♦)`);
                return;
            }
        }
        this.currentAttackerIndex = 0;
        this.currentDefenderIndex = this.getNextActivePlayer(0);
        console.log(`🎯 Первый атакующий (случайный): ${this.players[0].username}`);
    }

    canBeat(attackCard, defendCard) {
        // Пики бьются только пиками
        if (attackCard.suit === 'spades') {
            return defendCard.suit === 'spades' && defendCard.value > attackCard.value;
        }

        // Козырь бьёт всё
        if (defendCard.isTrump) {
            // Если атака тоже козырь, то нужен старший козырь
            if (attackCard.isTrump) {
                return defendCard.value > attackCard.value;
            }
            return true;
        }

        // Обычная карта бьётся картой той же масти, но старше
        return defendCard.suit === attackCard.suit && defendCard.value > attackCard.value;
    }

    attack(playerId, cardIndex) {
        const attacker = this.players[this.currentAttackerIndex];
        if (attacker.id !== playerId) return { success: false, error: 'Не ваш ход' };
        
        // Проверяем, что у игрока есть карты
        if (attacker.hand.length === 0) {
            return { success: false, error: 'У вас нет карт' };
        }

        const card = attacker.hand[cardIndex];
        if (!card) return { success: false, error: 'Карта не найдена' };

        // Если это первая атака, можно ходить любой картой
        if (this.table.length > 0 && !this.allowedRanks.has(card.rank)) {
            return { success: false, error: 'Можно подкидывать только карты того же достоинства' };
        }

        attacker.hand.splice(cardIndex, 1);
        this.table.push({ type: 'attack', card });
        this.allowedRanks.add(card.rank);

        console.log(`⚔️ ${attacker.username} атакует картой ${card.rank} ${card.suit} (осталось карт: ${attacker.hand.length})`);
        
        // Проверяем, не выиграл ли атакующий
        if (attacker.hand.length === 0) {
            console.log(`🏆 ${attacker.username} избавился от всех карт!`);
        }
        this.checkWinCondition();
        
        return { success: true };
    }

    defend(playerId, cardIndex) {
        const defender = this.players[this.currentDefenderIndex];
        if (defender.id !== playerId) return { success: false, error: 'Не ваш ход' };
        
        // Проверяем, что у игрока есть карты
        if (defender.hand.length === 0) {
            return { success: false, error: 'У вас нет карт' };
        }

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

            console.log(`🛡️ ${defender.username} отбивается картой ${defendCard.rank} ${defendCard.suit} (осталось карт: ${defender.hand.length})`);

            // Дама завершает бой
            if (defendCard.rank === 'Q') {
                console.log(`♕ Дама завершает ход!`);
                this.endBout(true);
            }
            
            // Проверяем, не выиграл ли защитник
            if (defender.hand.length === 0) {
                console.log(`🏆 ${defender.username} избавился от всех карт!`);
            }
            this.checkWinCondition();

            return { success: true };
        }

        return { success: false, error: 'Нельзя побить этой картой' };
    }

    endBout(success = true) {
        this.table = [];
        this.allowedRanks.clear();
        
        // В Дураке: после завершения боя атакующим становится следующий игрок по ЧАСОВОЙ
        // от предыдущего атакующего
        const oldAttackerIndex = this.currentAttackerIndex;
        
        // Новый атакующий = следующий по ЧАСОВОЙ от старого атакующего
        this.currentAttackerIndex = this.getNextPlayerClockwise(oldAttackerIndex);
        
        // Новый защитник = следующий по ЧАСОВОЙ от нового атакующего
        this.currentDefenderIndex = this.getNextPlayerClockwise(this.currentAttackerIndex);
        
        // Сбрасываем дополнительного атакующего
        this.additionalAttackerIndex = null;
        
        console.log(`🔄 Бой завершен.`);
        console.log(`   Новый атакующий (по часовой): ${this.players[this.currentAttackerIndex]?.username}`);
        console.log(`   Новый защитник: ${this.players[this.currentDefenderIndex]?.username}`);
        
        this.checkWinCondition();
    }

    getNextActivePlayer(currentIndex) {
        const activePlayers = this.players.filter(p => p.hand.length > 0).length;
        
        // Если остался только 1 активный игрок
        if (activePlayers <= 1) return currentIndex;
        
        let nextIndex = (currentIndex + 1) % this.players.length;
        let attempts = 0;
        
        while (attempts < this.players.length) {
            const player = this.players[nextIndex];
            // Пропускаем игроков без карт и не можем атаковать сами себя
            if (player && player.hand.length > 0 && nextIndex !== currentIndex) {
                return nextIndex;
            }
            nextIndex = (nextIndex + 1) % this.players.length;
            attempts++;
        }
        
        return currentIndex;
    }

    getClockwiseOrder(startIndex) {
        const result = [];
        for (let i = 0; i < this.players.length; i++) {
            result.push((startIndex + i) % this.players.length);
        }
        return result;
    }

    getNextPlayerClockwise(currentIndex) {
        const activePlayers = this.players.filter(p => p.hand.length > 0).length;
        if (activePlayers <= 1) return currentIndex;
        
        // Идем ПО ЧАСОВОЙ: индекс +1
        let nextIndex = (currentIndex + 1) % this.players.length;
        let attempts = 0;
        
        while (attempts < this.players.length) {
            const player = this.players[nextIndex];
            if (player && player.hand.length > 0) {
                return nextIndex;
            }
            nextIndex = (nextIndex + 1) % this.players.length;
            attempts++;
        }
        return currentIndex;
    }

    getPreviousPlayerClockwise(currentIndex) {
        const activePlayers = this.players.filter(p => p.hand.length > 0).length;
        if (activePlayers <= 1) return currentIndex;
        
        let prevIndex = (currentIndex + 1) % this.players.length;
        let attempts = 0;
        
        while (attempts < this.players.length) {
            const player = this.players[prevIndex];
            if (player && player.hand.length > 0) {
                return prevIndex;
            }
            prevIndex = (prevIndex + 1) % this.players.length;
            attempts++;
        }
        return currentIndex;
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

        // После взятия карт: ход переходит к следующему по ЧАСОВОЙ после защитника
        this.currentAttackerIndex = this.getNextPlayerClockwise(this.currentDefenderIndex);
        this.currentDefenderIndex = this.getNextPlayerClockwise(this.currentAttackerIndex);
        
        console.log(`🔄 После взятия карт. Атакующий: ${this.players[this.currentAttackerIndex]?.username}`);
        console.log(`   Защитник: ${this.players[this.currentDefenderIndex]?.username}`);
        
        this.checkWinCondition();
        return { success: true };
    }

    endTurn(playerId) {
        const currentAttacker = this.players[this.currentAttackerIndex];
        
        if (!currentAttacker || currentAttacker.id !== playerId) {
            return { success: false, error: 'Не ваш ход' };
        }
        
        if (this.table.length === 0) {
            return { success: false, error: 'На столе нет карт' };
        }
        
        let attackCount = 0;
        let defendCount = 0;
        
        for (const item of this.table) {
            if (item.type === 'attack') attackCount++;
            if (item.type === 'defend') defendCount++;
        }
        
        if (attackCount > defendCount) {
            return { success: false, error: 'Сначала нужно отбить все карты' };
        }
        
        console.log(`🔄 ${currentAttacker.username} завершает ход. Атак: ${attackCount}, защит: ${defendCount}`);
        
        // Ищем третьего игрока (не атакующий и не защитник)
        let thirdPlayerIndex = -1;
        for (let i = 0; i < this.players.length; i++) {
            if (i !== this.currentAttackerIndex && i !== this.currentDefenderIndex) {
                if (this.players[i].hand.length > 0) {
                    thirdPlayerIndex = i;
                    break;
                }
            }
        }
        
        const thirdPlayer = thirdPlayerIndex !== -1 ? this.players[thirdPlayerIndex] : null;
        
        // Проверяем, может ли третий игрок подкинуть карты
        if (thirdPlayer && thirdPlayer.hand.length > 0 && this.canThirdPlayerAttack(thirdPlayer)) {
            // Активируем режим дополнительной атаки для третьего игрока
            this.additionalAttackerIndex = thirdPlayerIndex;
            
            // ВАЖНО: currentAttackerIndex НЕ МЕНЯЕТСЯ!
            // Атакующий остается на месте, но больше не может атаковать
            // Потому что isMyTurnAttack теперь false для него (из-за additionalAttackerIndex !== null)
            
            console.log(`✨ Игрок ${thirdPlayer.username} может подкинуть карты`);
            console.log(`   Изначальный атакующий ${currentAttacker.username} больше НЕ МОЖЕТ атаковать`);
            console.log(`   Режим дополнительной атаки активирован для ${thirdPlayer.username}`);
            
            return { success: true, additionalAttack: true };
        }
        
        // Если третий игрок не может подкинуть - завершаем бой
        console.log(`❌ Третий игрок не может подкинуть. Завершаем бой...`);
        this.endBout(true);
        return { success: true, additionalAttack: false };
    }


    getThirdPlayerIndex() {
        for (let i = 0; i < this.players.length; i++) {
            if (i !== this.currentAttackerIndex && i !== this.currentDefenderIndex) {
                if (this.players[i].hand.length > 0) {
                    return i;
                }
            }
        }
        return -1;
    }

    canThirdPlayerAttack(thirdPlayer) {
        const ranksOnTable = new Set();
        for (const item of this.table) {
            ranksOnTable.add(item.card.rank);
        }
        
        for (const card of thirdPlayer.hand) {
            if (ranksOnTable.has(card.rank)) {
                return true;
            }
        }
        
        return false;
    }

    async checkWinCondition() {
        const playersWithCards = this.players.filter(p => p.hand.length > 0);
        const playersWithoutCards = this.players.filter(p => p.hand.length === 0);
        
        console.log(`📊 Статус игроков:`);
        this.players.forEach(p => {
            console.log(`   ${p.username}: ${p.hand.length} карт`);
        });
        
        // Если остался только 1 игрок с картами - он дурак
        if (playersWithCards.length === 1 && playersWithoutCards.length >= 1) {
            const loser = playersWithCards[0];
            const winners = playersWithoutCards;
            
            console.log(`🏆 ИГРА ОКОНЧЕНА!`);
            console.log(`   Дурак: ${loser.username}`);
            console.log(`   Победители: ${winners.map(w => w.username).join(', ')}`);
            
            // Обновляем статистику
            for (const winner of winners) {
                await this.updatePlayerStats(winner.username, true);
            }
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
        
        // Если ни у кого нет карт - ничья
        if (playersWithCards.length === 0) {
            console.log(`🤝 НИЧЬЯ! Все игроки выбыли`);
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

    getNextPlayerCounterClockwise(currentIndex) {
        const activePlayers = this.players.filter(p => p.hand.length > 0).length;
        if (activePlayers <= 1) return currentIndex;
        
        // Идем ПРОТИВ часовой: индекс -1 (уменьшаем)
        let nextIndex = (currentIndex - 1 + this.players.length) % this.players.length;
        let attempts = 0;
        
        while (attempts < this.players.length) {
            const player = this.players[nextIndex];
            if (player && player.hand.length > 0) {
                return nextIndex;
            }
            nextIndex = (nextIndex - 1 + this.players.length) % this.players.length;
            attempts++;
        }
        return currentIndex;
    }

    getStateForPlayer(playerId) {
        const myIndex = this.players.findIndex(p => p.id === playerId);
        const player = this.players[myIndex];

        // Для каждого игрока определяем его "визуальное" положение
        // Порядок по часовой стрелке от меня: я -> next -> next
        
        let isMyTurnAttack = false;
        let isMyAdditionalAttackTurn = false;
        
        if (this.additionalAttackerIndex !== null) {
            isMyAdditionalAttackTurn = (myIndex === this.additionalAttackerIndex);
            isMyTurnAttack = false;
        } else {
            isMyTurnAttack = (myIndex === this.currentAttackerIndex);
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
            // Используем индексы напрямую — клиент сам переупорядочит для отображения
            currentAttacker: this.players[this.currentAttackerIndex]?.username || '—',
            currentDefender: this.players[this.currentDefenderIndex]?.username || '—',
            additionalAttacker: this.additionalAttackerIndex !== null ? this.players[this.additionalAttackerIndex]?.username : null,
            isMyTurnAttack: isMyTurnAttack,
            isMyTurnDefend: (myIndex === this.currentDefenderIndex),
            isMyAdditionalAttackTurn: isMyAdditionalAttackTurn,
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
                console.log(`  → ${p.username}: ${state.myHand.length} карт`);
            }
        });
    }
}

module.exports = Game;