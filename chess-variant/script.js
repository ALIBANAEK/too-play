
const chessBoard = document.getElementById('chessBoard');
const turnIndicator = document.getElementById('turnIndicator');
const messageArea = document.getElementById('messageArea');
const rulesModal = document.getElementById('rulesModal');
const startGameBtn = document.getElementById('startGameBtn');
const historyList = document.getElementById('historyList');
const SQUARE_SIZE = 60;

/* Mobile Toggle */
const toggleHistoryBtn = document.getElementById('toggleHistory');
const sidebar = document.getElementById('sidebar');

if (toggleHistoryBtn && sidebar) {
    toggleHistoryBtn.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });
}

/* Game State */
let activeSquares = new Map(); // Key: "x,y", Value: { element, color }
let pieces = new Map(); // Key: "x,y", Value: { type, color, hasMoved: boolean }
let currentTurn = 'white';
let mode = 'move'; // 'move' or 'place' or 'game_over'
let selectedSquare = null; // "x,y"
let validMoves = []; // Array of { target: "x,y", type: "move"|"capture"|"castle"|"enpassant" }
let moveHistory = [];
let turnCount = 1;
let lastMove = null; // { fromX, fromY, toX, toY, piece, type }
let strikes = { white: 0, black: 0 };
let boardHistory = new Map(); // For threefold repetition
const whiteStrikesEl = document.getElementById('whiteStrikes');
const blackStrikesEl = document.getElementById('blackStrikes');
const promotionModal = document.getElementById('promotionModal');
const promotionOptions = document.getElementById('promotionOptions');
const notificationContainer = document.getElementById('notificationContainer');
const victoryModal = document.getElementById('victoryModal');
const victoryTitle = document.getElementById('victoryTitle');
const victoryMessage = document.getElementById('victoryMessage');

/* Captured Pieces State */
let capturedPieces = { white: [], black: [] };
const capturedBlackEl = document.getElementById('capturedBlack');
const capturedWhiteEl = document.getElementById('capturedWhite');

/* Multiplayer State */
let socket = null;
let roomId = null;
let myColor = null; // 'white' or 'black' or null (local)
const multiplayerModal = document.getElementById('multiplayerModal');
const roomInput = document.getElementById('roomInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const mpInitial = document.getElementById('mpInitial');
const mpWaiting = document.getElementById('mpWaiting');
const displayRoomId = document.getElementById('displayRoomId');
const displayRoomName = document.getElementById('displayRoomName');
const colorSelect = document.getElementById('colorSelect');
const roomNameInput = document.getElementById('roomNameInput');
const publicRoomCheck = document.getElementById('publicRoomCheck');
const roomsSelect = document.getElementById('roomsSelect');
const joinSelectedBtn = document.getElementById('joinSelectedBtn');

// Connect to the backend
function initSocket() {
    if (socket) return; // Already connected

    const socketUrl = window.location.protocol + "//" + window.location.hostname + ":888";
    socket = io(socketUrl);

    socket.on('roomsUpdate', (data) => {
        const rooms = data.chess || [];
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
        myColor = data.color;
        roomId = data.roomId;
        displayRoomId.textContent = roomId;
        mpInitial.style.display = 'none';
        mpWaiting.style.display = 'block';
    });

    socket.on('gameStart', () => {
        multiplayerModal.style.display = 'none';
        if (myColor === 'black') {
            chessBoard.classList.add('rotated-view');
        } else {
            chessBoard.classList.remove('rotated-view');
        }
        initGame();
        showNotification(`Partie lancée ! Vous jouez les ${myColor === 'white' ? 'Blancs' : 'Noirs'}.`, "default");
    });

    socket.on('opponentMove', (moveData) => {
        const { fromKey, moveObj } = moveData;
        executeMove(fromKey, moveObj, true);
    });

    socket.on('opponentPlace', ({ x, y }) => {
        placeNewSquare(x, y, true);
    });

    socket.on('opponentDisconnected', () => {
        showNotification("L'adversaire s'est déconnecté.", "error");
        setTimeout(() => location.reload(), 3000);
    });

    socket.on('connect_error', () => {
        console.error("Socket connection error");
        socket = null; // Allow retry
    });
}

// Auto-init socket to get room list
initSocket();

joinSelectedBtn.onclick = () => {
    const id = roomsSelect.value;
    if (id) {
        socket.emit('joinRoom', { roomId: id, gameType: 'chess' });
    }
};

createRoomBtn.onclick = () => {
    const name = roomNameInput.value.trim() || "Salon sans nom";
    const isPublic = publicRoomCheck.checked;
    const preferredColor = colorSelect.value;
    const randomRoom = Math.floor(1000 + Math.random() * 9000).toString();
    initSocket();

    // Immediate UI Feedback
    displayRoomId.textContent = randomRoom;
    displayRoomName.textContent = name;
    mpInitial.style.display = 'none';
    mpWaiting.style.display = 'block';

    socket.emit('joinRoom', {
        roomId: randomRoom,
        preferredColor,
        roomName: name,
        isPublic: isPublic,
        gameType: 'chess'
    });
};

joinRoomBtn.onclick = () => {
    const code = roomInput.value.trim();
    if (code.length === 4) {
        initSocket();

        // Immediate UI Feedback
        displayRoomId.textContent = code;
        mpInitial.style.display = 'none';
        mpWaiting.style.display = 'block';

        socket.emit('joinRoom', { roomId: code, gameType: 'chess' });
    } else {
        showNotification("Veuillez entrer un code à 4 chiffres.", "error");
    }
};

const localModeBtn = document.getElementById('localModeBtn');
if (localModeBtn) localModeBtn.onclick = startLocalGame;

/* Initialization */
startGameBtn.addEventListener('click', () => {
    rulesModal.style.display = 'none';
    multiplayerModal.style.display = 'flex';
});

function startLocalGame() {
    multiplayerModal.style.display = 'none';
    initGame();
}

function initGame() {
    activeSquares.clear();
    pieces.clear();
    moveHistory = [];
    turnCount = 1;
    lastMove = null;
    strikes = { white: 0, black: 0 };
    boardHistory.clear();
    updateStrikes();
    chessBoard.innerHTML = '';
    historyList.innerHTML = '';
    capturedPieces = { white: [], black: [] };
    updateCapturedDisplay();
    currentTurn = 'white';
    mode = 'move';
    if (!socket) {
        chessBoard.classList.remove('rotated-view');
    }
    updateTurnIndicator();

    // Create Standard 8x8 Board
    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            createSquare(x, y);
        }
    }

    // Place Pieces
    initPieces();
    updateBoardTransform();

    // Center the board scroll (Delayed to ensure DOM is ready)
    setTimeout(() => {
        const container = document.getElementById('boardScrollContainer');
        if (container) {
            const area = container.parentElement;
            area.scrollLeft = (container.offsetWidth - area.offsetWidth) / 2;
            area.scrollTop = (container.offsetHeight - area.offsetHeight) / 2;
        }
    }, 100);
}

function createSquare(x, y) {
    const key = `${x},${y}`;
    if (activeSquares.has(key)) return;

    const square = document.createElement('div');
    const isDark = (x + y) % 2 !== 0;
    square.className = `square ${isDark ? 'dark' : 'light'}`;
    square.style.transform = `translate(${x * SQUARE_SIZE}px, ${y * SQUARE_SIZE}px)`;
    square.dataset.coord = key;

    // Add Coordinates
    // Show File label if at bottom edge (y=max) or hardcoded standard 7?
    // Dynamic board means "bottom" changes. 
    // Let's attach labels to squares that don't have a neighbor in that direction
    // But expanding board fills gaps.
    // Simple approach: Add label if y=7 (standard) OR if it's an edge square at creation.
    // Refinement: Add labels to ALL squares but hide internal ones via CSS? No.
    // Initial board: standard labels.
    if (y === 7) addCoordLabel(square, 'file', getFileLabel(x));
    if (x === 0) addCoordLabel(square, 'rank', getRankLabel(y));

    square.addEventListener('mousedown', (e) => {
        handleSquareClick(x, y);
    });

    chessBoard.appendChild(square);
    activeSquares.set(key, { element: square, color: isDark ? 'dark' : 'light' });
}

function addCoordLabel(square, type, text) {
    // Check if exists
    if (square.querySelector(`.${type}`)) return;
    const label = document.createElement('span');
    label.className = `coord-label ${type}`;
    label.textContent = text;
    square.appendChild(label);
}

/* Coordinate Logic */
function getFileLabel(x) {
    // 0..25 -> a..z
    // 26 -> aa
    // -1 -> A, -2 -> B... -26 -> Z, -27 -> AA...
    const alphabet = "abcdefghijklmnopqrstuvwxyz";

    if (x >= 0) {
        let label = "";
        let n = x;
        do {
            label = alphabet[n % 26] + label;
            n = Math.floor(n / 26) - 1;
        } while (n >= 0);
        return label;
    } else {
        // Negative: "-" + lowercase letters. index -1 maps to a (-a)
        let label = "";
        let n = Math.abs(x) - 1;
        do {
            label = alphabet[n % 26] + label;
            n = Math.floor(n / 26) - 1;
        } while (n >= 0);
        return "-" + label;
    }
}

function getRankLabel(y) {
    // 0 -> 8, 7 -> 1, 8 -> 0, 9 -> -1
    return (8 - y).toString();
}

function getAlgebraic(x, y) {
    return getFileLabel(x) + getRankLabel(y);
}

/* Pieces */
function initPieces() {
    const setup = [
        ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'], // Black Row 0
        Array(8).fill('pawn'), // Black Row 1
        Array(8).fill(null),
        Array(8).fill(null),
        Array(8).fill(null),
        Array(8).fill(null),
        Array(8).fill('pawn'), // White Row 6
        ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'] // White Row 7
    ];

    setup.forEach((row, y) => {
        row.forEach((type, x) => {
            if (type) {
                const color = y < 2 ? 'black' : 'white';
                pieces.set(`${x},${y}`, { type, color, hasMoved: false });
            }
        });
    });

    renderPieces();
}

function renderPieces() {
    activeSquares.forEach(sq => {
        const piece = sq.element.querySelector('.piece');
        if (piece) piece.remove();
    });

    pieces.forEach((piece, coord) => {
        const sq = activeSquares.get(coord);
        if (sq) {
            const pieceEl = document.createElement('span');
            pieceEl.className = 'piece';
            pieceEl.textContent = getPieceIcon(piece.type, piece.color);
            pieceEl.style.fontSize = '40px';
            pieceEl.style.color = piece.color === 'white' ? '#fff' : '#000';
            if (piece.color === 'black') pieceEl.style.textShadow = '0 0 2px white';
            else pieceEl.style.textShadow = '0 0 2px black';

            // Center piece in square
            pieceEl.style.position = 'absolute';
            pieceEl.style.left = '50%';
            pieceEl.style.top = '50%';
            pieceEl.style.transform = 'translate(-50%, -50%)';

            sq.element.appendChild(pieceEl);
        }
    });
}

function getPieceIcon(type, color) {
    const icons = {
        white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
        black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' }
    };
    return icons[color][type];
}

/* Interaction */
function handleSquareClick(x, y) {
    if (socket && myColor && currentTurn !== myColor) return;

    const key = `${x},${y}`;

    if (mode === 'place') {
        return; // Handled by ghost squares
    }

    if (mode === 'move') {
        const validMove = validMoves.find(m => m.target === key);
        if (validMove) {
            executeMove(selectedSquare, validMove);
            return;
        }

        // Penalty checking for illegal move attempts
        const piece = pieces.get(key);
        if (piece && piece.color === currentTurn) {
            selectPiece(key, x, y);
            return;
        }

        // If clicked on a square that IS in calculateMoves but NOT in filtered validMoves
        // then it's an illegal move (results in check)
        if (selectedSquare) {
            const [sx, sy] = selectedSquare.split(',').map(Number);
            const selPiece = pieces.get(selectedSquare);
            const rawMoves = calculateMoves(sx, sy, selPiece);
            const intendedMove = rawMoves.find(m => m.target === key);

            if (intendedMove) {
                // Rule: If the move is piece-legal but forbidden (e.g. check protection failure), it's a strike.
                incrementStrike(currentTurn);
                messageArea.textContent = "COUP ILLÉGAL ! Protection du Roi requise.";
                // Pas de timeout ici, c'est effacé par finishMoveSequence lors d'un coup valide
                deselect();
                return;
            }
        }

        deselect();
    }
}

function incrementStrike(color) {
    strikes[color]++;
    updateStrikes();

    // Persistent Feedback (until valid move)
    const boardArea = document.querySelector('.board-area');
    if (boardArea) boardArea.classList.add('error-flash');

    showNotification("COUP ILLÉGAL ! Protection du Roi requise.", "error");

    if (strikes[color] >= 3) {
        endGameByStrikes(color);
    }
}

function updateStrikes() {
    if (whiteStrikesEl) whiteStrikesEl.textContent = strikes.white;
    if (blackStrikesEl) blackStrikesEl.textContent = strikes.black;
}

function endGameByStrikes(loserColor) {
    const winner = loserColor === 'white' ? 'LES NOIRS' : 'LES BLANCS';
    endGame(`3 fautes pour les ${loserColor === 'white' ? 'Blancs' : 'Noirs'}. ${winner} GAGNENT !`);
}

function deselect() {
    selectedSquare = null;
    validMoves = [];
    activeSquares.forEach(sq => {
        sq.element.classList.remove('highlight', 'valid-move', 'capture-move');
    });
}

function selectPiece(key, x, y) {
    deselect();
    selectedSquare = key;
    activeSquares.get(key).element.classList.add('highlight');

    validMoves = getLegalMoves(x, y);

    validMoves.forEach(move => {
        const sq = activeSquares.get(move.target);
        if (sq) {
            if (move.type === 'capture' || move.type === 'enpassant') sq.element.classList.add('capture-move');
            else sq.element.classList.add('valid-move');
        }
    });
}

function calculateMoves(x, y, piece, piecesMap = pieces) {
    const moves = [];
    if (!piece) return moves;

    const directions = {
        rook: [[1, 0], [-1, 0], [0, 1], [0, -1]],
        bishop: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
        queen: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
        knight: [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]],
        king: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
    };

    // Sliders
    if (['rook', 'bishop', 'queen'].includes(piece.type)) {
        directions[piece.type].forEach(([dx, dy]) => {
            let cx = x + dx;
            let cy = y + dy;
            while (true) {
                const key = `${cx},${cy}`;
                if (!activeSquares.has(key)) break;
                if (piecesMap.has(key)) {
                    if (piecesMap.get(key).color !== piece.color) moves.push({ target: key, type: 'capture' });
                    break;
                }
                moves.push({ target: key, type: 'move' });
                cx += dx;
                cy += dy;
            }
        });
    }

    // Knight & King
    if (piece.type === 'knight' || piece.type === 'king') {
        directions[piece.type].forEach(([dx, dy]) => {
            const tx = x + dx;
            const ty = y + dy;
            const key = `${tx},${ty}`;
            if (activeSquares.has(key)) {
                if (!piecesMap.has(key)) {
                    moves.push({ target: key, type: 'move' });
                } else if (piecesMap.get(key).color !== piece.color) {
                    moves.push({ target: key, type: 'capture' });
                }
            }
        });
    }

    // Pawn
    if (piece.type === 'pawn') {
        const dir = piece.color === 'white' ? -1 : 1;
        const forward = `${x},${y + dir}`;
        if (activeSquares.has(forward) && !piecesMap.has(forward)) {
            moves.push({ target: forward, type: 'move' });
            // Double move
            const startRow = piece.color === 'white' ? 6 : 1;
            const doubleForward = `${x},${y + dir * 2}`;
            if (y === startRow && activeSquares.has(doubleForward) && !piecesMap.has(doubleForward)) {
                moves.push({ target: doubleForward, type: 'move' });
            }
        }
        // Capture
        [[1, dir], [-1, dir]].forEach(([dx, dy]) => {
            const targetX = x + dx;
            const targetY = y + dy;
            const target = `${targetX},${targetY}`;
            if (activeSquares.has(target)) {
                if (piecesMap.has(target) && piecesMap.get(target).color !== piece.color) {
                    moves.push({ target: target, type: 'capture' });
                } else {
                    // En Passant
                    const adjacentKey = `${targetX},${y}`;
                    if (lastMove && lastMove.piece.type === 'pawn' && Math.abs(lastMove.fromY - lastMove.toY) === 2) {
                        if (lastMove.toX === targetX && lastMove.toY === y) {
                            moves.push({ target: target, type: 'enpassant', captureKey: adjacentKey });
                        }
                    }
                }
            }
        });
    }

    // Castling
    if (piece.type === 'king' && !piece.hasMoved) {
        checkCastle(x, y, 1, 7, [1, 2], piece.color, moves, piecesMap); // Kingside
        checkCastle(x, y, -1, 0, [-1, -2, -3], piece.color, moves, piecesMap); // Queenside
    }

    return moves;
}

function checkCastle(kx, ky, dir, rookX, emptyOffsets, color, moves, piecesMap = pieces) {
    const rookKey = `${rookX},${ky}`;
    const rook = piecesMap.get(rookKey);
    if (!rook || rook.type !== 'rook' || rook.color !== color || rook.hasMoved) return;

    for (let offset of emptyOffsets) {
        if (piecesMap.has(`${kx + offset},${ky}`)) return;
    }

    moves.push({ target: `${kx + dir * 2},${ky}`, type: 'castle', rookFrom: rookKey, rookTo: `${kx + dir},${ky}` });
}



// Redefining executeMove properly
function executeMove(fromKey, moveObj, isRemote = false) {
    if (socket && !isRemote) {
        socket.emit('move', { roomId, moveData: { fromKey, moveObj } });
    }
    const [fromX, fromY] = fromKey.split(',').map(Number);
    const [toX, toY] = moveObj.target.split(',').map(Number);
    const piece = pieces.get(fromKey);

    let capturedPiece = null;
    if (moveObj.type === 'capture') {
        capturedPiece = pieces.get(moveObj.target);
    } else if (moveObj.type === 'enpassant') {
        capturedPiece = pieces.get(moveObj.captureKey);
        pieces.delete(moveObj.captureKey);
    }

    // Notation
    const notation = getMoveNotation(piece, moveObj, fromX, fromY, toX, toY);
    addHistoryEntry(notation);

    // Move
    pieces.delete(fromKey);
    pieces.set(moveObj.target, piece);
    piece.hasMoved = true;

    if (capturedPiece) {
        // pieces captured BY someone. 
        // If current player is white, they captured a black piece, add to capturedPieces.white
        capturedPieces[currentTurn].push(capturedPiece);
        updateCapturedDisplay();
    }

    lastMove = { fromX, fromY, toX, toY, piece, type: moveObj.type };

    if (moveObj.type === 'castle') {
        const rook = pieces.get(moveObj.rookFrom);
        pieces.delete(moveObj.rookFrom);
        pieces.set(moveObj.rookTo, rook);
        rook.hasMoved = true;
    }

    // Promotion Check
    if (piece.type === 'pawn' && (toY === 0 || toY === 7)) {
        handlePromotion(moveObj.target, piece.color, (newType) => {
            piece.type = newType;
            finishMoveSequence(capturedPiece);
        });
    } else {
        finishMoveSequence(capturedPiece);
    }
}

function handlePromotion(coord, color, callback) {
    promotionModal.style.display = 'flex';
    promotionOptions.innerHTML = '';

    const options = ['queen', 'rook', 'bishop', 'knight'];
    options.forEach(type => {
        const btn = document.createElement('div');
        btn.className = 'promotion-btn';
        btn.textContent = getPieceIcon(type, color);
        btn.style.color = color === 'white' ? '#fff' : '#000';

        btn.onclick = () => {
            promotionModal.style.display = 'none';
            callback(type);
        };
        promotionOptions.appendChild(btn);
    });
}

function updateCapturedDisplay() {
    if (capturedBlackEl) {
        capturedBlackEl.innerHTML = '';
        // Pieces captured by Black (White's pieces)
        capturedPieces.black.forEach(p => {
            const span = document.createElement('span');
            span.className = 'captured-piece';
            span.textContent = getPieceIcon(p.type, p.color);
            span.style.color = '#fff';
            span.style.textShadow = '0 0 2px black';
            capturedBlackEl.appendChild(span);
        });
    }
    if (capturedWhiteEl) {
        capturedWhiteEl.innerHTML = '';
        // Pieces captured by White (Black's pieces)
        capturedPieces.white.forEach(p => {
            const span = document.createElement('span');
            span.className = 'captured-piece';
            span.textContent = getPieceIcon(p.type, p.color);
            span.style.color = '#000';
            span.style.textShadow = '0 0 2px white';
            capturedWhiteEl.appendChild(span);
        });
    }
}

function finishMoveSequence(capturedPiece) {
    // Nettoyer les feedbacks d'erreur et messages persistants lors d'un coup valide
    const boardArea = document.querySelector('.board-area');
    if (boardArea) boardArea.classList.remove('error-flash');
    if (mode !== 'game_over') messageArea.textContent = "";

    // Nettoyer les notifications d'erreur persistantes
    document.querySelectorAll('.game-notification.error').forEach(n => n.remove());

    renderPieces();
    deselect();
    updateBoardTransform();

    // Check for Threefold Repetition
    if (checkThreefoldRepetition()) {
        endGame("Match nul par répétition !", true);
        return;
    }

    // Check Win (King Capture)
    if (capturedPiece && capturedPiece.type === 'king') {
        const winner = currentTurn === 'white' ? 'LES BLANCS' : 'LES NOIRS';
        endGame(`Le Roi a été capturé ! ${winner} GAGNENT !`);
        return;
    }

    if (capturedPiece) {
        mode = 'place';
        messageArea.textContent = `CAPTURE ! ${currentTurn === 'white' ? 'Blancs' : 'Noirs'}, placez une case.`;
        showPlacementOptions();
    } else {
        const nextTurn = currentTurn === 'white' ? 'black' : 'white';

        if (isCheck(nextTurn)) {
            showNotification("ÉCHEC !", "error");
        }

        if (isCheckmate(nextTurn)) {
            const winColor = currentTurn === 'white' ? 'LES BLANCS' : 'LES NOIRS';
            endGame(`Échec et Mat ! ${winColor} GAGNENT !`);
            return;
        } else if (isStalemate(nextTurn)) {
            endGame("Pat ! Match nul.", true);
            return;
        }
        switchTurn();
    }
}

function getMoveNotation(piece, move, fromX, fromY, toX, toY) {
    if (move.type === 'castle') return toX > fromX ? "PR" : "GR";

    const origin = getAlgebraic(fromX, fromY);
    const dest = getAlgebraic(toX, toY);

    return `${origin} -> ${dest}`;
}

function addHistoryEntry(notation) {
    if (currentTurn === 'white') {
        const row = document.createElement('div');
        row.className = 'history-item';
        row.innerHTML = `<span class="turn-number">${turnCount}.</span><span class="move-white">${notation}</span><span class="move-black"></span>`;
        historyList.prepend(row);
    } else {
        const row = historyList.firstElementChild;
        if (row) {
            row.querySelector('.move-black').textContent = notation;
        }
        turnCount++;
    }
}

function showPlacementOptions() {
    const ghosts = [];
    activeSquares.forEach((val, key) => {
        const [x, y] = key.split(',').map(Number);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const tx = x + dx;
                const ty = y + dy;
                const tKey = `${tx},${ty}`;
                if (!activeSquares.has(tKey) && !ghosts.includes(tKey)) {
                    createGhostSquare(tx, ty);
                    ghosts.push(tKey);
                }
            }
        }
    });
}

function createGhostSquare(x, y) {
    const key = `${x},${y}`;
    if (document.querySelector(`.square[data-ghost="${key}"]`)) return;

    const square = document.createElement('div');
    square.className = 'square place-mode';
    square.style.transform = `translate(${x * SQUARE_SIZE}px, ${y * SQUARE_SIZE}px)`;
    square.dataset.coord = key;
    square.textContent = '+';

    // Add coordinates to ghosts? Maybe helpful
    // if (y===7) addCoordLabel(square, 'file', getFileLabel(x));

    square.addEventListener('click', (e) => {
        if (socket && myColor && currentTurn !== myColor) return;
        e.stopPropagation();
        placeNewSquare(x, y);
    });

    chessBoard.appendChild(square);
}

function placeNewSquare(x, y, isRemote = false) {
    if (socket && !isRemote) {
        socket.emit('placeSquare', { roomId, x, y });
    }
    document.querySelectorAll('.place-mode').forEach(el => el.remove());
    createSquare(x, y);
    updateBoardTransform();
    mode = 'move';
    messageArea.textContent = "";

    // Check for draws/mate after expansion
    const nextTurn = currentTurn === 'white' ? 'black' : 'white';
    if (isCheck(nextTurn)) {
        showNotification("ÉCHEC !", "error");
    }

    if (isStalemate(nextTurn)) {
        endGame("Pat ! Match nul.", true);
    } else if (isCheckmate(nextTurn)) {
        const winner = currentTurn === 'white' ? 'LES BLANCS' : 'LES NOIRS';
        endGame(`Échec et Mat ! ${winner} GAGNENT !`);
    }

    switchTurn();
}

function endGame(msg, isDraw = false) {
    // Clear all active notifications on game over
    notificationContainer.innerHTML = '';

    if (victoryModal) {
        victoryTitle.textContent = isDraw ? "MATCH NUL" : "VICTOIRE !";
        victoryMessage.textContent = msg;
        victoryModal.style.display = 'flex';

        // Hide crown on draw for better context
        const crown = victoryModal.querySelector('.crown-icon');
        if (crown) crown.style.display = isDraw ? 'none' : 'block';
    }
    messageArea.textContent = msg;
    mode = 'game_over';
    deselect();
}

function switchTurn() {
    currentTurn = currentTurn === 'white' ? 'black' : 'white';
    updateTurnIndicator();
}

function updateTurnIndicator() {
    turnIndicator.textContent = `Tour des ${currentTurn === 'white' ? 'Blancs' : 'Noirs'}`;
    turnIndicator.style.color = currentTurn === 'white' ? '#fff' : '#000';
    turnIndicator.style.textShadow = currentTurn === 'black' ? '0 0 5px white' : 'none';
}
function updateBoardTransform() {
    if (activeSquares.size === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    activeSquares.forEach((v, k) => {
        const [x, y] = k.split(',').map(Number);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const transX = -centerX * SQUARE_SIZE;
    const transY = -centerY * SQUARE_SIZE;

    // We use rotate(180deg) if black. 
    // Since origin is 0,0 (board center point), rotating 180deg flips it around that point.
    const rotation = chessBoard.classList.contains('rotated-view') ? 'rotate(180deg)' : '';
    chessBoard.style.transform = `translate(${transX}px, ${transY}px) ${rotation}`;
}

/* --- Advanced Move Validation (Check/Schach) --- */

function getBoardFingerprint() {
    let raw = "";
    const sortedKeys = Array.from(pieces.keys()).sort();
    sortedKeys.forEach(k => {
        const p = pieces.get(k);
        raw += `${k}:${p.color}${p.type}|`;
    });
    return raw;
}

function checkThreefoldRepetition() {
    const fingerprint = getBoardFingerprint();
    const count = (boardHistory.get(fingerprint) || 0) + 1;
    boardHistory.set(fingerprint, count);
    return count >= 3;
}

function getLegalMoves(x, y) {
    const piece = pieces.get(`${x},${y}`);
    if (!piece) return [];

    const candidateMoves = calculateMoves(x, y, piece, pieces);

    return candidateMoves.filter(move => {
        const tempPieces = new Map(pieces);
        tempPieces.delete(`${x},${y}`);
        tempPieces.set(move.target, piece);
        if (move.type === 'enpassant') tempPieces.delete(move.captureKey);

        return !isCheck(piece.color, tempPieces);
    });
}

function isCheck(color, piecesMap = pieces) {
    let kingKey = null;
    piecesMap.forEach((p, k) => {
        if (p.type === 'king' && p.color === color) kingKey = k;
    });
    if (!kingKey) return false;
    const [kx, ky] = kingKey.split(',').map(Number);
    return isSquareAttacked(kx, ky, color === 'white' ? 'black' : 'white', piecesMap);
}

function isSquareAttacked(tx, ty, byColor, piecesMap = pieces) {
    // Convert to array once to avoid issues if map is modified (though it shouldn't be with temp maps)
    const items = Array.from(piecesMap.entries());
    for (let i = 0; i < items.length; i++) {
        const [k, p] = items[i];
        if (p.color === byColor) {
            const [x, y] = k.split(',').map(Number);
            const moves = calculateMoves(x, y, p, piecesMap);
            for (let j = 0; j < moves.length; j++) {
                if (moves[j].target === `${tx},${ty}`) return true;
            }
        }
    }
    return false;
}

function isCheckmate(color, piecesMap = pieces) {
    if (!isCheck(color, piecesMap)) return false;
    return hasNoLegalMoves(color, piecesMap);
}

function isStalemate(color, piecesMap = pieces) {
    if (isCheck(color, piecesMap)) return false;
    return hasNoLegalMoves(color, piecesMap);
}

function hasNoLegalMoves(color, piecesMap = pieces) {
    const items = Array.from(piecesMap.entries());
    for (const [k, p] of items) {
        if (p.color === color) {
            const [x, y] = k.split(',').map(Number);
            const candidateMoves = calculateMoves(x, y, p, piecesMap);
            const hasLegal = candidateMoves.some(move => {
                const tempPieces = new Map(piecesMap);
                tempPieces.delete(k);
                tempPieces.set(move.target, p);
                if (move.type === 'enpassant') tempPieces.delete(move.captureKey);
                return !isCheck(color, tempPieces);
            });
            if (hasLegal) return false;
        }
    }
    return true;
}

function showNotification(msg, type = 'default') {
    const notif = document.createElement('div');
    notif.className = `game-notification ${type}`;

    const text = document.createElement('span');
    text.textContent = msg;
    notif.appendChild(text);

    const closeBtn = document.createElement('span');
    closeBtn.className = 'notif-close';
    closeBtn.textContent = ' ×';
    closeBtn.onclick = () => notif.remove();
    notif.appendChild(closeBtn);

    notificationContainer.appendChild(notif);

    // Les erreurs sont persistantes jusqu'à finishMoveSequence
    if (type !== 'error') {
        setTimeout(() => {
            if (notif.parentNode) {
                notif.style.opacity = '0';
                notif.style.transform = 'translateY(10px)';
                notif.style.transition = 'all 0.5s ease-out';
                setTimeout(() => { if (notif.parentNode) notif.remove(); }, 500);
            }
        }, 4000);
    }
}
