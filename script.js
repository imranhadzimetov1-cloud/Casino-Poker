const PLAYERS_COUNT = 5; // 1 игрок + 4 бота
let players = [];
let deck = [];
let boardCards = [];
let pot = 0;
let currentWager = 0;
let phase = 'preflop'; 
let activeTurn = 0;
let betsInRound = 0;
const blinds = 20;

function initGame() {
    players = [
        { id: 0, name: "Вы", chips: 10000, bet: 0, cards: [], folded: false, isAllIn: false, isBot: false }
    ];
    for (let i = 1; i < PLAYERS_COUNT; i++) {
        players.push({
            id: i,
            name: `Бот ${i}`,
            chips: 10000,
            bet: 0,
            cards: [],
            folded: false,
            isAllIn: false,
            isBot: true
        });
    }
}

function createDeck() {
    const suits = ['♥', '♦', '♣', '♠'];
    const vals = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    deck = [];
    for (let s of suits) {
        for (let v of vals) {
            let color = (s === '♥' || s === '♦') ? 'red' : 'black';
            let str = v <= 10 ? v : {11:'J', 12:'Q', 13:'K', 14:'A'}[v];
            deck.push({ suit: s, val: v, str: str, color: color });
        }
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function getCardHTML(card, hidden = false, animate = false) {
    const animClass = animate ? 'animated-deal' : '';
    if (hidden) return `<div class="card hidden ${animClass}"></div>`;
    return `<div class="card ${card.color} ${animClass}">
                <span class="suit-top">${card.str}${card.suit}</span>
                <span class="suit-bottom">${card.str}${card.suit}</span>
            </div>`;
}

async function startHand() {
    createDeck();
    boardCards = [];
    pot = 0;
    currentWager = blinds;
    phase = 'preflop';
    betsInRound = 0;

    players.forEach(p => {
        p.cards = [];
        p.bet = 0;
        p.folded = p.chips <= 0;
        p.isAllIn = false;
    });

    placeBet(players[1], blinds / 2);
    placeBet(players[2], blinds);

    updateUI();
    await animateDealing();

    activeTurn = 3 % PLAYERS_COUNT; 
    processTurn();
}

async function animateDealing() {
    for (let round = 0; round < 2; round++) {
        for (let i = 0; i < PLAYERS_COUNT; i++) {
            if (!players[i].folded) {
                players[i].cards.push(deck.pop());
                renderCards(true);
                await new Promise(res => setTimeout(res, 120));
            }
        }
    }
}

function placeBet(player, amount) {
    let actual = Math.min(amount, player.chips);
    player.chips -= actual;
    player.bet += actual;
    pot += actual;

    if (player.chips === 0 && actual > 0) {
        player.isAllIn = true;
    }
}

function renderCards(isDealing = false) {
    const userDiv = document.getElementById('user-cards');
    userDiv.innerHTML = players[0].cards.map(c => getCardHTML(c, false, isDealing)).join('');

    for (let i = 1; i < PLAYERS_COUNT; i++) {
        const botCardsDiv = document.querySelector(`#bot-${i-1} .cards`);
        if (players[i].folded) {
            botCardsDiv.innerHTML = '';
        } else {
            let cardsHTML = '';
            for (let c = 0; c < players[i].cards.length; c++) {
                cardsHTML += getCardHTML(null, true, isDealing);
            }
            botCardsDiv.innerHTML = cardsHTML;
        }
    }
    document.getElementById('board').innerHTML = boardCards.map(c => getCardHTML(c, false, isDealing)).join('');
}

function updateUI() {
    document.getElementById('pot').innerText = pot;
    document.getElementById('user-chips').innerText = players[0].chips;
    document.getElementById('user-bet').innerText = players[0].bet;

    for (let i = 1; i < PLAYERS_COUNT; i++) {
        const botElem = document.getElementById(`bot-${i-1}`);
        botElem.querySelector('.chips').innerText = players[i].chips;
        botElem.querySelector('.bet').innerText = players[i].bet;
        if (players[i].folded) botElem.classList.add('folded');
        else botElem.classList.remove('folded');
    }

    const names = {preflop: 'Префлоп', flop: 'Флоп', turn: 'Тёрн', river: 'Ривер'};
    document.getElementById('game-phase').innerText = names[phase];
}

function evaluatePreflopHand(cards) {
    if (!cards || cards.length < 2) return 0;
    let c1 = cards[0].val;
    let c2 = cards[1].val;
    let isPair = c1 === c2;
    let isSuited = cards[0].suit === cards[1].suit;
    let highCard = Math.max(c1, c2);

    if (isPair) return c1 * 2 + 20; 
    let score = highCard + (isSuited ? 3 : 0);
    if (Math.abs(c1 - c2) === 1) score += 2;
    return score;
}

// Умная логика принятия решений для ботов
function botDecision(bot) {
    let toCall = currentWager - bot.bet;
    let handScore = evaluatePreflopHand(bot.cards);

    if (boardCards.length >= 3) {
        let evalRes = evaluateHand(bot.cards, boardCards);
        handScore = evalRes.score / 10000;
    }

    // Инициатива пойти All-In от самого бота
    if (handScore >= 35 || (handScore > 20 && Math.random() < 0.1)) {
        return { action: 'allin' };
    }

    // Ответ бота на ALL-IN (или очень крупную ставку)
    if (toCall >= bot.chips) {
        if (boardCards.length === 0) {
            let c1 = bot.cards[0].val;
            let c2 = bot.cards[1].val;
            let isPair = c1 === c2;
            let hasBigCard = (c1 >= 12 || c2 >= 12);

            // Коллируем All-In при паре, высоком значении карт или 20% лудомании
            if (isPair || hasBigCard || Math.random() < 0.20) {
                return { action: 'call' };
            }
            return { action: 'fold' };
        } else {
            if (handScore >= 10 || Math.random() < 0.15) { 
                return { action: 'call' };
            }
            return { action: 'fold' };
        }
    }

    // Обычная логика ставок
    if (toCall === 0) {
        if (handScore > 18 && Math.random() < 0.35) {
            return { action: 'raise', amount: 30 };
        }
        return { action: 'check' };
    }

    if (toCall > 0) {
        if (handScore < 8 && toCall > blinds) {
            return { action: 'fold' };
        }
        if (handScore > 24 && Math.random() < 0.3) {
            return { action: 'raise', amount: 50 };
        }
        return { action: 'call' };
    }

    return { action: 'call' };
}

function processTurn() {
    let activePlayers = players.filter(p => !p.folded);
    
    if (activePlayers.length === 1) {
        endHand(activePlayers[0], "Все остальные сбросили карты.");
        return;
    }

    let canActPlayers = activePlayers.filter(p => !p.isAllIn);
    let allMatched = activePlayers.every(p => p.bet === currentWager || p.isAllIn);

    if ((betsInRound >= activePlayers.length && allMatched) || (canActPlayers.length <= 1 && allMatched)) {
        nextPhase();
        return;
    }

    let p = players[activeTurn];

    if (p.folded || p.isAllIn) {
        activeTurn = (activeTurn + 1) % PLAYERS_COUNT;
        processTurn();
        return;
    }

    if (!p.isBot) {
        document.getElementById('controls').classList.remove('disabled');
        let toCall = currentWager - p.bet;
        document.getElementById('btn-check-call').innerText = toCall > 0 ? `Колл (${Math.min(toCall, p.chips)})` : 'Чек';
    } else {
        document.getElementById('controls').classList.add('disabled');
        setTimeout(() => {
            let decision = botDecision(p);
            let statusText = "";

            if (decision.action === 'allin') {
                placeBet(p, p.chips);
                if (p.bet > currentWager) currentWager = p.bet;
                statusText = "ALL IN! 💥";
            } else if (decision.action === 'fold') {
                p.folded = true;
                statusText = "Фолд";
            } else if (decision.action === 'raise') {
                let raiseAmt = (currentWager - p.bet) + decision.amount;
                placeBet(p, raiseAmt);
                currentWager = p.bet;
                statusText = `Рейз (${p.bet})`;
            } else {
                let toCall = currentWager - p.bet;
                if (toCall > 0) {
                    placeBet(p, toCall);
                    statusText = p.isAllIn ? "ALL IN!" : "Колл";
                } else {
                    statusText = "Чек";
                }
            }

            betsInRound++;
            showBubble(p.id, statusText);
            updateUI();
            renderCards(false);
            
            activeTurn = (activeTurn + 1) % PLAYERS_COUNT;
            processTurn();
        }, 700);
    }
}

function showBubble(playerId, text) {
    let el;
    if (playerId === 0) el = document.getElementById('user-status');
    else el = document.querySelector(`#bot-${playerId-1} .status-bubble`);
    
    el.innerText = text;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 1400);
}

function nextPhase() {
    players.forEach(p => p.bet = 0);
    currentWager = 0;
    activeTurn = 0;
    betsInRound = 0;

    if (phase === 'preflop') {
        phase = 'flop';
        boardCards.push(deck.pop(), deck.pop(), deck.pop());
    } else if (phase === 'flop') {
        phase = 'turn';
        boardCards.push(deck.pop());
    } else if (phase === 'turn') {
        phase = 'river';
        boardCards.push(deck.pop());
    } else {
        showdown();
        return;
    }

    updateUI();
    renderCards(true);
    processTurn();
}

// Назначение кнопок
document.getElementById('btn-check-call').onclick = () => {
    let p = players[0];
    let toCall = currentWager - p.bet;
    if (toCall > 0) placeBet(p, toCall);
    betsInRound++;
    activeTurn = (activeTurn + 1) % PLAYERS_COUNT;
    processTurn();
};

document.getElementById('btn-raise').onclick = () => {
    let p = players[0];
    let raiseVal = parseInt(document.getElementById('raise-amount').value) || 20;
    let toCall = currentWager - p.bet;
    placeBet(p, toCall + raiseVal);
    if (p.bet > currentWager) currentWager = p.bet;
    betsInRound++;
    activeTurn = (activeTurn + 1) % PLAYERS_COUNT;
    processTurn();
};

document.getElementById('btn-allin').onclick = () => {
    let p = players[0];
    placeBet(p, p.chips);
    if (p.bet > currentWager) currentWager = p.bet;
    showBubble(0, "ALL IN! 💥");
    betsInRound++;
    activeTurn = (activeTurn + 1) % PLAYERS_COUNT;
    processTurn();
};

document.getElementById('btn-fold').onclick = () => {
    players[0].folded = true;
    showBubble(0, "Фолд");
    betsInRound++;
    activeTurn = (activeTurn + 1) % PLAYERS_COUNT;
    processTurn();
};

function evaluateHand(hole, board) {
    let cards = [...hole, ...board].sort((a, b) => b.val - a.val);
    let suits = { '♥':[], '♦':[], '♣':[], '♠':[] };
    let counts = {};

    cards.forEach(c => {
        suits[c.suit].push(c);
        if(!counts[c.val]) counts[c.val] = [];
        counts[c.val].push(c);
    });

    let isFlush = Object.values(suits).some(s => s.length >= 5);
    let uniqueVals = [...new Set(cards.map(c => c.val))];
    let straightHigh = 0;

    for (let i = 0; i <= uniqueVals.length - 5; i++) {
        if (uniqueVals[i] - uniqueVals[i+4] === 4) {
            straightHigh = uniqueVals[i];
            break;
        }
    }

    let groups = Object.values(counts).sort((a,b) => b.length - a.length || b[0].val - a[0].val);
    let score = 0, name = "";

    if (isFlush && straightHigh > 0) { score = 800000 + straightHigh; name = "Стрит-флеш"; }
    else if (groups[0].length === 4) { score = 700000 + groups[0][0].val; name = "Каре"; }
    else if (groups[0].length === 3 && groups.length > 1 && groups[1].length >= 2) { score = 600000 + groups[0][0].val * 10 + groups[1][0].val; name = "Фулл-хаус"; }
    else if (isFlush) { score = 500000 + cards[0].val; name = "Флеш"; }
    else if (straightHigh > 0) { score = 400000 + straightHigh; name = "Стрит"; }
    else if (groups[0].length === 3) { score = 300000 + groups[0][0].val; name = "Сет"; }
    else if (groups[0].length === 2 && groups.length > 1 && groups[1].length === 2) { score = 200000 + groups[0][0].val * 10 + groups[1][0].val; name = "Две пары"; }
    else if (groups[0].length === 2) { score = 100000 + groups[0][0].val; name = "Пара"; }
    else { score = groups[0][0].val; name = "Старшая карта"; }

    return { score, name };
}

function showdown() {
    for (let i = 1; i < PLAYERS_COUNT; i++) {
        if (!players[i].folded) {
            const botCardsDiv = document.querySelector(`#bot-${i-1} .cards`);
            botCardsDiv.innerHTML = players[i].cards.map(c => getCardHTML(c)).join('');
        }
    }

    let active = players.filter(p => !p.folded);
    let bestScore = -1;
    let winner = null;
    let summaryText = "";

    active.forEach(p => {
        let res = evaluateHand(p.cards, boardCards);
        summaryText += `${p.name}: ${res.name}<br>`;

        if (res.score > bestScore) {
            bestScore = res.score;
            winner = p;
        }
    });

    endHand(winner, summaryText);
}

function endHand(winner, details) {
    winner.chips += pot; 

    document.getElementById('result-title').innerText = `${winner.name} побеждает и забирает ${pot} фишек!`;
    document.getElementById('result-desc').innerHTML = details;
    document.getElementById('result-modal').classList.add('active');
    
    pot = 0;
    updateUI();
}

document.getElementById('btn-next-hand').onclick = () => {
    document.getElementById('result-modal').classList.remove('active');
    startHand();
};

document.getElementById('btn-restart').onclick = () => {
    initGame();
    document.getElementById('result-modal').classList.remove('active');
    startHand();
};

initGame();
startHand();
