const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

// 1~25號，每號支援 10 個點不同的核心題目資料庫
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

// 用來儲存所有房間狀態的資料庫
const rooms = {};
let roomTimers = {};

io.on('connection', (socket) => {
    
    // 1. 關主建立遊戲
    socket.on('createGame', () => {
        const roomId = Math.floor(100000 + Math.random() * 900000).toString(); // 產生 6 位數隨機房號
        rooms[roomId] = {
            currentNumber: null,
            countdown: 120,
            usedNumbers: [],
            isCounting: false
        };
        socket.join(roomId);
        socket.emit('gameCreated', roomId);
    });

    // 2. 玩家加入遊戲
    socket.on('joinGame', ({ roomId, role }) => {
        if (!rooms[roomId]) {
            socket.emit('errorMsg', '找不到該房間號碼，請重新確認！');
            return;
        }
        socket.join(roomId);
        socket.emit('joinedSuccess', { roomId, role, state: rooms[roomId] });
    });

    // 3. 關主點擊號碼開題
    socket.on('hostSelectNumber', ({ roomId, num }) => {
        const room = rooms[roomId];
        if (!room || room.usedNumbers.includes(num)) return;

        clearInterval(roomTimers[roomId]);
        room.currentNumber = num;
        room.countdown = 120;
        room.isCounting = true;

        io.to(roomId).emit('startQuestion', {
            number: num,
            tasks: bingoDatabase[num],
            state: room
        });

        // 該房間獨立的同步計時器
        roomTimers[roomId] = setInterval(() => {
            room.countdown--;
            io.to(roomId).emit('timerUpdate', room.countdown);

            if (room.countdown <= 0) {
                clearInterval(roomTimers[roomId]);
                room.isCounting = false;
                io.to(roomId).emit('timeUp');
            }
        }, 1000);
    });

    // 4. 助理驗證成功，關主手動用螢光筆劃掉號碼
    socket.on('hostVerifyDone', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;
        
        clearInterval(roomTimers[roomId]);
        if (room.currentNumber && !room.usedNumbers.includes(room.currentNumber)) {
            room.usedNumbers.push(room.currentNumber);
        }
        room.isCounting = false;
        room.currentNumber = null;
        io.to(roomId).emit('syncState', room); 
    });

    // 5. 重置遊戲
    socket.on('hostReset', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;
        clearInterval(roomTimers[roomId]);
        rooms[roomId] = { currentNumber: null, countdown: 30, usedNumbers: [], isCounting: false };
        io.to(roomId).emit('syncState', rooms[roomId]);
    });
});

http.listen(PORT, () => {
    console.log(`房間版賓果系統已在 Port ${PORT} 啟動！`);
});