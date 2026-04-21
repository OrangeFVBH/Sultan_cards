const { createDeck, shuffle } = require('../utils/deck');

class Game {
    constructor(players) {
        this.players = players;
        this.deck = shuffle(createDeck());
        this.trumpSuit = 'diamonds';
        this.table = [];
        this.allowedRanks = new Set();
        this.currentAttackerIndex = 0;
        this.currentDefenderIndex = 1;
        this.additionalAttackerIndex = null;   // ← новое: для подкидывания третьим игроком

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
        // Дама теперь бьёт ТОЛЬКО по обычным правилам (как просил)
        // if (defendCard.rank === 'Q') return true;  ← УБРАНО

        // ПИКИ БЬЮТ ТОЛЬКО ПИКИ (козырь НЕ бьёт пики) — исправлено/закреплено
        if (attackCard.suit === 'clubs') {
            return defendCard.suit === 'clubs' && defendCard.value > attackCard.value;
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

        if (this.table.length > 0 && !this.allowedRanks.has(card.rank)) {
            return { success: false, error: 'Можно подкидывать только карты того же достоинства' };
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

            // Дама завершает бой ТОЛЬКО если она реально отбила карту
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
        this.additionalAttackerIndex = null;   // сбрасываем

        this.checkWinCondition();
        this.broadcast();
    }
takeCards(playerId) {
        const defender = this.players[this.currentDefenderIndex];
        if (defender.id !== playerId) return { success: false };

        defender.hand.push(...this.table.map(t => t.card));
        this.table = [];
        this.allowedRanks.clear();
        this.additionalAttackerIndex = null;

        this.currentAttackerIndex = (this.currentDefenderIndex + 1) % this.players.length;
        this.currentDefenderIndex = (this.currentAttackerIndex + 1) % this.players.length;

        this.checkWinCondition();
        this.broadcast();
        return { success: true };
    }

    // ========== ЗАВЕРШЕНИЕ ХОДА (главное исправление) ==========
    endTurn(playerId) {
        if (this.players[this.currentAttackerIndex].id !== playerId) {
            return { success: false, error: 'Не ваш ход' };
        }

        if (this.additionalAttackerIndex === null) {
            // Первый атакующий закончил → даём ход третьему игроку (бездействующему)
            const idleIndex = [0, 1, 2].find(i => 
                i !== this.currentAttackerIndex && i !== this.currentDefenderIndex
            );
            this.additionalAttackerIndex = idleIndex;
            this.currentAttackerIndex = idleIndex;   // теперь он атакует
            this.broadcast();
            return { success: true };
        } else {
            // Дополнительный атакующий закончил → бой полностью заканчивается
            this.endBout(true);
            this.additionalAttackerIndex = null;
            return { success: true };
        }
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