const express = require('express');
const app = report = express();
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
        21: `// ... 題目保持不變 ...`,
        25: `【點25】任務：閉上眼睛深呼吸 3 秒！`
    };
}

const rooms = {};
// 關鍵：將計時器與進行狀態改為「每個玩家獨立」儲存
// 結構會變成：playerActiveTasks[roomId][roleId] = { number, countdown, intervalId }
const playerActiveTasks = {}; 

io.on('connection', (socket) => {
    
    socket.on('createGame', () => {
        const roomId = Math.floor(100000 + Math.random() * 900000).toString();
        rooms[roomId] = {
            gameStarted: false, 
            hostSocketId: socket.id, // 記住關主大螢幕的通訊 ID
            players: {},         
            playerBoards: {}     
        };
        for(let i=1; i<=24; i++) { rooms[roomId].playerBoards[i] = []; }
        playerActiveTasks[roomId] = {};

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
        
        // 把當前所有人的進度同步給關主大螢幕
        io.to(roomId).emit('playerListUpdate', { players: room.players, playerBoards: room.playerBoards });
        
        // 如果這個特定的玩家本來就有正在進行的計時任務，幫他接回去
        const myCurrentTask = playerActiveTasks[roomId][assignedRole];
        if(myCurrentTask) {
            socket.emit('startQuestionSelf', { number: myCurrentTask.number, task: bingoDatabase[myCurrentTask.number][assignedRole], countdown: myCurrentTask.countdown });
        }
    });

    // 🎯 核心修正：海外玩家選號，走「完全獨立的個人頻道」
    socket.on('selectNumber', ({ roomId, num, roleId }) => {
        const room = rooms[roomId];
        if (!room || !room.gameStarted) return;
        
        // 如果該玩家自己目前已經有題目在倒數，不重複觸發
        if (playerActiveTasks[roomId][roleId]) return;

        // 建立該玩家的獨立計時任務
        playerActiveTasks[roomId][roleId] = {
            number: num,
            countdown: 120,
            intervalId: null
        };

        const taskText = bingoDatabase[num][roleId] || "此輪您無特別任務，請協助團隊完成。";

        // ⚡ 關鍵核心：只發送給點按鈕的這名玩家自己！絕對不廣播給其他玩家！ ⚡
        socket.emit('startQuestionSelf', {
            number: num,
            task: taskText,
            countdown: 120
        });

        // 📢 同步通知關主大螢幕：哪一個點點了幾號題，讓大螢幕可以顯示給台下看
        if (room.hostSocketId) {
            io.to(room.hostSocketId).emit('hostMonitorTask', {
                roleId: roleId,
                playerName: room.players[roleId],
                number: num,
                task: taskText,
                countdown: 120
            });
        }

        // 啟動專屬於該玩家的計時器
        playerActiveTasks[roomId][roleId].intervalId = setInterval(() => {
            if (!playerActiveTasks[roomId][roleId]) return;
            
            playerActiveTasks[roomId][roleId].countdown--;
            const currentCount = playerActiveTasks[roomId][roleId].countdown;

            // 獨立同步回傳給該玩家的手機
            socket.emit('timerUpdateSelf', currentCount);

            // 同步回傳給關主大螢幕
            if (room.hostSocketId) {
                io.to(room.hostSocketId).emit('hostMonitorTimer', { roleId: roleId, countdown: currentCount });
            }

            if (currentCount <= 0) {
                clearInterval(playerActiveTasks[roomId][roleId].intervalId);
                delete playerActiveTasks[roomId][roleId];
                socket.emit('timeUpSelf');
                if (room.hostSocketId) {
                    io.to(room.hostSocketId).emit('hostMonitorTimeUp', roleId);
                }
            }
        }, 1000);
    });

    // 玩家自己完成驗證：只結算他自己的分數，不影響他人！
    socket.on('verifyDoneSelf', ({ roomId, roleId }) => {
        const room = rooms[roomId];
        const task = playerActiveTasks[roomId][roleId];
        if (!room || !task) return;

        clearInterval(task.intervalId);
        const finalNum = task.number;

        // 核心：將該號碼正式計入該玩家個人的賓果進度盤中！
        if (!room.playerBoards[roleId].includes(finalNum)) {
            room.playerBoards[roleId].push(finalNum);
        }

        // 清除該玩家的獨立計時狀態
        delete playerActiveTasks[roomId][roleId];

        // 通知該玩家過關，清除手機倒數畫面
        socket.emit('taskClearedSelf', finalNum);

        // 通知關主大螢幕刷新「動態進度戰況牆」與號碼盤
        io.to(roomId).emit('playerListUpdate', { players: room.players, playerBoards: room.playerBoards });
        if (room.hostSocketId) {
            io.to(room.hostSocketId).emit('hostMonitorClear', roleId);
        }
    });

    socket.on('hostReset', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;
        
        // 清除所有玩家的獨立計時器
        if (playerActiveTasks[roomId]) {
            for (let rId in playerActiveTasks[roomId]) {
                clearInterval(playerActiveTasks[roomId][rId].intervalId);
            }
        }
        playerActiveTasks[roomId] = {};

        rooms[roomId] = { 
            gameStarted: false,
            hostSocketId: room.hostSocketId,
            players: {},
            playerBoards: {}
        };
        for(let i=1; i<=24; i++) { rooms[roomId].playerBoards[i] = []; }
        io.to(roomId).emit('playerListUpdate', { players: {}, playerBoards: rooms[roomId].playerBoards });
        io.to(roomId).emit('gameResetSignal');
    });
});

http.listen(PORT, () => {
    console.log(`真正各點獨立流轉的完美連線版伺服器已啟動！`);
});