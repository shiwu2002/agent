# Spring AI Agent - 智能语音对话系统

## 项目概述

这是一个基于Spring Boot的智能语音对话系统，集成了阿里巴巴通义千问的语音识别(ASR)和语音合成(TTS)功能。项目支持实时语音交互，能够将用户的语音输入转换为文本，通过AI模型处理后，再将回复内容转换为语音输出。

### 核心技术栈
- **后端框架**: Spring Boot 3.5.6
- **Java版本**: Java 17
- **AI服务**: 阿里巴巴通义千问(DashScope)
  - 语音识别: paraformer-realtime-v2模型
  - 语音合成: qwen-tts-realtime模型
- **实时通信**: WebSocket
- **数据库**: MySQL (支持)
- **缓存**: Redis
- **构建工具**: Maven

## 主要功能

### 1. 实时语音识别 (ASR)
- 支持16kHz采样率的PCM格式音频流
- 实时语音转文字功能
- 支持文件上传识别和WebSocket流式识别

### 2. 语音合成 (TTS)
- 文本转语音功能
- 支持多种语音音色(Chelsie等)
- 实时音频流输出
- 音频文件本地存储和访问

### 3. AI对话系统
- 集成大语言模型进行智能对话
- 支持上下文理解和回复生成
- WebSocket实时交互

### 4. 多模式交互
- REST API接口
- WebSocket实时通信
- 支持HTTP文件上传识别

## 项目结构

```
src/main/java/shiwu/agent/
├── SpringAiAgentApplication.java    # 主启动类
├── config/
│   ├── AppConfig.java               # 应用配置
│   ├── WebSocketConfig.java         # WebSocket配置
│   └── WebMvcConfig.java            # Web MVC配置
├── controller/
│   ├── inputController.java         # AI对话控制器
│   └── RealTimeVoiceWebSocket.java  # 实时语音WebSocket处理器
├── service/
│   ├── One_word_recognition.java    # 单词识别服务
│   ├── RealTimeVoiceService.java    # 实时语音识别服务
│   └── TTS_speech_synthesis.java    # 语音合成服务
├── util/
│   ├── AudioBufferUtil.java         # 音频缓冲区工具
│   ├── AudioFileCleanupTask.java    # 音频文件清理任务
│   ├── RealtimePcmPlayer.java       # 实时PCM播放器
│   ├── RedisMemoryUtil.java         # Redis内存工具
│   └── TTSUtil.java                 # TTS工具类
└── dto/
    └── WebSocketMessage.java        # WebSocket消息封装类
```

## 环境配置

### 必需环境变量
```bash
DASHSCOPE_API_KEY=your_alibaba_cloud_api_key
```

### 应用配置 (application.properties)
```properties
spring.application.name=spring_ai_agent
spring.ai.chat.client.enabled=true
spring.ai.dashscope.api-key=${DASHSCOPE_API_KEY}
spring.ai.dashscope.chat.options.model=qwen-turbo-2025-07-15
```

## 构建和运行

### 构建项目
```bash
# 使用Maven构建
mvn clean package

# 或者直接运行
mvn spring-boot:run
```

### 运行应用
```bash
# 设置环境变量后运行
export DASHSCOPE_API_KEY=your_api_key
mvn spring-boot:run

# 或者运行打包后的jar
java -jar target/spring_ai_agent-0.0.1-SNAPSHOT.jar
```

### 测试
```bash
# 运行单元测试
mvn test
```

## API接口

### REST接口

#### 1. AI对话接口
- **URL**: `/ai`
- **方法**: GET
- **参数**: 
  - `userId` (String) - 用户唯一标识
  - `userInput` (String) - 用户输入内容
- **返回**: AI生成的回复

#### 2. TTS音频文件生成接口
- **URL**: `/audio/generate`
- **方法**: GET
- **参数**: `text` (String) - 需要合成的文本
- **返回**: 音频文件访问URL

#### 3. 音频文件下载接口
- **URL**: `/audio/download`
- **方法**: GET
- **参数**: `fileName` (String) - 音频文件名
- **返回**: 音频文件下载

### WebSocket接口

#### 实时语音对话
- **URL**: `ws://localhost:8080/ws/voice`
- **协议**: WebSocket
- **功能**: 实时音频流识别和AI对话
- **支持**: 二进制音频数据传输

#### 文本聊天
- **URL**: `ws://localhost:8080/ws/chat`
- **协议**: WebSocket
- **功能**: 文本消息聊天和语音输入
- **支持**: 文本和二进制音频数据传输

#### 视频通信
- **URL**: `ws://localhost:8080/ws/video`
- **协议**: WebSocket
- **功能**: 视频数据传输（预留接口）

## WebSocket消息格式

所有WebSocket文本消息都使用统一的JSON格式：

```json
{
  "type": "消息类型",
  "content": "消息内容"
}
```

### 支持的消息类型

#### 控制消息 (control)
用于前后端交互的控制命令：
- `start_recording` - 开始录音
- `stop_recording` - 停止录音
- `interrupt` - 打断AI回复
- `tts_start` - 开始TTS播放（服务器发送）
- `tts_end:filename` - TTS播放结束，包含音频文件名（服务器发送）
- `tts_error:error` - TTS播放错误（服务器发送）
- `heartbeat` - 心跳消息
- `pong` - 心跳响应

#### 聊天消息 (chat)
用于AI对话的聊天消息：
- 客户端发送：用户输入的文本内容
- 服务器发送：AI回复的文本内容

#### 心跳消息 (ping/pong)
用于保持连接活跃：
- 客户端发送：`{"type":"ping"}`
- 服务器响应：`{"type":"pong"}`

## 开发约定

### 代码结构
- 采用标准的Spring Boot项目结构
- 控制器层负责请求处理和响应
- 服务层处理业务逻辑
- 工具类封装常用功能

### 命名规范
- 包名使用小写字母: `shiwu.agent`
- 类名使用驼峰命名法: `RealTimeVoiceService`
- 方法名使用动词开头: `recognize()`, `synthesizeText()`

### 依赖管理
- 使用Maven进行依赖管理
- 阿里巴巴DashScope SDK作为主要AI服务依赖
- Spring Boot Starter简化配置

## 关键依赖

```xml
<!-- 阿里巴巴DashScope SDK -->
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>dashscope-sdk-java</artifactId>
    <version>2.21.9</version>
</dependency>

<!-- Spring AI Alibaba集成 -->
<dependency>
    <groupId>com.alibaba.cloud.ai</groupId>
    <artifactId>spring-ai-alibaba-starter-dashscope</artifactId>
</dependency>

<!-- WebSocket支持 -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-websocket</artifactId>
</dependency>
```

## 使用场景

1. **智能客服系统**: 提供语音交互的智能客服
2. **语音助手**: 构建个人语音助手应用
3. **实时翻译**: 结合翻译功能的语音对话
4. **教育应用**: 语言学习和口语练习系统

## 注意事项

1. **API密钥**: 必须配置有效的DashScope API密钥
2. **音频格式**: 推荐使用16kHz采样率的PCM格式音频
3. **网络要求**: WebSocket功能需要稳定的网络连接
4. **资源管理**: 及时关闭WebSocket连接和释放音频资源
5. **存储管理**: 系统会自动清理过期音频文件，避免存储空间耗尽

## 扩展建议

1. **多语言支持**: 扩展支持更多语言的识别和合成
2. **情感识别**: 集成情感分析功能
3. **语音克隆**: 添加个性化语音合成
4. **边缘计算**: 支持本地部署和离线使用

## 全双工通讯特性

系统支持以下全双工通讯特性：

1. **流式处理**: 边识别边处理，无需等待完整句子
2. **实时TTS**: 边生成边播放音频，提升响应速度
3. **语音打断**: 用户可随时打断AI回复过程
4. **资源优化**: 完善的连接和资源生命周期管理