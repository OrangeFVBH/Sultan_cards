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

        this.dealCards();
        this.findFirstAttacker();
        
        console.log('✅ Игра создана. Козырь: ♢ БУБНЫ');
        console.log('Атакующий:', this.players[this.currentAttackerIndex]?.username);
        console.log('Защищающийся:', this.players[this.currentDefenderIndex]?.username);
    }

    dealCards() {
        const cardsPerPlayer = 12; // 36 карт / 3 игрока = 12 карт каждому
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
        // Если никто не имеет 6♦, выбираем случайного
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

        const lastAttack = this.table[this.table.length - 1];
        if (!lastAttack || lastAttack.type !== 'attack') return { success: false, error: 'Нет карты для отбоя' };

        const attackCard = lastAttack.card;
        const defendCard = defender.hand[cardIndex];

        if (this.canBeat(attackCard, defendCard)) {
            defender.hand.splice(cardIndex, 1);
            this.table.push({ type: 'defend', card: defendCard });
            this.allowedRanks.add(defendCard.rank);

            console.log(`🛡️ ${defender.username} отбивается картой ${defendCard.rank} ${defendCard.suit}`);

            // Дама завершает бой
            if (defendCard.rank === 'Q') {
                console.log(`♕ Дама завершает ход!`);
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
        }
        this.currentAttackerIndex = this.currentDefenderIndex;
        this.currentDefenderIndex = (this.currentAttackerIndex + 1) % this.players.length;
        this.additionalAttackerIndex = null;

        console.log(`🔄 Ход переходит к ${this.players[this.currentAttackerIndex].username}`);

        this.checkWinCondition();
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

        this.currentAttackerIndex = (this.currentDefenderIndex + 1) % this.players.length;
        this.currentDefenderIndex = (this.currentAttackerIndex + 1) % this.players.length;

        this.checkWinCondition();
        return { success: true };
    }

    endTurn(playerId) {
        if (this.players[this.currentAttackerIndex].id !== playerId) {
            return { success: false, error: 'Не ваш ход' };
        }

        if (this.additionalAttackerIndex === null) {
            // Первый атакующий закончил → даём ход третьему игроку
            const idleIndex = [0, 1, 2].find(i => 
                i !== this.currentAttackerIndex && i !== this.currentDefenderIndex
            );
            this.additionalAttackerIndex = idleIndex;
            this.currentAttackerIndex = idleIndex;
            console.log(`🔄 Дополнительный ход для ${this.players[idleIndex].username}`);
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
            const winner = active[0];
            console.log(`🏆 ИГРА ОКОНЧЕНА! Победитель: ${winner.username}`);
            this.players.forEach(p => {
                p.socket.emit('gameOver', { winner: winner.username });
            });
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
            trumpSuit: this.trumpSuit,
            gameWinner: this.checkWinner()
        };
    }
    
    checkWinner() {
        const active = this.players.filter(p => p.hand.length > 0);
        if (active.length === 1) {
            return active[0].username;
        }
        return null;
    }

    broadcast() {
        console.log('📡 Рассылка состояния игры...');
        this.players.forEach(p => {
            const state = this.getStateForPlayer(p.id);
            p.socket.emit('gameState', state);
            console.log(`  → ${p.username}: ${state.myHand.length} карт, атакует: ${state.isMyTurnAttack}, защищается: ${state.isMyTurnDefend}`);
        });
    }
    async updateGameStats() {
        const active = this.players.filter(p => p.hand.length > 0);
        if (active.length === 1) {
            const winner = active[0];
            const losers = this.players.filter(p => p.hand.length === 0);
            
            // Обновляем статистику победителя
            try {
                const fetch = require('node-fetch');
                await fetch('http://localhost:3000/api/auth/update-stats', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: winner.username, won: true })
                });
                
                // Обновляем статистику проигравших
                for (const loser of losers) {
                    await fetch('http://localhost:3000/api/auth/update-stats', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: loser.username, won: false })
                    });
                }
                
                console.log(`📊 Статистика обновлена в MongoDB: победитель ${winner.username}`);
            } catch (error) {
                console.error('Ошибка обновления статистики:', error);
            }
        }
    }

    // В checkWinCondition замените на:
    checkWinCondition() {
        const active = this.players.filter(p => p.hand.length > 0);
        if (active.length === 1) {
            const winner = active[0];
            console.log(`🏆 ИГРА ОКОНЧЕНА! Победитель: ${winner.username}`);
            
            // Обновляем статистику в MongoDB
            this.updateGameStats();
            
            this.players.forEach(p => {
                p.socket.emit('gameOver', { winner: winner.username });
            });
        }
    }
}

module.exports = Game;