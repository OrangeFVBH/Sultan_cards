class Card {
    constructor(suit, rank) {
        this.suit = suit;        // 'hearts', 'diamonds', 'clubs', 'spades'
        this.rank = rank;        // '6','7','8','9','10','J','Q','K','A'
        this.value = this.getValue(rank);
        this.isTrump = suit === 'diamonds';
    }

    getValue(rank) {
        const values = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
        return values[rank];
    }

    getImageName() {
        return `${this.rank}_of_${this.suit}.png`;
    }

    toString() {
        return `${this.rank} ${this.suit}`;
    }
}

module.exports = Card;