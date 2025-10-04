# WebSocket API 文档

## 概述

本文档详细描述了系统的 WebSocket API 接口，包括连接端点、消息格式、通信协议等。系统支持三种类型的 WebSocket 连接：语音通信、文本聊天和视频通信。

所有消息都使用统一的 JSON 格式进行传输，通过 [type](file:///D:/AiAgent/spring_ai_agent/src/main/java/shiwu/agent/dto/WebSocketMessage.java#L80-L83) 字段区分消息类型，确保前后端通信的一致性和可维护性。

## 连接端点

系统提供三个不同的 WebSocket 端点用于不同类型的通信：

1. **语音通信**: `ws://localhost:8080/ws/voice`
2. **文本聊天**: `ws://localhost:8080/ws/chat`
3. **视频通信**: `ws://localhost:8080/ws/video`

## 认证

连接建立时可以通过 URL 参数传递用户标识：

```
ws://localhost:8080/ws/voice?userId=your_user_id
```

如果未提供 userId，系统将使用会话 ID 作为用户标识。

## 消息类型

系统支持两种类型的消息：

1. **文本消息** - 用于传输控制命令和聊天内容，使用统一的JSON格式
2. **二进制消息** - 用于传输音频/视频数据

## 消息格式

所有文本消息都使用统一的JSON格式：

```json
{
  "type": "消息类型",
  "content": "消息内容",
  "messageId": "可选，消息ID",
  "userId": "可选，用户ID",
  "metadata": {
    "可选": "元数据"
  }
}
```

### 消息类型说明

| 类型 | 说明 | 是否需要AI处理 |
|------|------|----------------|
| `chat` | 聊天消息，需要AI处理 | 是 |
| `control` | 控制消息，用于前后端交互 | 否 |
| `ping` | 心跳消息 | 否 |
| `pong` | 心跳响应消息 | 否 |

## 通信协议

### 1. 语音通信 (voice)

语音通信支持实时语音识别和语音合成功能。

#### 支持的消息类型

##### 文本消息（控制命令）

###### 心跳消息
```json
// 发送到服务器
{"type":"ping"}

// 服务器响应
{"type":"pong"}
```

###### 开始录音
```json
{"type":"control","content":"start_recording"}
```

###### 停止录音
```json
{"type":"control","content":"stop_recording"}
```

###### 打断AI回复
```json
{"type":"control","content":"interrupt"}
```

##### 二进制消息（音频数据）

传输 PCM 格式的音频数据，参数要求：
- 采样率：16000Hz
- 位深度：16位
- 声道数：单声道

### 2. 文本聊天 (chat)

文本聊天支持普通文本消息和语音输入。

#### 支持的消息类型

##### 文本消息

###### 普通聊天消息
```json
{"type":"chat","content":"你好，帮我写一个Java的冒泡排序算法","userId":"user123"}
```

###### 聊天命令
```json
{"type":"control","content":"/help"}
```

支持的命令：
- `/help` - 显示帮助信息
- `/history` - 显示聊天历史
- `/clear` - 清空聊天历史

###### 心跳消息
```json
// 发送到服务器
{"type":"ping"}

// 服务器响应
{"type":"pong"}
```

##### 二进制消息（音频数据）

文本聊天也支持语音输入，发送 PCM 音频数据，系统会自动将其转换为文本并作为聊天消息处理。

音频参数要求：
- 采样率：16000Hz
- 位深度：16位
- 声道数：单声道

### 3. 视频通信 (video)

视频通信主要用于视频数据传输。

#### 支持的消息类型

##### 文本消息（控制命令）

###### 心跳消息
```json
// 发送到服务器
{"type":"ping"}

// 服务器响应
{"type":"pong"}
```

##### 二进制消息（视频数据）

传输视频帧数据（具体格式根据实际实现而定）。

## 消息处理流程

### 语音通信流程

1. 客户端连接到 `ws://localhost:8080/ws/voice`
2. 客户端发送 PCM 音频数据（二进制消息）
3. 服务器实时识别音频内容
4. 识别到完整句子后，传递给 AI 处理
5. AI 回复文本内容通过 WebSocket 文本消息发送给客户端
   ```json
   {"type":"chat","content":"AI的回复内容"}
   ```
6. 同时将 AI 回复转换为语音，通过 WebSocket 二进制消息发送给客户端
7. 服务器将音频文件保存到本地，并通过控制消息通知客户端音频文件路径

### 文本聊天流程

1. 客户端连接到 `ws://localhost:8080/ws/chat`
2. 客户端可以发送：
   - 聊天消息（type为chat的JSON）- 直接传递给 AI 处理
   - 音频数据（二进制消息）- 转换为文本后传递给 AI 处理
3. 服务器将 AI 回复通过 WebSocket 文本消息发送给客户端
   ```json
   {"type":"chat","content":"AI的回复内容"}
   ```

### 视频通信流程

1. 客户端连接到 `ws://localhost:8080/ws/video`
2. 客户端发送视频数据（二进制消息）
3. 服务器处理视频数据（根据具体实现）

## 错误处理

当发生错误时，服务器会通过 WebSocket 文本消息发送错误信息：
```json
{"type":"control","content":"错误: 错误描述信息"}
```

## 心跳机制

为保持连接活跃，客户端应定期发送心跳消息：
- 推荐间隔：25秒
- 心跳消息格式：`{"type":"ping"}`
- 服务器收到心跳后会回复：`{"type":"pong"}`

## 连接关闭

当连接关闭时，系统会自动清理相关资源。

## TTS音频文件处理

为了解决前端存储限制问题，服务器会将生成的TTS音频文件保存到本地，并提供以下机制：

### WebSocket控制消息

在TTS处理过程中，服务器会发送以下控制消息：

1. **开始播放**：
   ```json
   {"type":"control","content":"tts_start"}
   ```

2. **播放结束**（包含音频文件名）：
   ```json
   {"type":"control","content":"tts_end:tts_audio_xxxxxx.pcm"}
   ```

3. **播放错误**：
   ```json
   {"type":"control","content":"tts_error:错误描述"}
   ```

### REST API接口

服务器还提供了REST API接口用于直接生成和访问音频文件：

#### 生成TTS音频文件
```
GET /audio/generate?text=需要合成的文本
```

响应示例：
```json
{
  "code": 200,
  "msg": "音频文件生成成功",
  "data": "/temp/tts_audio_xxxxxx.pcm"
}
```

#### 下载音频文件
```
GET /audio/download?fileName=tts_audio_xxxxxx.pcm
```

### 音频文件访问

生成的音频文件可以通过以下URL直接访问：
```
http://your-server-address/temp/tts_audio_xxxxxx.pcm
```

## 实时处理特性

系统支持以下实时处理特性：

1. **流式语音识别**：语音输入时实时返回部分识别结果
2. **流式TTS播放**：AI回复时实时生成和播放音频
3. **语音打断**：用户可随时打断AI回复过程
4. **资源管理**：自动清理过期音频文件，避免存储空间耗尽