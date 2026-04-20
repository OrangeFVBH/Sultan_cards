const Card = require('../models/Card');

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const SUIT_NAMES = {
    'hearts': '♥',
    'diamonds': '♢',
    'clubs': '♣',
    'spades': '♠'
};

function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push(new Card(suit, rank));
        }
    }
    return deck;
}

function shuffle(deck) {
    // Алгоритм Фишера-Йетса для настоящего перемешивания
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function getCardImage(card) {
    return `/cards/${card.rank}_of_${card.suit}.png`;
}

function getCardSymbol(card) {
    return `${card.rank}${SUIT_NAMES[card.suit]}`;
}

module.exports = { 
    createDeck, 
    shuffle, 
    getCardImage, 
    getCardSymbol,
    SUITS, 
    RANKS,
    SUIT_NAMES 
};