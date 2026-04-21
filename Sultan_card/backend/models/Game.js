const { createDeck, shuffle } = require('../utils/deck');

class Game {
    constructor(players) {
        this.players = players;
        this.deck = shuffle(createDeck());
        this.trumpSuit = 'diamonds';
        this.table = [];
        this.allowedRanks = new Set();       // какие ранги можно подкидывать
        this.currentAttackerIndex = 0;
        this.currentDefenderIndex = 1;

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
    }

    // ========== ПРАВИЛА ОТБОЯ ==========
    canBeat(attackCard, defendCard) {
        // Дама всегда завершает период игры
        if (defendCard.rank === 'Q') {
            return true;
        }

        // ПИКИ БЬЮТ ТОЛЬКО ПИКИ (козырь НЕ бьёт пики)
        if (attackCard.suit === 'spades') {
            return defendCard.suit === 'spades' && defendCard.value > attackCard.value;
        }

        // Козырь (бубны) бьёт всё, что не пики
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

    // ========== АТАКА / ПОДКИД ==========
    attack(playerId, cardIndex) {
        const attacker = this.players[this.currentAttackerIndex];
        if (attacker.id !== playerId) return { success: false, error: 'Не ваш ход' };

        const card = attacker.hand[cardIndex];
        if (!card) return { success: false, error: 'Карта не найдена' };

        // Первая карта всегда можно, дальше — только разрешённые ранги
        if (this.table.length > 0 && !this.allowedRanks.has(card.rank)) {
            return { success: false, error: 'Можно подкидывать только карты того же достоинства, что уже на столе' };
        }

        attacker.hand.splice(cardIndex, 1);
        this.table.push({ type: 'attack', card });
        this.allowedRanks.add(card.rank);

        this.broadcast();
        return { success: true };
    }

    // ========== ОТБОЙ ==========
    defend(playerId, cardIndex) {
        const defender = this.players[this.currentDefenderIndex];
        if (defender.id !== playerId) return { success: false, error: 'Не ваш ход' };

        const lastAttack = this.table[this.table.length - 1];
        if (!lastAttack || lastAttack.type !== 'attack') return { success: false };

        const attackCard = lastAttack.card;
        const defendCard = defender.hand[cardIndex];

        if (this.canBeat(attackCard, defendCard)) {
            defender.hand.splice(cardIndex, 1);
            this.table.push({ type: 'defend', card: defendCard });
            this.allowedRanks.add(defendCard.rank);

            // Дама завершает период
            if (defendCard.rank === 'Q') {
                this.endBout(true);
            }

            this.broadcast();
            return { success: true };
        }

        return { success: false, error: 'Нельзя побить этой картой' };
    }

    endBout(success = true) {
        if (success) {
            this.table = [];
            this.allowedRanks.clear();
        }
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
        this.allowedRanks.clear();

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
        return { success: false };
    }

    checkWinCondition() {
        const active = this.players.filter(p => p.hand.length > 0);
        if (active.length === 1) {
            this.players.forEach(p => p.socket.emit('gameOver', { winner: active[0].username }));
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
        this.players.forEach(p => p.socket.emit('gameState', this.getStateForPlayer(p.id)));
    }
}

module.exports = Game;