


// the norm is not yet fully normalized, this is temporary, TODO update
//var RTCPeerConnection = window.PeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection; 
//navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia;
//var RTCIceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;
//var RTCSessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription;


// the socket handles sending messages between peer connections while they are in the
// process of connecting
var socket = new WebSocket('ws://' + window.location.host + window.location.pathname);
console.log('socket param: ' + 'ws://' + window.location.host + window.location.pathname);


socket.onopen = function() {
    sessionReady = true;
};

socket.onclose = function() {
    console.log('ERROR: connection error');
    alert('ERROR: disconnected from server');
}

socket.onmessage = function(message) {
    var msg = JSON.parse(message.data);

    switch(msg.type) {
        case 'assigned_id':
            socket.id = msg.id;
            console.log('socket id attributed = ' + socket.id);
            break;

        case 'peer_available':
            console.log('Peer is available, now trying to connect to him with RTCPeerConnection');
            start();
            break;

        case 'received_offer': 
            console.log('received offer', msg.data);
            pc.setRemoteDescription(new RTCSessionDescription(msg.data));
            pc.createAnswer(function(description) {
                console.log('sending answer');
                pc.setLocalDescription(description); 
                socket.send(JSON.stringify({
                    type: 'received_answer', 
                    data: description
                }));
            },
            function (err) {
                console.error(err);
            },
            mediaConstraints);
            break;

        case 'received_answer':
            console.log('received answer');
            if(!connected) {
                pc.setRemoteDescription(new RTCSessionDescription(msg.data));
                connected = true;
                nextButton.hidden = false;
                socket.send(JSON.stringify({
                    type: 'connection_ok'
                }));
            }
            break;

        case 'received_candidate':
            console.log('received candidate');
            var candidate = new RTCIceCandidate({
                sdpMLineIndex: msg.label,
                candidate: msg.candidate
            });
            pc.addIceCandidate(candidate);
            break;

        case 'connection_ok':
            connected = true;
            nextButton.hidden = false;
            break;

        case 'nexted':
            console.log('You\'ve been nexted!');
            connected = false;
            nextButton.hidden = true;
            vid2.hidden = true;
            $('#msg').val('').focus();
            $('#chat_area').empty();

            restartPc();

            socket.send(JSON.stringify({
                type: 'next_ack'
            }));

            break;

        case 'chat_msg':

            addMessageToChat('Partner: ', msg.data);

            break;

        case 'connection_closed':
            console.log('connection closed by peer');
            vid2.hidden = true;
            connected = false;
            nextButton.hidden = true;

            restartPc();

            socket.send(JSON.stringify({
                type: 'remote_connection_closed'
            }));

            break;
    }
};




//////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////


var nextButton;
var pc;
var pc_config = webrtcDetectedBrowser === 'firefox' ?
  {'iceServers':[{'url':'stun:23.21.150.121'}]} :
  {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]};

var pc_constraints = {
  'optional': [
    {'DtlsSrtpKeyAgreement': true}                                      // this is needed for chrome / firefox interoperability
  ]};

var localStream;
var remoteStream;
var pc;
var connected = false;
var sessionReady = false;
var mediaConstraints = {
    'mandatory': {
        'OfferToReceiveAudio':true, 
        'OfferToReceiveVideo':true
    }
};

function createNewPeerConnection() {
    try {
        pc = new RTCPeerConnection(pc_config, pc_constraints);
        pc.onicecandidate = handleIceCandidate;
    } catch (e) {
        console.log('Failed to create PeerConnection, exception: ' + e.message);
        // alert('Cannot create RTCPeerConnection object.');
        return;
    }
    pc.onaddstream = handleRemoteStreamAdded;
}

function handleIceCandidate(event) {
    if (event.candidate) {
        socket.send(JSON.stringify({
            type: 'received_candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate
        }));
    } else {
        console.log('End of candidates.');
    }
}

function handleRemoteStreamAdded(event) {
    console.log('Remote stream added');
    console.log(event);
    remoteStream = event.stream;
    vid2.src = window.URL.createObjectURL(event.stream);
    vid2.hidden = false;
    vid2.play();
}

function restartPc() {
    pc.close();
    createNewPeerConnection();
    pc.addStream(localStream);
}


createNewPeerConnection();


//////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////

function sendReadyMsg() {
    if (isReady()) {
        console.log('Sent session ready');
        socket.send(JSON.stringify({
            type: 'client_ready'
        }));

        setTimeout('sendKeepAlive()', 4000);            // we can start to send keep alive packets
    }
    else
        setTimeout('sendReadyMsg()', 1000);
}

function isReady() {
    //console.log('localStream ' + localStream);
    //console.log('session Ready ' + sessionReady);
    return localStream && sessionReady && socket.id;
}

function sendKeepAlive() {
    socket.send(JSON.stringify({
        type: 'keep_alive'
    }));

    console.log('Sending keep-alive packet...');

    setTimeout('sendKeepAlive()', 4000);
}


function broadcast() {
    
    // gets local video stream and renders to vid1
    getUserMedia({audio: true, video: true}, function(s) {    // we continue on this function when the user has accepted the webcam
        localStream = s;
        pc.addStream(s);
        vid1.src = window.URL.createObjectURL(s);
        vid1.play();

        sendReadyMsg();

    }, function(e) {
        console.log('getUserMedia error: ' + e.name);          // FIXME: ERROR NOT FIRED WHEN WEBCAM IS UNAVAILABLE WITH FIREFOX
        alert('Error: ' + e.name);
        socket.send(JSON.stringify({
            type: 'close'
        }));
    });
}


function start() {
    // this initializes the peer connection
    console.log('Creating offer for peer');
    pc.createOffer(function(description) {
        pc.setLocalDescription(description);
        socket.send(JSON.stringify({
            type: 'received_offer',
            data: description
        }));
    }, 
    function(err) {
        console.error(err);
    },
    mediaConstraints);
}

function next() {
    if (!connected) {
        console.log('Error: you can\'t next someone if you\'re not connected!');            // sanity check
        return;
    }

    console.log('Nexting this peer');
    connected = false;
    nextButton.hidden = true;
    vid2.hidden = true;
    $('#msg').val('').focus();
    $('#chat_area').empty();

    socket.send(JSON.stringify({
        type: 'next'
    }));

    restartPc();
}

function addMessageToChat(name, msg) {
    $('#chat_area').prepend('<p><strong>' + name + '</strong> ' + msg + '</p>');
}

window.onload = function() {

    $('#chat_form').submit(function () {            // FIXME it looks ugly 
        var message = $('#msg').val();

        socket.send(JSON.stringify({
            type: 'chat_msg',
            data: message
        }));

        addMessageToChat('You: ', message);
        $('#msg').val('').focus();

        return false;           // so that we don't reload the page
    });


    nextButton = document.getElementById("nextButton");
    nextButton.hidden = true;

    if(nextButton.addEventListener){
        nextButton.addEventListener("click", function() { next();});
    } else {
        nextButton.attachEvent("click", function() { next();});
    };

    broadcast();
};

window.onbeforeunload = function() {
    socket.send(JSON.stringify({
        type: 'close'
    }));
    pc.close();
    pc = null;
};


