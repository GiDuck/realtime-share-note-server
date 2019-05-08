const app = require('express')();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

//CORS 제어를 위한 모듈
const cors = require('cors');
const mongoose = require('mongoose');
const MONGO_URL = 'mongodb://localhost/note';

const bodyParser = require('body-parser');

//Mongoose Schema 관련 Models...
const DocumentModelSchema = new mongoose.Schema({noteId : String, content : Object, updateDate : Date});
const DocumentModel = mongoose.model('Document', DocumentModelSchema, 'sharenote');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

mongoose.Promise = global.Promise;

//Mongo DB 커넥션
mongoose.connect(MONGO_URL)
    .then(()=> console.log("mongo db 연결 성공"))
    .catch(e => console.log(e));

app.use(cors());

//기존에 있던 문서를 찾아온다. 만약 2개 이상의 문서가 있으면 제일 최신의 문서를 뽑아옴.
app.get('/getDocument/:noteId', (req, res) => {
    let noteId = req.params.noteId;
    DocumentModel.findOne({noteId : noteId}).sort({"$natural" : -1}).limit(1).exec((err, result)=>{
        console.log("몽고 조회 성공");
        console.log(result);
        if(result === null || result === undefined) {
            createDocument(noteId);
        }

        res.json(result);
    });
});

//SocketIO 관련 연산들
io.on('connection', (socket) => {

   console.log("connected");

   socket.on('joinRoom', (noteId) => {
       socket.join(noteId, ()=> console.log("채팅방 연결 성공.." + noteId));
   });

    socket.on('leaveRoom', (noteId) => {
        socket.leave(noteId, ()=> console.log("채팅방 연결 종료.." + noteId));
    });

   socket.on('changed', (noteId, userId, blockId, str) => {
       console.log("들어온 메시지.. " + noteId + " " + userId + " " + blockId + " " + str);
       io.to(noteId).emit('changed', noteId, userId, blockId, str);
   });

   socket.on('appendRow', (noteId, userId, blockId, position, rightSideContent) => {
       console.log("appendRow... %s %s %s %s", noteId, userId, blockId, position, rightSideContent);
       saveRow(noteId, blockId, position);
       io.to(noteId).emit('appendRow',noteId, userId, blockId, position, rightSideContent);

   });

   socket.on('removeRow', (noteId, userId, blockId) => {
       console.log("removeRow... %s %s %s", noteId, userId, blockId);
       removeDocument(noteId, userId, blockId);
       io.to(noteId).emit('removeRow', noteId, userId, blockId);
   });

    socket.on('blur', (noteId, userId, blockId, str) => {
        console.log("Blurred.. %s %s %s %s " , noteId, userId, blockId, str);
        if(str.length < 1) return;
        saveDocument(noteId, userId, blockId, str);
    });


});

function createDocument(noteId){

    new DocumentModel({noteId : noteId, updateDate : new Date().getTime(), content : []}).save().then(()=> console.log("문서 생성 성공"));

}

function removeDocument(noteId, userId, blockId){

    DocumentModel.update({noteId : noteId}, {$pull : { 'content' : {'blockId' : blockId}}}).then(result => console.log(result));

}

function saveDocument(noteId, userId, blockId, str){

    DocumentModel.update({noteId : noteId, 'content.blockId' : blockId },
        {'content.$.html' : str,
         'content.$.updateDate' : new Date()})
        .then( result => {console.log(result)} );

}

//새로운 블록 추가
function saveRow(noteId, blockId, position){

    //note를 찾아서 새롭게 추가한 블록을 update
    DocumentModel.findOne({noteId : noteId})
        .then(result => {

            let updatedContent = [];
            let newBlock = { noteId : noteId, blockId : blockId, html : "", updateDate : new Date() };

            if(result.content.length < 1){
                updatedContent.push(newBlock);

            }else{
                updatedContent = result.content;
                updatedContent.splice(position, 0, newBlock);

            }
            return DocumentModel.update({noteId : noteId}, {content : updatedContent});
        });
}

http.listen(3001, ()=>{
    console.log("3001번 리스닝 시작... 서버 시작.. 리스닝 중..");
});

