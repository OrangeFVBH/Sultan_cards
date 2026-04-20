const { createDeck, shuffle } = require('../utils/deck');

class Game {
    constructor(players) {
        console.log('🎮 Создание новой игры...');
        this.players = players;
        this.deck = shuffle(createDeck());
        this.trumpSuit = 'diamonds';
        this.table = [];
        this.currentAttackerIndex = 0;
        this.currentDefenderIndex = 1;
        this.attackRanks = new Set();
        this.isBoutActive = true;
        this.gameWinner = null;

        console.log(`Колода создана, карт в колоде: ${this.deck.length}`);
        this.dealCards();
        this.findFirstAttacker();
        console.log('✅ Игра создана успешно');
    }

    dealCards() {
        // Раздача по 12 карт на троих
        console.log('📤 Раздача карт...');
        this.players.forEach((player, index) => {
            const cards = this.deck.splice(0, 12);
            player.hand = cards;
            console.log(`Игрок ${player.username} получил ${cards.length} карт`);
        });
        console.log(`Осталось в колоде: ${this.deck.length} карт`);
    }

    findFirstAttacker() {
        // Первый игрок определяется наличием шестерки бубен
        for (let i = 0; i < this.players.length; i++) {
            const hasSixDiamonds = this.players[i].hand.some(c => c.rank === '6' && c.suit === 'diamonds');
            if (hasSixDiamonds) {
                this.currentAttackerIndex = i;
                this.currentDefenderIndex = (i + 1) % this.players.length;
                console.log(`🎯 Первый атакующий: ${this.players[i].username} (есть 6♦)`);
                return;
            }
        }
        // Если нет шестерки бубен - первый игрок по порядку
        this.currentAttackerIndex = 0;
        this.currentDefenderIndex = 1;
        console.log(`🎯 Первый атакующий: ${this.players[0].username} (по умолчанию)`);
    }

    canBeat(attackCard, defendCard) {
        // Дама завершает ход (не бьет, а завершает)
        if (defendCard.rank === 'Q') {
            return true;
        }

        // Если атакующая карта - дама, её нельзя побить
        if (attackCard.rank === 'Q') {
            return false;
        }

        // Пики бьются только пиками
        if (attackCard.suit === 'spades') {
            return defendCard.suit === 'spades' && defendCard.value > attackCard.value;
        }

        // Козырь (бубны) бьет все, кроме пик (пики уже обработаны)
        if (defendCard.isTrump && !attackCard.isTrump && attackCard.suit !== 'spades') {
            return true;
        }

        // Оба козыри
        if (attackCard.isTrump && defendCard.isTrump) {
            return defendCard.value > attackCard.value;
        }

        // Одна масть
        if (defendCard.suit === attackCard.suit) {
            return defendCard.value > attackCard.value;
        }

        return false;
    }

    attack(playerId, cardIndex) {
        const attacker = this.players[this.currentAttackerIndex];
        if (!attacker || attacker.id !== playerId) return { success: false, error: 'Не ваш ход' };
        if (!this.isBoutActive) return { success: false, error: 'Раунд не активен' };

        const card = attacker.hand[cardIndex];
        if (!card) return { success: false, error: 'Карта не найдена' };

        // Проверка: можно ли ходить этой картой
        if (this.table.length > 0 && !this.attackRanks.has(card.rank)) {
            return { success: false, error: 'Можно ходить только картами того же достоинства' };
        }

        attacker.hand.splice(cardIndex, 1);
        this.table.push({ type: 'attack', card, playerId: attacker.id });
        this.attackRanks.add(card.rank);
        
        console.log(`⚔️ ${attacker.username} атакует картой ${card.rank} ${card.suit}`);

        this.broadcast();
        return { success: true };
    }

    defend(playerId, cardIndex) {
        const defender = this.players[this.currentDefenderIndex];
        if (!defender || defender.id !== playerId) return { success: false, error: 'Не ваш ход' };
        if (!this.isBoutActive) return { success: false, error: 'Раунд не активен' };

        const lastAttack = this.table.filter(t => t.type === 'attack').pop();
        if (!lastAttack) return { success: false, error: 'Нет атакующей карты' };

        const attackCard = lastAttack.card;
        const defendCard = defender.hand[cardIndex];
        if (!defendCard) return { success: false, error: 'Карта не найдена' };

        if (this.canBeat(attackCard, defendCard)) {
            defender.hand.splice(cardIndex, 1);
            this.table.push({ type: 'defend', card: defendCard, playerId: defender.id });
            
            console.log(`🛡️ ${defender.username} защищается картой ${defendCard.rank} ${defendCard.suit}`);

            // Проверка на даму (завершение хода)
            if (defendCard.rank === 'Q') {
                console.log(`♕ Дама! Ход завершается!`);
                this.endBout(true);
            }

            this.broadcast();
            return { success: true };
        }

        return { success: false, error: 'Нельзя побить этой картой' };
    }

    endBout(success = true) {
        if (success) {
            console.log(`✅ Раунд завершен, стол очищается`);
            this.table = [];
            this.attackRanks.clear();
            
            // Ход переходит следующему игроку после защитника
            this.currentAttackerIndex = this.currentDefenderIndex;
            this.currentDefenderIndex = (this.currentAttackerIndex + 1) % this.players.length;
            
            console.log(`🔄 Новый атакующий: ${this.players[this.currentAttackerIndex].username}`);
            
            this.checkGameEnd();
            this.broadcast();
        }
    }

    takeCards(playerId) {
        const defender = this.players[this.currentDefenderIndex];
        if (!defender || defender.id !== playerId) return { success: false, error: 'Не ваш ход' };

        console.log(`📥 ${defender.username} забирает ${this.table.length} карт со стола`);
        
        // Защитник забирает все карты со стола
        defender.hand.push(...this.table.map(t => t.card));
        this.table = [];
        this.attackRanks.clear();

        // Ход переходит следующему игроку
        this.currentAttackerIndex = (this.currentDefenderIndex + 1) % this.players.length;
        this.currentDefenderIndex = (this.currentAttackerIndex + 1) % this.players.length;

        this.checkGameEnd();
        this.broadcast();
        return { success: true };
    }

    endTurn(playerId) {
        const attacker = this.players[this.currentAttackerIndex];
        if (attacker && attacker.id === playerId) {
            console.log(`✅ ${attacker.username} завершает ход`);
            this.endBout(true);
            return { success: true };
        }
        return { success: false, error: 'Не ваш ход' };
    }

    checkGameEnd() {
        const activePlayers = this.players.filter(p => p.hand.length > 0);
        
        if (activePlayers.length === 1) {
            const winner = this.players.find(p => p.hand.length === 0);
            if (winner) {
                console.log(`🏆 ПОБЕДИТЕЛЬ: ${winner.username}`);
                this.gameWinner = winner.username;
                this.players.forEach(p => {
                    p.socket.emit('gameOver', { winner: winner.username, losers: activePlayers.map(a => a.username) });
                });
            }
        } else if (activePlayers.length === 2 && this.deck.length > 0) {
            console.log(`📦 Осталось 2 игрока, добираем по 6 карт из колоды`);
            const remainingPlayers = activePlayers;
            remainingPlayers.forEach(player => {
                const needed = 6 - player.hand.length;
                if (needed > 0 && this.deck.length >= needed) {
                    const newCards = this.deck.splice(0, needed);
                    player.hand.push(...newCards);
                    console.log(`${player.username} добирает ${newCards.length} карт`);
                }
            });
            this.broadcast();
        }
    }

    getStateForPlayer(playerId) {
        const myIndex = this.players.findIndex(p => p.id === playerId);
        const player = this.players[myIndex];

        return {
            myHand: player.hand.map(c => ({ suit: c.suit, rank: c.rank, value: c.value, isTrump: c.isTrump })),
            table: this.table.map(t => ({ type: t.type, card: { suit: t.card.suit, rank: t.card.rank, value: t.card.value } })),
            players: this.players.map(p => ({
                id: p.id,
                username: p.username,
                cardCount: p.hand.length
            })),
            currentAttacker: this.players[this.currentAttackerIndex]?.username || null,
            currentDefender: this.players[this.currentDefenderIndex]?.username || null,
            isMyTurnAttack: myIndex === this.currentAttackerIndex,
            isMyTurnDefend: myIndex === this.currentDefenderIndex,
            trumpSuit: this.trumpSuit,
            gameWinner: this.gameWinner,
            canEndTurn: myIndex === this.currentAttackerIndex && this.table.length > 0,
            canTakeCards: myIndex === this.currentDefenderIndex && this.table.length > 0
        };
    }

    broadcast() {
        console.log(`📡 Отправка состояния игры ${this.players.length} игрокам`);
        console.log(`Текущий атакующий индекс: ${this.currentAttackerIndex}, защитник: ${this.currentDefenderIndex}`);
        
        this.players.forEach(p => {
            if (p.socket) {
                const state = this.getStateForPlayer(p.id);
                console.log(`  → отправлено ${p.username}: ${p.hand.length} карт в руке`);
                console.log(`     isMyTurnAttack: ${state.isMyTurnAttack}, isMyTurnDefend: ${state.isMyTurnDefend}`);
                p.socket.emit('gameState', state);
            } else {
                console.log(`  → у ${p.username} нет socket!`);
            }
        });
    }
}

module.exports = Game;