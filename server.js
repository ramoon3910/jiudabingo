const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

// 1~25號 題目資料庫
const bingoDatabase = {};
for (let i = 1; i <= 25; i++) {
    bingoDatabase[i] = {
        1: `【點1】任務：整租一致进行三叩首`,
        2: `【點2】任務：一起朗诵开经集（薪火品)`,
        3: `【點3】任務：解释是五条佛规的第八条`,
        4: `【點4】任務：摆盘供果的分别：三人式和五人式的分别`,
        5: `【點5】任務：解释成功五大要素，一人一个`,
        6: `【點6】任務：道七步天梯: 求道, 學道, __(三)__, __(四)__, __(五)__. `,
        7: `【點7】任務："成功之五大條件: 遠見, 果斷, 握機, 認真 and 持恆. 用一張照片表達每個成功條件的意思. （可以是生活場景或創意達）"`,
        8: `【點8】任務：每个人说出引师和保师的名字、法号`,
        9: `【點9】任務：以（道）来做出5组两个字的造句，比如：道心`,
        10: `【點10】任務：进来佛堂后会做的3件事情`,
        11: `【點11】任務：和团队一起自拍比爱心照片，线下：每个人的手一起组大爱心、线上：每个人的手构图成大爱心`,
        12: `【點12】任務：菩薩八覺有哪八覺`,
        13: `【點13】任務：我們開始獻香前要先請示誰`,
        14: `【點14】任務：獻香哪一個仙佛的名字有重複`,
        15: `【點15】任務：請問九蓮聖經目前出到第幾品`,
        16: `【點16】任務：一人說兩個平日獻香的佛號(要接下去）`,
        17: `【點17】任務：獻早香的時候，草香的順序`,
        18: `【點18】任務：每人说一个道场称谓。`,
        19: `【點19】任務：每人說兩個道場中，最常用到的詞。（比如說"感謝慈悲“）`,
        20: `【點20】任務：每人説一個佛規`,
        21: `【點21】任務：九個長老院的名字 一人說一個`,
        22: `【點22】任務：一人說一個說出九達文德有設立佛堂的地區`,
        23: `【點23】任務：除了愛心，請各個地區的人員共同一起擺出一個造型代表要跟大家說的話 拍照呈現`,
        24: `【點24】任務：每個人說一個聖職前輩的法號和道職`,
        25: `【點25】任務：閉上眼睛深呼吸 3 秒！`
    };
}

const rooms = {};
let roomTimers = {};

io.on('connection', (socket) => {
    
    socket.on('createGame', () => {
        const roomId = Math.floor(100000 + Math.random() * 900000).toString();
        rooms[roomId] = {
            currentNumber: null,
            countdown: 120,
            usedNumbers: [],
            isCounting: false,
            gameStarted: false, 
            players: {},         
            playerBoards: {}     
        };
        for(let i=1; i<=24; i++) { rooms[roomId].playerBoards[i] = []; }
        socket.join(roomId);
        socket.emit('gameCreated', roomId);
    });

    socket.on('hostStartGame', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId].gameStarted = true;
            io.to(roomId).emit('gameStartedSignal', rooms[roomId]);
        }
    });

    socket.on('joinGame', ({ roomId, playerName }) => {
        const room = rooms[roomId];
        if (!room) {
            socket.emit('errorMsg', '找不到該房間號碼，請確認房號！');
            return;
        }

        let assignedRole = null;
        for (let roleId in room.players) {
            if (room.players[roleId] === playerName) {
                assignedRole = parseInt(roleId);
                break;
            }
        }
        
        if (!assignedRole) {
            for (let i = 1; i <= 24; i++) {
                if (!room.players[i]) {
                    room.players[i] = playerName;
                    assignedRole = i;
                    break;
                }
            }
        }

        if (!assignedRole) {
            socket.emit('errorMsg', '該賓果房間 24 個點的位置已滿！');
            return;
        }

        socket.join(roomId);
        socket.emit('joinedSuccess', { roomId, role: assignedRole, playerName, state: room });
        io.to(roomId).emit('playerListUpdate', { players: room.players, playerBoards: room.playerBoards });
        
        if(room.isCounting) {
            socket.emit('startQuestion', { number: room.currentNumber, tasks: bingoDatabase[room.currentNumber], state: room });
        }
    });

    // 🔒 核心重構：建立絕對不可動搖的「防掐斷保護鎖」
    socket.on('selectNumber', ({ roomId, num }) => {
        const room = rooms[roomId];
        if (!room || !room.gameStarted || room.usedNumbers.includes(num)) return;
        
        // 【關鍵修復 1】：如果目前全域正在倒數（isCounting 為 true），直接回絕這次請求。
        // 絕對不能往下執行，也絕對不可以碰到後面的 clearInterval，這樣正在進行的遊戲就不會被掐斷！
        if (room.isCounting) {
            socket.emit('errorMsg', `🛑 警告：全場正有隊伍在挑戰【${room.currentNumber}號題】，不允許中途干擾！請等當前任務完成。`);
            return;
        }

        // 通過檢查，代表此時全場沒有人在計時，可以安全鎖定並開啟新題目
        room.currentNumber = num;
        room.countdown = 120;
        room.isCounting = true; // 狀態上鎖！其他人此時點號碼都會在上面被 return 彈開

        io.to(roomId).emit('startQuestion', {
            number: num,
            tasks: bingoDatabase[num],
            state: room
        });

        // 只有在確認沒人使用的安全狀態下，才重製屬於這個房間的獨立計時器
        clearInterval(roomTimers[roomId]);
        roomTimers[roomId] = setInterval(() => {
            room.countdown--;
            io.to(roomId).emit('timerUpdate', room.countdown);

            if (room.countdown <= 0) {
                clearInterval(roomTimers[roomId]);
                room.isCounting = false; // 解鎖
                if (!room.usedNumbers.includes(room.currentNumber)) {
                    room.usedNumbers.push(room.currentNumber);
                }
                room.currentNumber = null;
                io.to(roomId).emit('timeUp');
                io.to(roomId).emit('syncState', room);
                io.to(roomId).emit('playerListUpdate', { players: room.players, playerBoards: room.playerBoards });
            }
        }, 1000);
    });

    socket.on('verifyDone', (roomId) => {
        const room = rooms[roomId];
        if (!room || !room.currentNumber) return;
        
        clearInterval(roomTimers[roomId]);
        const finalNum = room.currentNumber;

        if (!room.usedNumbers.includes(finalNum)) {
            room.usedNumbers.push(finalNum);
        }

        for (let i = 1; i <= 24; i++) {
            if (room.players[i] && bingoDatabase[finalNum][i]) {
                if (!room.playerBoards[i].includes(finalNum)) {
                    room.playerBoards[i].push(finalNum);
                }
            }
        }

        room.isCounting = false; // 開鎖
        room.currentNumber = null;
        io.to(roomId).emit('syncState', room); 
        io.to(roomId).emit('playerListUpdate', { players: room.players, playerBoards: room.playerBoards });
    });

    socket.on('hostReset', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;
        clearInterval(roomTimers[roomId]);
        rooms[roomId] = { 
            currentNumber: null, 
            countdown: 120, 
            usedNumbers: [], 
            isCounting: false,
            gameStarted: false,
            players: {},
            playerBoards: {}
        };
        for(let i=1; i<=24; i++) { rooms[roomId].playerBoards[i] = []; }
        io.to(roomId).emit('syncState', rooms[roomId]);
        io.to(roomId).emit('playerListUpdate', { players: {}, playerBoards: rooms[roomId].playerBoards });
    });
});

http.listen(PORT, () => {
    console.log(`終極防掐斷版伺服器已安全開跑！`);
});