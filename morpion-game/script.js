
/* DOM Elements */
const gameBoard = document.getElementById('gameBoard');
const cells = document.querySelectorAll('.cell');
const statusText = document.getElementById('playerTurn');
const currentPlayerNameSpan = document.getElementById('currentPlayerName');
const restartBtn = document.getElementById('restartBtn');
const scoreXElement = document.getElementById('scoreX');
const scoreOElement = document.getElementById('scoreO');
const scoreIcon1 = document.getElementById('scoreIcon1');
const scoreIcon2 = document.getElementById('scoreIcon2');

/* Modals & Config */
const customizeModal = document.getElementById('customizeModal');
const rulesModal = document.getElementById('rulesModal');
const startGameBtn = document.getElementById('startGameBtn');
const closeRulesBtn = document.getElementById('closeRulesBtn');
const p1ShapeSelect = document.getElementById('p1-shape');
const p1ColorSelect = document.getElementById('p1-color');
const p2ShapeSelect = document.getElementById('p2-shape');
const p2ColorSelect = document.getElementById('p2-color');

/* Inventory Elements */
const p1InventoryContainer = document.querySelector('#p1-inventory .inventory-slots');
const p2InventoryContainer = document.querySelector('#p2-inventory .inventory-slots');

/* Mobile Toggle Elements */
const toggleP1Btn = document.getElementById('toggleP1');
const toggleP2Btn = document.getElementById('toggleP2');
const toggleScoreBtn = document.getElementById('toggleScore');
const p1Inventory = document.getElementById('p1-inventory');
const p2Inventory = document.getElementById('p2-inventory');
const scoreboard = document.getElementById('scoreboard');

const allGamePanels = [p1Inventory, p2Inventory, scoreboard, toggleP1Btn, toggleP2Btn, toggleScoreBtn];

/* Multiplayer State */
let socket = null;
let roomId = null;
let myPlayerNum = null; // 1 or 2 (null means local)
let isMultiplayer = false;

// Mobile Toggle Logic
if (toggleP1Btn) {
    toggleP1Btn.addEventListener('click', () => {
        p1Inventory.classList.toggle('active');
        p2Inventory.classList.remove('active');
        scoreboard.classList.remove('active');
    });
}

if (toggleP2Btn) {
    toggleP2Btn.addEventListener('click', () => {
        p2Inventory.classList.toggle('active');
        p1Inventory.classList.remove('active');
        scoreboard.classList.remove('active');
    });
}

if (toggleScoreBtn) {
    toggleScoreBtn.addEventListener('click', () => {
        scoreboard.classList.toggle('active');
        p1Inventory.classList.remove('active');
        p2Inventory.classList.remove('active');
    });
}

const multiplayerModal = document.getElementById('multiplayerModal');
const roomInput = document.getElementById('roomInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const mpInitial = document.getElementById('mpInitial');
const mpWaiting = document.getElementById('mpWaiting');
const displayRoomId = document.getElementById('displayRoomId');
const displayRoomName = document.getElementById('displayRoomName');
const localModeBtn = document.getElementById('localModeBtn');
const playerRoleDisplay = document.getElementById('playerRoleDisplay');
const roomNameInput = document.getElementById('roomNameInput');
const publicRoomCheck = document.getElementById('publicRoomCheck');
const roomsSelect = document.getElementById('roomsSelect');
const joinSelectedBtn = document.getElementById('joinSelectedBtn');

function initSocket() {
    if (socket) return;
    const socketUrl = window.location.protocol + "//" + window.location.hostname + ":888";
    socket = io(socketUrl);

    socket.on('roomsUpdate', (data) => {
        const rooms = data.morpion || [];
        roomsSelect.innerHTML = '';
        if (rooms.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Aucun salon public...';
            roomsSelect.appendChild(opt);
            return;
        }
        rooms.forEach(room => {
            const opt = document.createElement('option');
            opt.value = room.id;
            opt.textContent = `${room.name} (${room.playerCount}/2)`;
            roomsSelect.appendChild(opt);
        });
    });

    socket.on('roleAssignment', (data) => {
        myPlayerNum = data.color === 'white' ? 1 : 2; // white=1, black=2 internally
        roomId = data.roomId;
        displayRoomId.textContent = roomId;
        mpInitial.style.display = 'none';
        mpWaiting.style.display = 'block';

        // Update Role Display
        playerRoleDisplay.textContent = `Vous êtes le Joueur ${myPlayerNum}`;

        // Disable other player's selects
        const otherPlayer = myPlayerNum === 1 ? 2 : 1;
        document.getElementById(`p${otherPlayer}-shape`).disabled = true;
        document.getElementById(`p${otherPlayer}-color`).disabled = true;
        document.getElementById(`p${myPlayerNum}-shape`).disabled = false;
        document.getElementById(`p${myPlayerNum}-color`).disabled = false;

        // Hide opponent's mobile toggle
        const otherToggle = otherPlayer === 1 ? toggleP1Btn : toggleP2Btn;
        if (otherToggle) otherToggle.classList.add('hidden-mp');
        const myToggle = myPlayerNum === 1 ? toggleP1Btn : toggleP2Btn;
        if (myToggle) myToggle.classList.remove('hidden-mp');
    });

    socket.on('gameStart', () => {
        multiplayerModal.style.display = 'none';
        customizeModal.style.display = 'flex'; // Now show customization
        isMultiplayer = true;
    });

    socket.on('opponentMorpionConfig', (config) => {
        const otherId = myPlayerNum === 1 ? 2 : 1;
        players[otherId].shape = config.shape;
        players[otherId].color = config.color;

        // Sync selects so UI matches what the other chose
        if (otherId === 1) {
            p1ShapeSelect.value = config.shape;
            p1ColorSelect.value = config.color;
        } else {
            p2ShapeSelect.value = config.shape;
            p2ColorSelect.value = config.color;
        }

        // Update Icons & Inventories
        updatePlayerStyle(scoreIcon1, 1);
        updatePlayerStyle(scoreIcon2, 2);
        renderInventories();
    });

    socket.on('opponentMorpionMove', (moveData) => {
        const { index, pieceData } = moveData;
        selectedPiece = pieceData;
        executeMove(index, true); // true = remote
    });

    socket.on('opponentMorpionRestart', () => {
        startNewGame(true);
    });

    socket.on('opponentDisconnected', () => {
        alert("L'adversaire s'est déconnecté.");
        location.reload();
    });

    socket.on('connect_error', () => {
        console.error("Socket connection error");
        socket = null;
    });
}

// Auto-init socket to get room list
initSocket();

joinSelectedBtn.onclick = () => {
    const id = roomsSelect.value;
    if (id) {
        socket.emit('joinRoom', { roomId: id, gameType: 'morpion' });
    }
};

createRoomBtn.onclick = () => {
    const name = roomNameInput.value.trim() || "Salon sans nom";
    const isPublic = publicRoomCheck.checked;
    const randomRoom = Math.floor(1000 + Math.random() * 9000).toString();
    initSocket();
    displayRoomId.textContent = randomRoom;
    displayRoomName.textContent = name;
    mpInitial.style.display = 'none';
    mpWaiting.style.display = 'block';
    socket.emit('joinRoom', {
        roomId: randomRoom,
        roomName: name,
        isPublic: isPublic,
        gameType: 'morpion'
    });
};

joinRoomBtn.onclick = () => {
    const code = roomInput.value.trim();
    if (code.length === 4) {
        initSocket();
        displayRoomId.textContent = code;
        mpInitial.style.display = 'none';
        mpWaiting.style.display = 'block';
        socket.emit('joinRoom', { roomId: code, gameType: 'morpion' });
    } else {
        alert("Veuillez entrer un code à 4 chiffres.");
    }
};

localModeBtn.onclick = () => {
    isMultiplayer = false;
    myPlayerNum = null;
    multiplayerModal.style.display = 'none';
    customizeModal.style.display = 'flex';
    playerRoleDisplay.textContent = "Mode Local";

    // Reset UI visibility (remove MP restrictions)
    [p1Inventory, p2Inventory, toggleP1Btn, toggleP2Btn].forEach(el => {
        if (el) el.classList.remove('hidden-mp');
    });

    document.getElementById('p1-shape').disabled = false;
    document.getElementById('p1-color').disabled = false;
    document.getElementById('p2-shape').disabled = false;
    document.getElementById('p2-color').disabled = false;
};

/* Real-time sync for selects */
const syncSelects = (playerNum) => {
    if (!isMultiplayer || playerNum !== myPlayerNum) return;
    const shape = document.getElementById(`p${playerNum}-shape`).value;
    const color = document.getElementById(`p${playerNum}-color`).value;
    socket.emit('morpionConfig', { roomId, config: { shape, color } });
};

[p1ShapeSelect, p1ColorSelect, p2ShapeSelect, p2ColorSelect].forEach((sel, idx) => {
    sel.addEventListener('change', () => {
        const pNum = idx < 2 ? 1 : 2;
        syncSelects(pNum);
    });
});

/* State */
let currentPlayer = 1; // 1 or 2
let players = {
    1: { name: 'J1', color: 'blue', shape: 'cross', score: 0, inventory: { small: 4, medium: 2, large: 2 } },
    2: { name: 'J2', color: 'red', shape: 'circle', score: 0, inventory: { small: 4, medium: 2, large: 2 } }
};
// Board state: array of 9 arrays (stacks). Each stack contains objects { player: 1, size: 3 } (size: 1=small, 2=med, 3=lg)
let boardStacks = Array(9).fill(null).map(() => []);
let gameActive = false;
let selectedPiece = null; // { player: 1, size: 'large', source: 'inventory'|'board', sourceIndex: -1 }

/* Win Conditions */
const winningConditions = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
    [0, 4, 8], [2, 4, 6]             // Diagonals
];

const sizeMap = { 'small': 1, 'medium': 2, 'large': 3 };
const sizeReverseMap = { 1: 'small', 2: 'medium', 3: 'large' };

/* Initialization */
startGameBtn.addEventListener('click', () => {
    const p1Shape = p1ShapeSelect.value;
    const p1Color = p1ColorSelect.value;
    const p2Shape = p2ShapeSelect.value;
    const p2Color = p2ColorSelect.value;

    const errorMsg = document.getElementById('configError');

    // Validation: Prevent identical config
    if (p1Shape === p2Shape && p1Color === p2Color) {
        errorMsg.style.display = 'block';
        return;
    }

    // Hide error if valid
    errorMsg.style.display = 'none';

    // Save Config
    players[1].shape = p1Shape;
    players[1].color = p1Color;
    players[2].shape = p2Shape;
    players[2].color = p2Color;

    // Send Config if Multiplayer
    if (isMultiplayer) {
        const config = myPlayerNum === 1 ?
            { shape: p1Shape, color: p1Color } :
            { shape: p2Shape, color: p2Color };
        socket.emit('morpionConfig', { roomId, config });
    }

    // Update Scoreboard Icons
    updatePlayerStyle(scoreIcon1, 1);
    updatePlayerStyle(scoreIcon2, 2);

    customizeModal.style.display = 'none';
    rulesModal.style.display = 'flex';
});

closeRulesBtn.addEventListener('click', () => {
    rulesModal.style.display = 'none';
    startNewGame();
});

restartBtn.addEventListener('click', () => {
    if (isMultiplayer) {
        socket.emit('morpionRestart', roomId);
    }
    startNewGame();
});

function startNewGame(isRemoteRestart = false) {
    gameActive = true;
    currentPlayer = 1;
    selectedPiece = null;
    boardStacks = Array(9).fill(null).map(() => []);

    // Reset Inventories
    players[1].inventory = { small: 4, medium: 2, large: 2 };
    players[2].inventory = { small: 4, medium: 2, large: 2 };

    renderBoard();
    renderInventories();
    updateStatus();
    updateScoreboard();

    // Show game panels
    allGamePanels.forEach(panel => {
        if (panel) panel.classList.add('visible');
    });

    // Multiplayer Privacy: Hide opponent's inventory via class
    if (isMultiplayer) {
        const otherPlayer = myPlayerNum === 1 ? 2 : 1;
        const otherInv = otherPlayer === 1 ? p1Inventory : p2Inventory;
        const myInv = myPlayerNum === 1 ? p1Inventory : p2Inventory;

        if (otherInv) otherInv.classList.add('hidden-mp');
        if (myInv) myInv.classList.remove('hidden-mp');
    } else {
        [p1Inventory, p2Inventory].forEach(el => {
            if (el) el.classList.remove('hidden-mp');
        });
    }
}

/* Rendering */
function getShapeIcon(shape) {
    switch (shape) {
        case 'cross': return '×'; // or use FontAwesome icon class
        case 'circle': return '○';
        case 'square': return '□';
        case 'triangle': return '△';
        case 'diamond': return '◇';
        default: return '?';
    }
}

function updatePlayerStyle(element, playerId) {
    const p = players[playerId];
    element.textContent = getShapeIcon(p.shape);
    element.style.color = p.color; // Simplify color mapping for now assumes valid CSS colors
    // Map French names to CSS colors if needed, but select values are English keys (red, blue...)
}

function renderInventories() {
    renderInventory(1, p1InventoryContainer);
    renderInventory(2, p2InventoryContainer);
}

function renderInventory(playerId, container) {
    container.innerHTML = '';
    const inv = players[playerId].inventory;

    // Create slots for Large, Medium, Small
    ['large', 'medium', 'small'].forEach(size => {
        const count = inv[size];
        if (count > 0) {
            const slot = document.createElement('div');
            slot.className = 'inv-slot';
            slot.dataset.player = playerId;
            slot.dataset.size = size;

            // Selection visual
            if (selectedPiece && selectedPiece.source === 'inventory' &&
                selectedPiece.player === playerId && selectedPiece.size === size) {
                slot.classList.add('selected');
            }

            slot.addEventListener('click', () => handleInventoryClick(playerId, size));

            const piece = document.createElement('span');
            piece.className = `piece piece-${size === 'medium' ? 'md' : (size === 'large' ? 'lg' : 'sm')}`;
            piece.textContent = getShapeIcon(players[playerId].shape);
            piece.style.color = players[playerId].color;

            const countBadge = document.createElement('div');
            countBadge.className = 'inv-count';
            countBadge.textContent = count;

            slot.appendChild(piece);
            slot.appendChild(countBadge);
            container.appendChild(slot);
        }
    });
}

function renderBoard() {
    cells.forEach((cell, index) => {
        cell.innerHTML = '';
        const stack = boardStacks[index];

        // Render only the top piece
        if (stack.length > 0) {
            const topPiece = stack[stack.length - 1];
            const pieceEl = document.createElement('span');
            const sizeStr = sizeReverseMap[topPiece.size];
            pieceEl.className = `piece piece-${sizeStr === 'medium' ? 'md' : (sizeStr === 'large' ? 'lg' : 'sm')}`;
            pieceEl.textContent = getShapeIcon(players[topPiece.player].shape);
            pieceEl.style.color = players[topPiece.player].color;
            cell.appendChild(pieceEl);
        }

        // Highlight valid moves or selected cell?
        // Maybe later.

        // Selection Highlighting if moving from board (Advanced rule, not strictly requested but good for Gobblet)
        // For this version, let's stick to Inventory -> Board. 
        // "les moyens peuvent se placer sur des petits..." implies placement rules.
        // It doesn't explicitly ask for moving pieces already on board, but standard Gobblet allows it.
        // User prompt: "mettra le nombres de piuons et le type qu'il restent au premier joueur" -> focus on inventory.
        // I will implement placing from inventory first.
    });
}

/* Logic */

function handleInventoryClick(playerId, size) {
    if (!gameActive) return;
    if (playerId !== currentPlayer) return;

    // Multiplayer Restriction: Only interact with own inventory
    if (isMultiplayer && playerId !== myPlayerNum) return;

    if (selectedPiece && selectedPiece.source === 'inventory' && selectedPiece.size === size) {
        // Deselect
        selectedPiece = null;
    } else {
        // Select
        selectedPiece = { player: playerId, size: size, source: 'inventory' };

        // Auto-close overlay on mobile when a piece is selected
        p1Inventory.classList.remove('active');
        p2Inventory.classList.remove('active');
    }
    renderInventories(); // Re-render to show selection
}

cells.forEach(cell => {
    cell.addEventListener('click', (e) => {
        if (!gameActive) return;
        const index = parseInt(cell.dataset.index);
        handleCellClick(index);
    });
});


function handleCellClick(index) {
    if (!selectedPiece && !gameActive) return;

    // Select from board? (Not implemented yet based on strict requirements but good for future)
    // For now only inventory placement.
    if (!selectedPiece) {
        // Optional: Shake if clicking empty cell without selection
        return;
    }

    // Check validity
    const stack = boardStacks[index];
    const topPiece = stack.length > 0 ? stack[stack.length - 1] : null;
    const topPieceSize = topPiece ? topPiece.size : 0;
    const incomingSize = sizeMap[selectedPiece.size];

    // Rule: Cannot gobble own piece
    if (topPiece && topPiece.player === currentPlayer) {
        // Invalid Move (Self-Gobble)
        const cell = cells[index];
        cell.classList.add('shake');
        setTimeout(() => cell.classList.remove('shake'), 500);
        return;
    }

    if (incomingSize > topPieceSize) {
        // Valid Move
        executeMove(index);
    } else {
        // Invalid Move (Size too small)
        const cell = cells[index];
        cell.classList.add('shake');
        setTimeout(() => cell.classList.remove('shake'), 500);
    }
}

function executeMove(index, isRemote = false) {
    if (isMultiplayer && !isRemote && currentPlayer !== myPlayerNum) return;

    // Send move if Multiplayer and local
    if (isMultiplayer && !isRemote) {
        socket.emit('morpionMove', { roomId, moveData: { index, pieceData: selectedPiece } });
    }

    // Remove from source (inventory)
    if (selectedPiece.source === 'inventory') {
        players[selectedPiece.player].inventory[selectedPiece.size]--;
        // Update inventory display immediately to show decrement
        renderInventories();
    }

    // Add to board
    boardStacks[index].push({
        player: selectedPiece.player,
        size: sizeMap[selectedPiece.size]
    });

    // Reset selection
    selectedPiece = null;

    // Resize render for this cell
    renderBoard();

    // Check Win
    if (checkWin()) {
        endGame(false); // false = not draw
    } else {
        switchTurn();
    }
}

function checkWin() {
    for (let condition of winningConditions) {
        const [a, b, c] = condition;
        const sA = boardStacks[a];
        const sB = boardStacks[b];
        const sC = boardStacks[c];

        if (sA.length === 0 || sB.length === 0 || sC.length === 0) continue;

        const pA = sA[sA.length - 1].player;
        const pB = sB[sB.length - 1].player;
        const pC = sC[sC.length - 1].player;

        if (pA === pB && pB === pC) {
            return true;
        }
    }
    return false;
}

function endGame(draw) {
    gameActive = false;
    if (draw) {
        statusText.textContent = "Match nul !";
    } else {
        statusText.innerHTML = `Le joueur <span style="color: ${players[currentPlayer].color}">${players[currentPlayer].name}</span> a gagné !`;
        players[currentPlayer].score++;
        updateScoreboard();
    }
    // Re-enable start button or something? 
    // The restart button is always available.
}

function switchTurn() {
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    updateStatus();
}

function updateStatus() {
    currentPlayerNameSpan.textContent = players[currentPlayer].name;
    currentPlayerNameSpan.style.color = players[currentPlayer].color;
}

function updateScoreboard() {
    scoreXElement.textContent = players[1].score;
    // scoreOElement is actually for p2
    scoreOElement.textContent = players[2].score;
}

/* CSS for shake - injected via JS */
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes shake {
        0% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        50% { transform: translateX(5px); }
        75% { transform: translateX(-5px); }
        100% { transform: translateX(0); }
    }
    .shake { animation: shake 0.3s ease-in-out; }
`;
document.head.appendChild(styleSheet);
