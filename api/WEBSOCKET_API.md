# WebSocket API 接口文档

## 概述

本文档描述了系统提供的三个 WebSocket 接口，分别用于处理语音通信、文本聊天和视频通信。

## WebSocket 端点

### 1. 语音通信接口
- **URL**: `/ws/voice`
- **用途**: 实时语音识别和AI对话
- **特点**: 接收二进制音频数据，返回文本识别结果和AI语音回复

### 2. 文本聊天接口
- **URL**: `/ws/chat`
- **用途**: 文本聊天和AI对话
- **特点**: 接收文本消息，返回AI文本回复

### 3. 视频通信接口
- **URL**: `/ws/video`
- **用途**: 视频通信（开发中）
- **特点**: 支持视频流传输和实时通信

## 消息格式

### WebSocketMessage 结构

所有 WebSocket 消息都使用统一的格式：

```json
{
  "type": "消息类型",
  "content": "消息内容",
  "messageId": "消息ID（可选）",
  "userId": "用户ID（可选）",
  "metadata": { /* 元数据（可选） */ }
}
```

### 消息类型

| 类型    | 说明         | 用途                   |
|---------|--------------|------------------------|
| CHAT    | 聊天消息     | 需要AI处理的内容       |
| CONTROL | 控制消息     | 系统控制和状态信息     |
| PING    | 心跳请求     | 连接保活               |
| PONG    | 心跳响应     | 连接保活响应           |

## 接口详细说明

### 1. 语音通信接口 (/ws/voice)

#### 客户端发送消息

##### 二进制消息
- **类型**: 音频数据 (PCM格式)
- **内容**: 原始音频字节流
- **采样率**: 16000Hz
- **格式**: PCM

##### 文本消息
- **PING消息**:
  ```json
  {
    "type": "PING",
    "content": ""
  }
  ```

- **控制消息**:
  ```json
  {
    "type": "CONTROL",
    "content": "interrupt|start_recording|stop_recording"
  }
  ```

#### 服务端响应消息

##### 部分识别结果
```json
{
  "type": "CONTROL",
  "content": "partial:识别中的文本"
}
```

##### 完整识别结果和AI回复
```json
{
  "type": "CHAT",
  "content": "AI回复的完整文本"
}
```

##### TTS语音合成控制
```json
{
  "type": "CONTROL",
  "content": "tts_start|tts_end|tts_chunk"
}
```

##### 控制消息
```json
{
  "type": "CONTROL",
  "content": "interrupted|recording_started|recording_stopped|heartbeat"
}
```

##### 错误消息
```json
{
  "type": "CONTROL",
  "content": "错误描述信息"
}
```

#### 工作流程

1. 客户端建立WebSocket连接到 `/ws/voice`
2. 服务端发送欢迎消息
3. 客户端发送PCM音频数据（二进制消息）
4. 服务端实时返回部分识别结果（可选）
5. 服务端在检测到语音结束时返回完整识别结果
6. 服务端调用AI处理识别结果，返回AI回复
7. 服务端将AI回复转换为语音，通过TTS流式传输
8. 客户端接收并播放TTS音频

### 2. 文本聊天接口 (/ws/chat)

#### 客户端发送消息

##### 文本消息
```json
{
  "type": "CHAT",
  "content": "用户发送的聊天内容"
}
```

#### 服务端响应消息

##### AI回复
```json
{
  "type": "CHAT",
  "content": "AI回复的文本内容"
}
```

##### TTS语音合成控制
```json
{
  "type": "CONTROL",
  "content": "tts_start|tts_end|tts_chunk"
}
```

##### 控制消息
```json
{
  "type": "CONTROL",
  "content": "欢迎信息|heartbeat"
}
```

##### 错误消息
```json
{
  "type": "CONTROL",
  "content": "错误描述信息"
}
```

#### 工作流程

1. 客户端建立WebSocket连接到 `/ws/chat`
2. 服务端发送欢迎消息
3. 客户端发送文本聊天消息
4. 服务端调用AI处理消息，返回AI回复
5. 服务端将AI回复转换为语音，通过TTS流式传输
6. 客户端接收文本回复和TTS音频

### 3. 视频通信接口 (/ws/video)

#### 客户端发送消息

##### 二进制消息
- **类型**: 视频/音频数据
- **内容**: 原始音视频字节流

##### 文本消息
```json
{
  "type": "CHAT|CONTROL|PING",
  "content": "消息内容"
}
```

#### 服务端响应消息

##### 控制消息
```json
{
  "type": "CONTROL",
  "content": "视频连接已建立|heartbeat"
}
```

##### 错误消息
```json
{
  "type": "CONTROL",
  "content": "错误描述信息"
}
```

## 通用控制命令

| 命令             | 说明           | 适用接口      |
|------------------|----------------|---------------|
| interrupt        | 打断AI处理     | /ws/voice     |
| start_recording  | 开始录音       | /ws/voice     |
| stop_recording   | 停止录音       | /ws/voice     |
| heartbeat        | 心跳保活       | 所有接口      |

## 错误处理

所有错误都会通过 CONTROL 类型的消息返回给客户端：

```json
{
  "type": "CONTROL",
  "content": "具体错误信息"
}
```

常见错误包括：
- 语音识别API异常
- AI处理失败
- 语音合成失败
- WebSocket连接错误

## 注意事项

1. 所有接口都支持心跳机制，客户端应定期发送PING消息保持连接
2. 语音接口需要16000Hz PCM格式的音频数据
3. 服务端会在连接建立时自动启动心跳定时器
4. 客户端可以在适当时候发送打断命令终止AI处理
5. TTS语音合成采用流式传输，客户端需要支持流式播放