# 语音 WebSocket 接口文档（VoiceWebSocketHandler）

## 接口说明

本接口用于实现前后端语音流交互，支持音频数据的实时收发、语音识别、AI回复（TTS合成音频）等功能。所有音频数据均通过 WebSocket 二进制流传输，前端无需处理文本回复，后端也不进行本地音频播放。

---

## 连接地址

```
ws://<服务器地址>/ws/voice
```
- 具体路径请根据实际部署环境配置 WebSocket 路由。

---

## 消息类型

### 1. 二进制消息（音频流）

- 前端发送：16kHz、16bit、单声道 PCM 音频数据，直接以二进制流发送。
- 后端回复：AI大模型经TTS合成后的音频，直接以二进制流发送，格式与前端发送一致。

### 2. 文本消息（JSON字符串）

用于控制命令、心跳、识别结果等，格式如下：

```json
{
  "type": "CONTROL | TEXT | ERROR | PING | PONG",
  "content": "命令或内容"
}
```

#### 常见类型说明

- `CONTROL`：控制命令，如连接、录音开始/结束、识别开始/结束等。
- `TEXT`：识别结果（仅用于中间/最终识别文本，前端可忽略）。
- `ERROR`：错误信息。
- `PING`/`PONG`：心跳包。

---

## 典型交互流程

1. **建立连接**
   - 前端发起 WebSocket 连接，收到 `{"type":"CONTROL","content":"connected"}` 表示连接成功。

2. **发送音频数据**
   - 前端持续发送 PCM 格式音频二进制流。

3. **语音识别**
   - 后端实时处理音频流，识别结果通过 `TEXT` 类型消息返回（可选，前端可忽略）。

4. **AI回复（TTS合成）**
   - 识别到一句完整语音后，后端调用大模型生成回复，并通过 TTS 合成音频，直接以二进制流发送给前端。

5. **控制命令**
   - 前端可发送控制类 JSON 消息，如：
     - `{"type":"CONTROL","content":"start_recording"}`
     - `{"type":"CONTROL","content":"stop_recording"}`
     - `{"type":"CONTROL","content":"interrupt"}`
     - `{"type":"PING"}`

6. **心跳与超时**
   - 后端定期发送静音音频流保持连接，前后端可通过 `PING`/`PONG` 消息维持心跳。

7. **错误处理**
   - 发生异常时，后端通过 `ERROR` 类型消息返回错误详情。

---

## 音频数据格式

- **采样率**：16kHz
- **采样位数**：16bit
- **声道数**：1（单声道）
- **字节序**：小端序（Little Endian）
- **编码**：PCM_SIGNED

---

## 控制命令一览

| 命令内容           | 说明                   |
|--------------------|------------------------|
| start_recording    | 开始录音               |
| stop_recording     | 停止录音               |
| start_recognition  | 重新开始识别           |
| interrupt          | 打断当前识别过程       |
| open_websocket     | 开启WebSocket相关功能  |
| close_websocket    | 关闭WebSocket相关功能  |

---

## 错误处理

- 所有错误均通过如下格式返回：
```json
{
  "type": "ERROR",
  "content": "错误描述"
}
```

---

## 会话管理

- 每个 WebSocket 连接对应一个独立会话，后端自动管理会话状态、心跳、资源清理等。
- 连接关闭时自动释放资源。

---

## 示例代码片段

### 前端发送音频流

```js
const ws = new WebSocket('ws://服务器地址/ws/voice');
ws.binaryType = 'arraybuffer';

// 发送音频数据
ws.send(audioBuffer); // audioBuffer为PCM音频二进制数据

// 发送控制命令
ws.send(JSON.stringify({ type: 'CONTROL', content: 'start_recording' }));
```

### 前端接收TTS音频流

```js
ws.onmessage = function(event) {
  if (event.data instanceof ArrayBuffer) {
    // 收到TTS合成音频，直接播放或处理
    playPcmAudio(event.data);
  } else {
    // 收到文本消息（如控制、错误等）
    const msg = JSON.parse(event.data);
    // 根据type和content处理
  }
};
```

---

## 注意事项

- 后端不会发送AI文本回复，仅发送TTS合成音频流。
- 后端不会在本地播放任何音频。
- 音频流收发格式完全一致，前端无需区分来源，直接处理二进制流即可。
- 控制命令和错误信息均通过JSON文本消息传递。

---

## 联系与支持

如需进一步技术支持或接口对接说明，请联系后端开发团队。
