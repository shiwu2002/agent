# WebSocket 多类型通信接口文档

## 1. 概述

本文档详细描述了系统中 WebSocket 多类型通信接口的使用方法，包括语音通信、文本聊天和视频通信三种类型。每种类型使用不同的 URL 端点进行连接，但共享同一套后端处理逻辑。

## 2. 连接端点

系统提供三个不同的 WebSocket 端点，分别用于处理不同类型的通信：

| 端点 | 用途 | URL |
|------|------|-----|
| /ws/voice | 语音通信 | `ws://[host]:[port]/ws/voice[?userId=xxx]` |
| /ws/chat | 文本聊天 | `ws://[host]:[port]/ws/chat[?userId=xxx]` |
| /ws/video | 视频通信 | `ws://[host]:[port]/ws/video[?userId=xxx]` |

## 3. 连接参数

所有端点都支持可选的 `userId` 查询参数，用于标识用户身份：

```
?userId=[用户唯一标识]
```

示例：
```
ws://localhost:8080/ws/voice?userId=user123
```

## 4. 各类型通信详细说明

### 4.1 语音通信 (/ws/voice)

#### 4.1.1 连接建立
```javascript
const voiceSocket = new WebSocket('ws://localhost:8080/ws/voice?userId=user123');
```

#### 4.1.2 发送数据
语音通信主要通过二进制消息传递 PCM 音频数据：

```javascript
// 发送 PCM 音频数据
voiceSocket.send(audioData); // ArrayBuffer 或 Blob 格式
```

音频数据要求：
- 格式：PCM
- 采样率：16000Hz
- 位深度：16位
- 声道数：单声道

#### 4.1.3 接收数据
语音通信可以接收以下类型的数据：

1. 文本消息（语音识别结果或系统消息）：
```javascript
voiceSocket.onmessage = function(event) {
  if (typeof event.data === 'string') {
    console.log('收到文本消息:', event.data);
  }
};
```

2. 二进制消息（TTS合成的音频数据）：
```javascript
voiceSocket.onmessage = function(event) {
  if (event.data instanceof ArrayBuffer) {
    // 处理音频数据
    playAudio(event.data);
  }
};
```

#### 4.1.4 控制命令
可以通过文本消息发送控制命令：

| 命令 | 说明 |
|------|------|
| start_recording | 开始录音 |
| stop_recording | 停止录音 |

```javascript
// 发送控制命令
voiceSocket.send('start_recording');
```

### 4.2 文本聊天 (/ws/chat)

#### 4.2.1 连接建立
```javascript
const chatSocket = new WebSocket('ws://localhost:8080/ws/chat?userId=user123');
```

#### 4.2.2 发送数据
文本聊天通过文本消息传递聊天内容：

```javascript
// 发送文本消息
chatSocket.send('你好，这是一条聊天消息');
```

#### 4.2.3 接收数据
文本聊天接收来自AI或其他用户的回复消息：

```javascript
chatSocket.onmessage = function(event) {
  if (typeof event.data === 'string') {
    console.log('收到聊天消息:', event.data);
    // 显示在聊天界面上
    displayMessage(event.data);
  }
};
```

### 4.3 视频通信 (/ws/video)

#### 4.3.1 连接建立
```javascript
const videoSocket = new WebSocket('ws://localhost:8080/ws/video?userId=user123');
```

#### 4.3.2 发送数据
视频通信通过二进制消息传递视频帧数据：

```javascript
// 发送视频帧数据（JPEG格式）
videoSocket.send(videoFrameData); // ArrayBuffer 或 Blob 格式
```

#### 4.3.3 接收数据
视频通信可以接收其他用户的视频帧数据：

```javascript
videoSocket.onmessage = function(event) {
  if (event.data instanceof ArrayBuffer) {
    // 处理接收到的视频帧数据
    displayVideoFrame(event.data);
  } else if (typeof event.data === 'string') {
    // 处理文本控制消息
    handleControlMessage(event.data);
  }
};
```

## 5. 通用事件处理

所有类型的 WebSocket 连接都支持以下通用事件：

### 5.1 连接成功
```javascript
socket.onopen = function(event) {
  console.log('WebSocket连接已建立');
};
```

### 5.2 连接错误
```javascript
socket.onerror = function(event) {
  console.log('WebSocket连接发生错误');
};
```

### 5.3 连接关闭
```javascript
socket.onclose = function(event) {
  console.log('WebSocket连接已关闭');
};
```

## 6. 错误处理

当发生错误时，服务器会通过文本消息返回错误信息：

```javascript
socket.onmessage = function(event) {
  if (typeof event.data === 'string') {
    if (event.data.startsWith('处理失败:') || 
        event.data.startsWith('识别失败:') || 
        event.data.startsWith('AI处理失败:')) {
      console.error('服务器错误:', event.data);
    } else {
      // 正常消息处理
      handleNormalMessage(event.data);
    }
  }
};
```

## 7. 最佳实践

### 7.1 连接管理
```javascript
// 检查连接状态
if (socket.readyState === WebSocket.OPEN) {
  socket.send(data);
}

// 重连机制
function connectWithRetry(url, maxRetries = 5) {
  let retryCount = 0;
  
  function connect() {
    const socket = new WebSocket(url);
    
    socket.onclose = function() {
      if (retryCount < maxRetries) {
        retryCount++;
        setTimeout(connect, 1000 * retryCount); // 逐步增加重连间隔
      }
    };
    
    return socket;
  }
  
  return connect();
}
```

### 7.2 数据处理
```javascript
// 音频数据处理
function processAudioData(audioBuffer) {
  // 确保数据格式正确
  if (!(audioBuffer instanceof ArrayBuffer)) {
    console.error('音频数据格式错误');
    return;
  }
  
  // 发送数据
  if (voiceSocket.readyState === WebSocket.OPEN) {
    voiceSocket.send(audioBuffer);
  }
}

// 视频数据处理
function processVideoFrame(videoFrame) {
  // 确保数据格式正确
  if (!(videoFrame instanceof Blob || videoFrame instanceof ArrayBuffer)) {
    console.error('视频数据格式错误');
    return;
  }
  
  // 发送数据
  if (videoSocket.readyState === WebSocket.OPEN) {
    videoSocket.send(videoFrame);
  }
}
```

## 8. 完整示例

以下是一个完整的前端实现示例：

```html
<!DOCTYPE html>
<html>
<head>
  <title>WebSocket 多类型通信示例</title>
</head>
<body>
  <div>
    <h2>语音通信</h2>
    <button id="startVoice">开始语音通信</button>
    <button id="stopVoice">停止语音通信</button>
  </div>
  
  <div>
    <h2>文本聊天</h2>
    <div id="chatMessages" style="height: 200px; overflow-y: scroll; border: 1px solid #ccc;"></div>
    <input type="text" id="chatInput" placeholder="输入消息">
    <button id="sendChat">发送</button>
  </div>
  
  <div>
    <h2>视频通信</h2>
    <video id="localVideo" autoplay playsinline style="width: 320px; height: 240px;"></video>
    <video id="remoteVideo" autoplay playsinline style="width: 320px; height: 240px;"></video>
    <button id="startVideo">开始视频通信</button>
    <button id="stopVideo">停止视频通信</button>
  </div>

  <script>
    let voiceSocket, chatSocket, videoSocket;
    let mediaStream;
    
    // 语音通信
    document.getElementById('startVoice').onclick = function() {
      voiceSocket = new WebSocket('ws://localhost:8080/ws/voice?userId=user123');
      
      voiceSocket.onopen = function() {
        console.log('语音连接已建立');
        showStatus('语音连接已建立');
      };
      
      voiceSocket.onmessage = function(event) {
        if (typeof event.data === 'string') {
          console.log('收到文本消息:', event.data);
          showStatus('语音识别结果: ' + event.data);
        } else if (event.data instanceof ArrayBuffer) {
          console.log('收到音频数据');
          // 处理TTS音频数据
          playAudio(event.data);
        }
      };
      
      voiceSocket.onerror = function(error) {
        console.error('语音连接错误:', error);
        showStatus('语音连接错误');
      };
      
      voiceSocket.onclose = function() {
        console.log('语音连接已关闭');
        showStatus('语音连接已关闭');
      };
      
      // 开始录音
      startVoiceRecording();
    };
    
    document.getElementById('stopVoice').onclick = function() {
      if (voiceSocket) {
        voiceSocket.close();
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
    };
    
    // 文本聊天
    document.getElementById('sendChat').onclick = function() {
      const input = document.getElementById('chatInput');
      const message = input.value.trim();
      
      if (message && chatSocket && chatSocket.readyState === WebSocket.OPEN) {
        chatSocket.send(message);
        addChatMessage('我: ' + message);
        input.value = '';
      }
    };
    
    // 初始化文本聊天
    chatSocket = new WebSocket('ws://localhost:8080/ws/chat?userId=user123');
    
    chatSocket.onopen = function() {
      console.log('文本聊天连接已建立');
      showStatus('文本聊天连接已建立');
    };
    
    chatSocket.onmessage = function(event) {
      if (typeof event.data === 'string') {
        console.log('收到聊天消息:', event.data);
        addChatMessage('AI: ' + event.data);
      }
    };
    
    chatSocket.onerror = function(error) {
      console.error('聊天连接错误:', error);
      showStatus('聊天连接错误');
    };
    
    chatSocket.onclose = function() {
      console.log('聊天连接已关闭');
      showStatus('聊天连接已关闭');
    };
    
    // 视频通信
    document.getElementById('startVideo').onclick = function() {
      videoSocket = new WebSocket('ws://localhost:8080/ws/video?userId=user123');
      
      videoSocket.onopen = function() {
        console.log('视频连接已建立');
        showStatus('视频连接已建立');
      };
      
      videoSocket.onmessage = function(event) {
        if (event.data instanceof ArrayBuffer) {
          // 处理接收到的视频帧数据
          displayRemoteVideoFrame(event.data);
        } else if (typeof event.data === 'string') {
          console.log('视频控制消息:', event.data);
        }
      };
      
      videoSocket.onerror = function(error) {
        console.error('视频连接错误:', error);
        showStatus('视频连接错误');
      };
      
      videoSocket.onclose = function() {
        console.log('视频连接已关闭');
        showStatus('视频连接已关闭');
      };
      
      // 开始视频流传输
      startVideoStreaming();
    };
    
    document.getElementById('stopVideo').onclick = function() {
      if (videoSocket) {
        videoSocket.close();
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
    };
    
    // 开始语音录制
    function startVoiceRecording() {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          mediaStream = stream;
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const source = audioContext.createMediaStreamSource(stream);
          const processor = audioContext.createScriptProcessor(4096, 1, 1);
          
          source.connect(processor);
          processor.connect(audioContext.destination);
          
          processor.onaudioprocess = function(e) {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              pcmData[i] = inputData[i] * 0x7FFF;
            }
            
            if (voiceSocket && voiceSocket.readyState === WebSocket.OPEN) {
              voiceSocket.send(pcmData.buffer);
            }
          };
        })
        .catch(err => {
          console.error('获取麦克风失败:', err);
          showStatus('获取麦克风失败: ' + err.message);
        });
    }
    
    // 开始视频流传输
    function startVideoStreaming() {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          mediaStream = stream;
          const video = document.getElementById('localVideo');
          video.srcObject = stream;
          
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          setInterval(() => {
            if (videoSocket && videoSocket.readyState === WebSocket.OPEN) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              
              canvas.toBlob(blob => {
                if (blob) {
                  const reader = new FileReader();
                  reader.onload = function() {
                    videoSocket.send(reader.result);
                  };
                  reader.readAsArrayBuffer(blob);
                }
              }, 'image/jpeg', 0.7);
            }
          }, 100);
        })
        .catch(err => {
          console.error('获取摄像头失败:', err);
          showStatus('获取摄像头失败: ' + err.message);
        });
    }
    
    // 显示聊天消息
    function addChatMessage(message) {
      const messages = document.getElementById('chatMessages');
      const messageElement = document.createElement('div');
      messageElement.textContent = message;
      messages.appendChild(messageElement);
      messages.scrollTop = messages.scrollHeight;
    }
    
    // 显示状态信息
    function showStatus(message) {
      console.log(message);
      // 可以添加状态栏显示
    }
    
    // 播放音频
    function playAudio(audioData) {
      // 实现音频播放逻辑
      console.log('播放音频数据，长度:', audioData.byteLength);
    }
    
    // 显示远程视频帧
    function displayRemoteVideoFrame(frameData) {
      // 实现远程视频帧显示逻辑
      console.log('显示远程视频帧，大小:', frameData.byteLength);
    }
  </script>
</body>
</html>
```

## 9. 故障排除

### 9.1 连接问题
1. 检查服务器地址和端口是否正确
2. 确保网络连接正常
3. 检查防火墙设置是否阻止了WebSocket连接

### 9.2 数据传输问题
1. 确认发送的数据格式是否符合要求
2. 检查数据大小是否超出限制
3. 确认连接状态是否为OPEN

### 9.3 音视频质量问题
1. 检查设备是否正常工作
2. 确认采样率和格式设置是否正确
3. 检查网络带宽是否足够支持数据传输