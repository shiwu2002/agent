// utils/websocket-fix.js
// 修复WebSocket模块加载问题

// 直接定义WebSocketManager类
class WebSocketManager {
  constructor(options = {}) {
    this.url = options.url || '';
    this.onOpen = options.onOpen || function() {};
    this.onMessage = options.onMessage || function() {};
    this.onClose = options.onClose || function() {};
    this.onError = options.onError || function() {};
    this.reconnectInterval = options.reconnectInterval || 3000;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
    
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.heartbeatInterval = 30000; // 30秒心跳
  }

  connect() {
    if (this.socket && this.isConnected) {
      console.log('WebSocket已连接，无需重复连接');
      return;
    }

    console.log('正在连接WebSocket:', this.url);
    
    try {
      this.socket = wx.connectSocket({
        url: this.url,
        header: {
          'content-type': 'application/json'
        },
        method: 'GET',
        success: () => {
          console.log('WebSocket连接请求已发送');
        },
        fail: (error) => {
          console.error('WebSocket连接失败:', error);
          this.handleConnectionError(error);
        }
      });

      this.setupSocketEvents();
    } catch (error) {
      console.error('创建WebSocket连接异常:', error);
      this.handleConnectionError(error);
    }
  }

  setupSocketEvents() {
    if (!this.socket) return;

    // 连接成功
    this.socket.onOpen(() => {
      console.log('WebSocket连接已建立');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.onOpen();
    });

    // 收到消息
    this.socket.onMessage((message) => {
      console.log('收到WebSocket消息:', message);
      
      // 添加消息类型检查和处理
      if (typeof message.data === 'string') {
        // 检查是否为错误消息
        if (message.data.startsWith('抱歉，处理您的请求时发生了错误') || 
            message.data.startsWith('处理失败:') || 
            message.data.startsWith('识别失败:') || 
            message.data.startsWith('AI处理失败:')) {
          console.error('服务器错误消息:', message.data);
          // 仍然传递给上层处理，但标记为错误类型
          const errorMessage = {
            data: JSON.stringify({
              type: 'error',
              message: message.data,
              timestamp: Date.now()
            })
          };
          this.onMessage(errorMessage);
          return;
        }
      }
      
      this.onMessage(message);
    });

    // 连接关闭
    this.socket.onClose((res) => {
      console.log('WebSocket连接已关闭:', res);
      this.isConnected = false;
      this.stopHeartbeat();
      this.onClose(res);
      
      // 非正常关闭时尝试重连
      if (res.code !== 1000) {
        this.attemptReconnect();
      }
    });

    // 连接错误
    this.socket.onError((error) => {
      console.error('WebSocket错误:', error);
      this.isConnected = false;
      this.stopHeartbeat();
      this.onError(error);
      this.attemptReconnect();
    });
  }

  send(data) {
    if (!this.isConnected || !this.socket) {
      console.error('WebSocket未连接，无法发送消息');
      return false;
    }

    try {
      // 支持发送二进制数据（如PCM音频数据）
      if (data instanceof ArrayBuffer) {
        console.log('发送二进制WebSocket消息，长度:', data.byteLength);
        
        this.socket.send({
          data: data,
          success: () => {
            console.log('二进制消息发送成功');
          },
          fail: (error) => {
            console.error('二进制消息发送失败:', error);
          }
        });
      } else {
        // 发送文本或JSON数据
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        console.log('发送WebSocket消息:', message);
        
        this.socket.send({
          data: message,
          success: () => {
            console.log('消息发送成功');
          },
          fail: (error) => {
            console.error('消息发送失败:', error);
          }
        });
      }
      
      return true;
    } catch (error) {
      console.error('发送消息异常:', error);
      return false;
    }
  }

  disconnect() {
    console.log('正在断开WebSocket连接');
    
    this.stopReconnect();
    this.stopHeartbeat();
    
    if (this.socket && this.isConnected) {
      this.socket.close({
        code: 1000,
        reason: '用户主动断开连接'
      });
    }
    
    this.socket = null;
    this.isConnected = false;
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('已达到最大重连次数，停止重连');
      return;
    }

    this.reconnectAttempts++;
    console.log(`正在尝试第 ${this.reconnectAttempts} 次重连...`);

    this.stopReconnect();
    
    this.reconnectTimer = setTimeout(() => {
      console.log('执行重连...');
      this.connect();
    }, this.reconnectInterval);
  }

  stopReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.send({
          type: 'ping',
          timestamp: Date.now()
        });
      }
    }, this.heartbeatInterval);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  handleConnectionError(error) {
    this.isConnected = false;
    this.onError(error);
    this.attemptReconnect();
  }

  getConnectionState() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      url: this.url
    };
  }

  isConnected() {
    return this.isConnected;
  }

  reconnect() {
    console.log('重新连接WebSocket');
    this.disconnect();
    this.reconnectAttempts = 0;
    setTimeout(() => {
      this.connect();
    }, 1000);
  }
}

// 直接导出类
module.exports = WebSocketManager;