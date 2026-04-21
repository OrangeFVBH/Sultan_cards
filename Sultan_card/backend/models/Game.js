const { createDeck, shuffle } = require('../utils/deck');

class Game {
    constructor(players) {
        this.players = players;
        this.deck = shuffle(createDeck());
        this.trumpSuit = 'diamonds';
        this.table = [];                    // все карты на столе
        this.attackRanks = new Set();       // достоинства, которые можно подкидывать
        this.currentAttackerIndex = 0;
        this.currentDefenderIndex = 1;
        this.gameOver = false;

        this.dealCards();
        this.findFirstAttacker();
    }

    dealCards() {
        const cardsPerPlayer = this.players.length === 3 ? 12 : 6;
        this.players.forEach(player => {
            player.hand = this.deck.splice(0, cardsPerPlayer);
        });
    }

    findFirstAttacker() {
        for (let i = 0; i < this.players.length; i++) {
            if (this.players[i].hand.some(c => c.rank === '6' && c.suit === 'diamonds')) {
                this.currentAttackerIndex = i;
                this.currentDefenderIndex = (i + 1) % this.players.length;
                return;
            }
        }
        this.currentAttackerIndex = 0;
        this.currentDefenderIndex = 1;
    }

    canBeat(attackCard, defendCard) {
        if (defendCard.rank === 'Q') return true;                    // Дама завершает период

        if (defendCard.isTrump && !attackCard.isTrump) return true;
        if (attackCard.isTrump && defendCard.isTrump) 
            return defendCard.value > attackCard.value;
        if (attackCard.isTrump) return false;

        // Пики бьют ТОЛЬКО пики
        if (attackCard.suit === 'spades' || defendCard.suit === 'spades') {
            return defendCard.suit === 'spades' && defendCard.value > attackCard.value;
        }

        return defendCard.suit === attackCard.suit && defendCard.value > attackCard.value;
    }

    // АТАКА / ПОДКИДЫВАНИЕ
    attack(playerId, cardIndex) {
        const attacker = this.players[this.currentAttackerIndex];
        if (attacker.id !== playerId) 
            return { success: false, error: 'Не ваш ход' };

        const card = attacker.hand[cardIndex];
        if (!card) return { success: false, error: 'Карта не найдена' };

        // Можно подкидывать, если такое достоинство УЖЕ ЕСТЬ на столе
        if (this.table.length > 0 && !this.attackRanks.has(card.rank)) {
            return { success: false, error: 'Можно подкидывать только карты того же достоинства, что уже на столе' };
        }

        attacker.hand.splice(cardIndex, 1);
        this.table.push({ type: 'attack', card });
        this.attackRanks.add(card.rank);        // добавляем ранг в разрешённые

        this.broadcast();
        return { success: true };
    }

    // ОТБОЙ
    defend(playerId, cardIndex) {
        const defender = this.players[this.currentDefenderIndex];
        if (defender.id !== playerId) 
            return { success: false, error: 'Не ваш ход' };

        const lastAttack = this.table[this.table.length - 1];
        if (!lastAttack || lastAttack.type !== 'attack') 
            return { success: false, error: 'Нет атаки' };

        const attackCard = lastAttack.card;
        const defendCard = defender.hand[cardIndex];

        if (this.canBeat(attackCard, defendCard)) {
            defender.hand.splice(cardIndex, 1);
            this.table.push({ type: 'defend', card: defendCard });

            // Добавляем ранг отбитой карты — теперь его тоже можно подкидывать
            this.attackRanks.add(defendCard.rank);

            if (defendCard.rank === 'Q') {
                this.endBout(true);   // Дама завершает период атаки
            }

            this.broadcast();
            return { success: true };
        }

        return { success: false, error: 'Нельзя побить этой картой' };
    }

    endBout(success = true) {
        if (success) {
            this.table = [];
            this.attackRanks.clear();
        }
        // Передача хода по часовой стрелке
        this.currentAttackerIndex = this.currentDefenderIndex;
        this.currentDefenderIndex = (this.currentAttackerIndex + 1) % this.players.length;

        this.checkWinCondition();
        this.broadcast();
    }

    takeCards(playerId) {
        const defender = this.players[this.currentDefenderIndex];
        if (defender.id !== playerId) return { success: false };

        defender.hand.push(...this.table.map(t => t.card));
        this.table = [];
        this.attackRanks.clear();

        // Защитник забирает карты → ход переходит следующему игроку
        this.currentAttackerIndex = (this.currentDefenderIndex + 1) % this.players.length;
        this.currentDefenderIndex = (this.currentAttackerIndex + 1) % this.players.length;

        this.checkWinCondition();
        this.broadcast();
        return { success: true };
    }

    endTurn(playerId) {
        if (this.players[this.currentAttackerIndex].id === playerId) {
            this.endBout(true);
            return { success: true };
        }
        return { success: false, error: 'Не ваш ход' };
    }

    checkWinCondition() {
        const active = this.players.filter(p => p.hand.length > 0);
        if (active.length === 1) {
            const winner = active[0];
            this.players.forEach(p => p.socket.emit('gameOver', { winner: winner.username }));
        }
    }

    getStateForPlayer(playerId) {
        const myIndex = this.players.findIndex(p => p.id === playerId);
        const player = this.players[myIndex];

        return {
            myHand: player.hand,
            table: this.table,
            players: this.players.map(p => ({
                id: p.id,
                username: p.username,
                cardCount: p.hand.length
            })),
            currentAttacker: this.players[this.currentAttackerIndex].username,
            currentDefender: this.players[this.currentDefenderIndex].username,
            isMyTurnAttack: myIndex === this.currentAttackerIndex,
            isMyTurnDefend: myIndex === this.currentDefenderIndex,
            trumpSuit: this.trumpSuit
        };
    }

    broadcast() {
        this.players.forEach(p => {
            p.socket.emit('gameState', this.getStateForPlayer(p.id));
        });
    }
}

module.exports = Game;