# WebSocket 接口完整文档

## 1. 概述

本文档描述了系统提供的所有WebSocket接口。系统支持两种类型的WebSocket连接：
1. 纯语音处理接口 - 用于实时语音识别
2. 文本和语音混合处理接口 - 支持文本聊天和语音识别

## 2. WebSocket端点

### 2.1 语音处理端点

```
ws://localhost:8080/ws/voice
```

用于实时语音识别，支持流式音频输入和实时文本输出。

### 2.2 文本/语音聊天端点

```
ws://localhost:8080/ws/chat
```

支持文本聊天和语音识别功能，可以动态切换输入模式。

## 3. 消息格式

所有文本消息均采用JSON格式：

```json
{
  "type": "消息类型",
  "content": "消息内容"
}
```

### 3.1 消息类型

| 类型    | 描述             |
|---------|------------------|
| PING    | 心跳检测请求     |
| PONG    | 心跳检测响应     |
| CONTROL | 控制命令和状态信息 |
| AUDIO   | 音频文本消息     |

## 4. 语音处理接口 (/ws/voice)

### 4.1 建立连接

客户端发起WebSocket连接后，服务器会发送一条连接成功的消息：

```json
{
  "type": "CONTROL",
  "content": "connected"
}
```

### 4.2 心跳检测

为了保持连接活跃，客户端应该定期发送PING消息：

```json
{
  "type": "PING",
  "content": ""
}
```

服务器会回复PONG消息：

```json
{
  "type": "PONG",
  "content": ""
}
```

### 4.3 控制命令

#### 中断识别

```json
{
  "type": "CONTROL",
  "content": "interrupt"
}
```

服务器响应：

```json
{
  "type": "CONTROL",
  "content": "interrupted"
}
```

#### 停止录音

```json
{
  "type": "CONTROL",
  "content": "stop_recording"
}
```

服务器响应：

```json
{
  "type": "CONTROL",
  "content": "recording_stopped"
}
```

#### 开始识别

```json
{
  "type": "CONTROL",
  "content": "start_recognition"
}
```

服务器响应：

```json
{
  "type": "CONTROL",
  "content": "recognition_started"
}
```

### 4.4 音频数据传输

音频数据通过二进制消息传输。支持的音频格式：

- 采样率：16kHz
- 位深度：16位
- 声道数：单声道
- 字节序：小端序

客户端持续发送音频数据包，服务器将实时返回识别结果。

### 4.5 识别结果

#### 中间结果

```json
{
  "type": "CONTROL",
  "content": "partial:识别的部分文本内容"
}
```

#### 最终结果

```json
{
  "type": "CONTROL",
  "content": "final:识别的最终文本内容"
}
```

### 4.6 错误处理

当发生错误时，服务器会发送错误消息：

```json
{
  "type": "CONTROL",
  "content": "error:错误描述信息"
}
```

## 5. 文本/语音聊天接口 (/ws/chat)

### 5.1 建立连接

客户端发起WebSocket连接后，服务器会发送一条连接成功的消息：

```json
{
  "type": "CONTROL",
  "content": "connected"
}
```

默认输入模式为文本模式。

### 5.2 心跳检测

与语音处理接口相同，支持PING/PONG心跳检测。

### 5.3 控制命令

#### 切换到文本模式

```json
{
  "type": "CONTROL",
  "content": "switch_to_text"
}
```

服务器响应：

```json
{
  "type": "CONTROL",
  "content": "已切换到文本模式"
}
```

#### 切换到语音模式

```json
{
  "type": "CONTROL",
  "content": "switch_to_voice"
}
```

服务器响应：

```json
{
  "type": "CONTROL",
  "content": "已切换到语音模式"
}
```

#### 中断识别

```json
{
  "type": "CONTROL",
  "content": "interrupt"
}
```

服务器响应：

```json
{
  "type": "CONTROL",
  "content": "interrupted"
}
```

### 5.4 文本消息处理

在文本模式下，发送普通文本消息：

```json
{
  "type": "CONTROL",
  "content": "你好，AI助手！"
}
```

服务器响应AI回答：

```json
{
  "type": "CONTROL",
  "content": "ai_response:你好！有什么我可以帮你的吗？"
}
```

### 5.5 音频数据传输

在语音模式下，音频数据通过二进制消息传输，格式要求与语音处理接口相同。

语音识别结果：

#### 中间识别结果

```json
{
  "type": "CONTROL",
  "content": "partial_asr_result:识别的部分文本内容"
}
```

#### 最终识别结果

```json
{
  "type": "CONTROL",
  "content": "final_asr_result:识别的最终文本内容"
}
```

语音识别完成后，服务器会自动调用AI模型并返回回答：

```json
{
  "type": "CONTROL",
  "content": "ai_response:AI的回答内容"
}
```

### 5.6 音频文本消息

客户端也可以直接发送AUDIO类型的消息，内容为音频识别后的文本：

```json
{
  "type": "AUDIO",
  "content": "通过音频识别得到的文本"
}
```

服务器会直接调用AI模型并返回回答：

```json
{
  "type": "CONTROL",
  "content": "ai_response:AI的回答内容"
}
```

## 6. 使用示例

### 6.1 JavaScript客户端示例（语音处理）

```javascript
// 建立WebSocket连接
const voiceSocket = new WebSocket('ws://localhost:8080/ws/voice');

// 连接打开时的处理
voiceSocket.onopen = function(event) {
  console.log('语音WebSocket连接已建立');
};

// 接收消息时的处理
voiceSocket.onmessage = function(event) {
  if (typeof event.data === 'string') {
    const message = JSON.parse(event.data);
    
    switch (message.type) {
      case 'CONTROL':
        if (message.content === 'connected') {
          console.log('连接成功');
        } else if (message.content.startsWith('partial:')) {
          const partialText = message.content.substring(8);
          console.log('中间结果:', partialText);
        } else if (message.content.startsWith('final:')) {
          const finalText = message.content.substring(6);
          console.log('最终结果:', finalText);
        } else if (message.content.startsWith('error:')) {
          const error = message.content.substring(6);
          console.error('错误:', error);
        }
        break;
    }
  }
};

// 发送音频数据
function sendVoiceData(audioBuffer) {
  voiceSocket.send(audioBuffer);
}

// 发送控制命令
function sendVoiceControlCommand(command) {
  const message = {
    type: 'CONTROL',
    content: command
  };
  voiceSocket.send(JSON.stringify(message));
}
```

### 6.2 JavaScript客户端示例（文本/语音聊天）

```javascript
// 建立WebSocket连接
const chatSocket = new WebSocket('ws://localhost:8080/ws/chat');

// 连接打开时的处理
chatSocket.onopen = function(event) {
  console.log('聊天WebSocket连接已建立');
};

// 接收消息时的处理
chatSocket.onmessage = function(event) {
  if (typeof event.data === 'string') {
    const message = JSON.parse(event.data);
    
    switch (message.type) {
      case 'CONTROL':
        if (message.content === 'connected') {
          console.log('连接成功');
        } else if (message.content === '已切换到文本模式') {
          console.log('已切换到文本模式');
        } else if (message.content === '已切换到语音模式') {
          console.log('已切换到语音模式');
        } else if (message.content.startsWith('ai_response:')) {
          const aiResponse = message.content.substring(12);
          console.log('AI回答:', aiResponse);
        } else if (message.content.startsWith('partial_asr_result:')) {
          const partialText = message.content.substring(19);
          console.log('语音识别中间结果:', partialText);
        } else if (message.content.startsWith('final_asr_result:')) {
          const finalText = message.content.substring(17);
          console.log('语音识别最终结果:', finalText);
        } else if (message.content.startsWith('error:')) {
          const error = message.content.substring(6);
          console.error('错误:', error);
        }
        break;
    }
  }
};

// 发送文本消息
function sendTextMessage(text) {
  const message = {
    type: 'CONTROL',
    content: text
  };
  chatSocket.send(JSON.stringify(message));
}

// 发送音频数据
function sendVoiceData(audioBuffer) {
  chatSocket.send(audioBuffer);
}

// 发送控制命令
function sendChatControlCommand(command) {
  const message = {
    type: 'CONTROL',
    content: command
  };
  chatSocket.send(JSON.stringify(message));
}

// 切换到语音模式
function switchToVoiceMode() {
  sendChatControlCommand('switch_to_voice');
}

// 切换到文本模式
function switchToTextMode() {
  sendChatControlCommand('switch_to_text');
}
```

## 7. 最佳实践

1. **音频格式要求**：确保音频数据符合指定格式（16kHz, 16位, 单声道, 小端序）

2. **连接维护**：定期发送PING消息以维持连接活跃

3. **错误处理**：妥善处理错误消息，必要时重新建立连接

4. **资源管理**：在不需要功能时及时中断识别或关闭连接

5. **模式切换**：在文本/语音聊天接口中，根据需要合理切换输入模式

6. **数据分片**：合理分片音频数据，避免单次传输过大或过小的数据块

## 8. 注意事项

1. 服务器会自动处理连接超时问题，但客户端也应实现适当的心跳机制
2. 音频数据传输过程中应保持稳定的网络连接
3. 当前实现支持中文语音识别
4. 文本/语音聊天接口默认为文本模式，需要语音功能时需手动切换
5. 服务器会在后台定期发送静音数据以维持连接活跃