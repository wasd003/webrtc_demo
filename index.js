
/**
 * 作为演示这里暂时写死了
 * 从后端请求获取房间号，或者简单一点直接用课程的id作为房间号
 */
var roomNumber = '123456';

/**
 * 房间名必须以 'observable-'开头
 */
var roomName = 'observable-' + roomNumber;

/**
 * stun/turn服务器
 * 使用之前需要先引入https://cdn.scaledrone.com/scaledrone.min.js
 */
var drone = new ScaleDrone('87fYv4ncOoa0Cjne');

/**
 * 房间对象
 */
var room;

/**
 * RtcPeerConnection对象，用于负责：
 *  (1) sdp的交换
 *  (2) candidate的交换
 *  (3) 音视频流的交换
 */
var pc;

var configuration = {
    iceServers: [{
        urls: 'stun:stun.l.google.com:19302' // 使用谷歌的stun服务
    }]
};


/**
 * 连接信令服务器
 */
drone.on('open', function(error){
    if (error) return console.error(error);
    room = drone.subscribe(roomName);

    // 连接房间
    room.on('open', function(error){
        if (error) {onError(error);}
    });

    // 该事件只会在client刚刚进入房间的时候触发一次，members中包括自己
    room.on('members', function(members){
        console.log('MEMBERS:', members);

        // 第二个进入房间的人需要发起媒体协商
        var isOfferer = members.length === 2;
        startWebRTC(isOfferer);
    });
});

/**
 * 1. 交换candidate
 * 2. 交换sdp
 * 3. 交换mediaStream
 */
function startWebRTC(isOfferer) {
    pc = new RTCPeerConnection(configuration);

    // 1.1 开始收集candidate，每当收集到1个就通过信令服务器交换给对端
    pc.onicecandidate = function(event){
        if (event.candidate) {
            sendMessage({ 'candidate': event.candidate });
        }
    };

    // 2.1 发送sdp
    if (isOfferer) {
        // 媒体协商
        pc.onnegotiationneeded = function() {
            pc.createOffer().then(localDescCreated).catch(onError);
        };
    }

    // 3.1 获取本地媒体流
    navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
    }).then( function(stream) {
        localVideo.srcObject = stream;
        pc.addStream(stream); // 注意要把本地的mediaStream装载到pc中，这样对端才能获取到我们的mediaStream
    }, onError);

    // 3.2 获取对端mediaStream
    pc.onaddstream = function(event){
        remoteVideo.srcObject = event.stream;
    };

    // 监听信令数据
    room.on('data', function(message, client){
        // 消息是我自己发送的，则不处理
        if (client.id === drone.clientId) return;

        if (message.sdp) {
            // 2.2 获取sdp
            pc.setRemoteDescription(new RTCSessionDescription(message.sdp), function(){
                // 如果是offer就应答
                if (pc.remoteDescription.type === 'offer') {
                    pc.createAnswer().then(localDescCreated).catch(onError);
                }
            }, onError);
        }
        else if (message.candidate) {
            // 1.2 获取candidate
            pc.addIceCandidate(
                new RTCIceCandidate(message.candidate), onSuccess, onError
            );
        }
    });
}

/**
 * 以下为工具函数
 */
// 通过Scaledrone发送信令消息
function sendMessage(message) {
    drone.publish({
        room: roomName,
        message
    });
}
// 设置本地sdp并发送给对端
function localDescCreated(desc) {
    pc.setLocalDescription(desc, function(){
        sendMessage({ 'sdp': pc.localDescription });
    },onError);
}
function onSuccess() {}

function onError(error) {
    console.error(error);
}




