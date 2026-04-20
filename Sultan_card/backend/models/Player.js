class Player {
    constructor(id, username, socket) {
        this.id = id;
        this.username = username;
        this.socket = socket;
        this.hand = [];
        this.isReady = false;
        this.wins = 0;
        this.losses = 0;
    }
    
    getCardCount() {
        return this.hand.length;
    }
    
    hasCard(rank, suit) {
        return this.hand.some(c => c.rank === rank && c.suit === suit);
    }
    
    removeCard(index) {
        if (index >= 0 && index < this.hand.length) {
            return this.hand.splice(index, 1)[0];
        }
        return null;
    }
    
    addCard(card) {
        this.hand.push(card);
    }
    
    addCards(cards) {
        this.hand.push(...cards);
    }
    
    clearHand() {
        this.hand = [];
    }
}

module.exports = Player;