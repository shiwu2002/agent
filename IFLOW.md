# 项目概览

这是一个基于微信小程序的即时通讯应用，主要实现了文本聊天、语音消息、图片发送等功能，并通过WebSocket与后端服务器进行实时通信。

## 技术栈

- **前端框架**: 微信小程序原生开发
- **网络通信**: WebSocket
- **状态管理**: 小程序全局数据 (globalData)
- **认证机制**: 微信登录 + JWT Token

## 项目结构

```
.
├── app.js                  # 小程序入口文件，包含全局逻辑和认证处理
├── app.json                # 小程序全局配置，定义页面路由和窗口表现
├── app.wxss                # 全局样式文件
├── project.config.json     # 项目配置文件
├── sitemap.json            # 小程序页面索引配置
├── api/
│   └── WEBSOCKET_API.md    # WebSocket API文档
├── pages/
│   ├── index/              # 首页
│   ├── logs/               # 日志页
│   ├── MainInterface/      # 主聊天界面
│   ├── myPersonalDetails/  # 个人详情页
│   └── VideoCallInterface/ # 视频通话界面（未实现）
├── utils/
│   ├── auth.js             # 认证服务模块
│   ├── util.js             # 工具函数
│   └── websocket.js        # WebSocket管理器
└── IFLOW.md                # 项目说明文档（当前文件）
```

## 核心功能模块

### 1. 认证模块 (utils/auth.js)

该模块负责处理用户登录认证流程：
- 通过微信登录获取code
- 向后端服务器交换token
- 解析JWT token获取用户信息（openId, aiSessionId）
- 存储用户信息到全局数据
- 提供token有效性检查和登出功能

### 2. WebSocket通信模块 (utils/websocket.js)

该模块封装了WebSocket连接管理：
- 建立和维护WebSocket连接
- 处理连接、消息、错误和关闭事件
- 自动重连机制
- 发送和接收消息

### 3. 主聊天界面 (pages/MainInterface/)

这是应用的核心界面，实现了以下功能：
- 初始化WebSocket连接
- 加载历史消息
- 发送文本消息
- 录制和发送语音消息
- 选择和发送图片
- 接收和播放语音消息
- 处理二进制音频数据
- 语音和视频通话（部分实现）

## 运行和开发

### 启动项目

1. 确保已安装微信开发者工具
2. 打开微信开发者工具，导入项目
3. 配置后端服务器地址（在`utils/auth.js`和`pages/MainInterface/MainInterface.js`中）
4. 点击"编译"运行项目

### 开发约定

- 使用微信小程序原生语法开发
- 所有页面组件放在`pages/`目录下
- 工具类和公共函数放在`utils/`目录下
- 使用ES6语法特性
- 采用模块化开发，通过`module.exports`和`require`进行模块导入导出
- 使用微信提供的API进行网络请求、文件操作等

## 待办事项

- 完善视频通话功能
- 实现更多类型的消息（如位置、文件等）
- 增加消息撤回功能
- 优化语音消息播放体验
- 增加消息已读未读状态