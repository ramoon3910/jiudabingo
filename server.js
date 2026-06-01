const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

// 原始 25 道題目池
const rawTasks = {
    1: "任務：整租一致进行三叩首",
    2: "任務：一起朗诵开经集（薪火品)",
    3: "任務：解释是五条佛规的第八条",
    4: "任務：摆盘供果的分别：三人式和五人式的分别",
    5: "任務：解释成功五大要素，一人一个",
    6: "任務：道七步天梯: 求道, 學道, __(三)__, __(四)__, __(五)__. ",
    7: "任務：\"成功之五大條件: 遠見, 果斷, 握機, 認真 and 持恆. 用一張照片表達每個成功條件的意思. （可以是生活場景或創意達）\"",
    8: "任務：每个人说出引师和保师的名字、法号",
    9: "任務：以（道）来做出5组两个字的造句，比如：道心",
    10: "任務：进来佛堂后会做的3件事情",
    11: "任務：和团队一起自拍比爱心照片，线下：每个人的手一起组大爱心、线上：每个人的手构图成大爱心",
    12: "任務：菩薩八覺有哪八覺",
    13: "任務：我們開始獻香前要先請示誰",
    14: "任務：獻香哪一個仙佛的名字有重複",
    15: "任務：請問九蓮聖經目前出到第幾品",
    16: "任務：一人說兩個平日獻香的佛號(要接下去）",
    17: "任務：獻早香的時候，草香的順序",
    18: "任務：每人说一个道场称谓。",
    19: "任務：每人說兩個道場中，最常用到的詞。（比如說\"感謝慈悲“）",
    20: "任務：每人説一個佛规",
    21: "任務：九個長老院的名字 一人說一個",
    22: "任務：一人說一個說出九達文德有設立佛堂的地區",
    23: "任務：除了愛心，請各個地區的人員共同一起擺出一個造型代表要跟大家說的話 拍照呈現",
    24: "任務：每個人說一個聖職前輩的法號和道職",
    25: "任務：閉上眼睛深呼吸 3 秒！"
};

// 洗牌函式 (Fisher-Yates)
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

const rooms = {};
const playerActiveTasks = {}; 
// 👑 核心：存放每個玩家「專屬的號碼對應題目」
const playerCustomDatabases = {}; 

io.on('connection', (socket) => {
    
    socket.on('createGame', () => {
        const roomId = Math.floor(100000 + Math.random() * 900000).toString();
        rooms[roomId] = {
            gameStarted: false, 
            hostSocketId: socket.id,
            players: {},         
            playerBoards: {}     
        };
        for(let i=1; i<=24; i++) { rooms[roomId].playerBoards[i] = []; }
        playerActiveTasks[roomId] = {};
        playerCustomDatabases[roomId] = {}; // 初始化房間題庫
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
            socket.emit('errorMsg', '找不到該房間號碼！');
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
            socket.emit('errorMsg', '該房間位置已滿！');
            return;
        }

        // 👑 完美修復：當玩家成功加入時，後端立刻幫他把 25 題重新隨機洗牌派發！
        if (!playerCustomDatabases[roomId][assignedRole]) {
            playerCustomDatabases[roomId][assignedRole] = {};
            const keys = Object.keys(rawTasks); // [1, 2, ..., 25]
            const shuffledTaskIds = shuffleArray(keys); // 打亂後的題目 ID 順序
            
            // 將號碼 1~25 與隨機打亂後的題目重新綁定，做到每個人的號碼背後都是不同的題目！
            for (let num = 1; num <= 25; num++) {
                const randomTaskId = shuffledTaskIds[num - 1];
                playerCustomDatabases[roomId][assignedRole][num] = `【點${assignedRole} × 號碼${num}】${rawTasks[randomTaskId]}`;
            }
        }

        socket.join(roomId);
        socket.emit('joinedSuccess', { roomId, role: assignedRole, playerName, state: room });
        io.to(roomId).emit('playerListUpdate', { players: room.players, playerBoards: room.playerBoards });
        
        const myCurrentTask = playerActiveTasks[roomId][assignedRole];
        if(myCurrentTask) {
            const currentTaskText = playerCustomDatabases[roomId][assignedRole][myCurrentTask.number];
            socket.emit('startQuestionSelf', { number: myCurrentTask.number, task: currentTaskText, countdown: myCurrentTask.countdown });
        }
    });

    socket.on('selectNumber', ({ roomId, num, roleId }) => {
        const room = rooms[roomId];
        if (!room || !room.gameStarted) return;
        if (playerActiveTasks[roomId][roleId]) return;

        playerActiveTasks[roomId][roleId] = {
            number: num,
            countdown: 120,
            intervalId: null
        };

        // 👑 抓取該玩家專屬洗牌後的盲盒題目
        const taskText = playerCustomDatabases[roomId][roleId][num];

        socket.emit('startQuestionSelf', {
            number: num,
            task: taskText,
            countdown: 120
        });

        if (room.hostSocketId) {
            io.to(room.hostSocketId).emit('hostMonitorTask', {
                roleId: roleId,
                playerName: room.players[roleId],
                number: num,
                task: taskText,
                countdown: 120
            });
        }

        playerActiveTasks[roomId][roleId].intervalId = setInterval(() => {
            if (!playerActiveTasks[roomId][roleId]) return;
            
            playerActiveTasks[roomId][roleId].countdown--;
            const currentCount = playerActiveTasks[roomId][roleId].countdown;

            socket.emit('timerUpdateSelf', currentCount);

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

    socket.on('verifyDoneSelf', ({ roomId, roleId }) => {
        const room = rooms[roomId];
        const task = playerActiveTasks[roomId][roleId];
        if (!room || !task) return;

        clearInterval(task.intervalId);
        const finalNum = task.number;

        if (!room.playerBoards[roleId].includes(finalNum)) {
            room.playerBoards[roleId].push(finalNum);
        }

        delete playerActiveTasks[roomId][roleId];
        socket.emit('taskClearedSelf', finalNum);

        io.to(roomId).emit('playerListUpdate', { players: room.players, playerBoards: room.playerBoards });
        if (room.hostSocketId) {
            io.to(room.hostSocketId).emit('hostMonitorClear', roleId);
        }
    });

    socket.on('hostReset', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;
        
        if (playerActiveTasks[roomId]) {
            for (let rId in playerActiveTasks[roomId]) {
                clearInterval(playerActiveTasks[roomId][rId].intervalId);
            }
        }
        playerActiveTasks[roomId] = {};
        playerCustomDatabases[roomId] = {}; // 清空自訂題庫

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
    console.log(`前後端全隨機盲盒大滿貫版伺服器運作中！`);
});