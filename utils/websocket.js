/**
 * WebSocket管理器
 * 提供WebSocket连接、重连、心跳检测等功能
 */
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

  /**
   * 连接WebSocket
   */
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

      // 设置binaryType为arraybuffer以支持二进制音频数据传输
      if (this.socket) {
        this.socket.binaryType = 'arraybuffer';
        console.log('WebSocket binaryType已设置为arraybuffer');
      }

      this.setupSocketEvents();
    } catch (error) {
      console.error('创建WebSocket连接异常:', error);
      this.handleConnectionError(error);
    }
  }

  /**
   * 设置WebSocket事件监听
   */
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
      console.log('收到WebSocket消息，类型:', typeof message.data, '数据长度:', 
        typeof message.data === 'string' ? message.data.length : 
        message.data instanceof ArrayBuffer ? message.data.byteLength : 'unknown');
      
      // 添加消息类型检查和处理
      if (typeof message.data === 'string') {
        // 检查是否为错误消息
        if (message.data.startsWith('抱歉，处理您的请求时发生了错误') || 
            message.data.startsWith('处理失败:') || 
            message.data.startsWith('识别失败:') || 
            message.data.startsWith('AI处理失败:') ||
            message.data.startsWith('处理消息失败:') ||
            message.data.includes('Cannot invoke') ||
            message.data.includes('NullPointerException')) {
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
        
        // 检查是否为心跳消息，不传递给上层处理
        try {
          const data = JSON.parse(message.data);
          if (data && (data.type === 'ping' || data.type === 'pong')) {
            console.log('收到心跳消息，不传递给上层处理:', data.type);
            return;
          }
        } catch (e) {
          // JSON解析失败，继续正常处理
        }
      } else if (message.data instanceof ArrayBuffer) {
        // 处理二进制音频数据
        console.log('收到二进制音频数据，长度:', message.data.byteLength, '字节');
        // 二进制数据直接传递给上层处理
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

  /**
   * 发送消息 - 支持文本和二进制数据
   */
  send(data) {
    if (!this.isConnected || !this.socket) {
      console.error('WebSocket未连接，无法发送消息');
      return false;
    }

    try {
      let sendData;
      let logMessage = '';
      
      // 处理不同类型的数据
      if (data instanceof ArrayBuffer) {
        // 二进制音频数据（16位PCM）
        sendData = data;
        logMessage = `发送二进制音频数据: ${data.byteLength}字节 (${data.byteLength/2}个16位样本)`;
        console.log(logMessage);
      } else if (data instanceof Uint8Array) {
        // Uint8Array二进制数据
        sendData = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        logMessage = `发送Uint8Array二进制数据: ${data.length}字节`;
        console.log(logMessage);
      } else if (typeof data === 'string') {
        // 字符串数据
        sendData = data;
        logMessage = data;
        // 心跳消息简化日志
        if (data === 'ping' || data === 'pong') {
          console.log(`发送心跳消息: ${data}`);
        } else {
          console.log('发送WebSocket文本消息:', logMessage);
        }
      } else {
        // JSON对象
        sendData = JSON.stringify(data);
        logMessage = sendData;
        // 心跳消息简化日志
        if (data && (data.type === 'ping' || data.type === 'pong')) {
          console.log(`发送心跳消息: ${data.type}`);
        } else {
          console.log('发送WebSocket JSON消息:', logMessage);
        }
      }
      
      this.socket.send({
        data: sendData,
        success: () => {
          if (data instanceof ArrayBuffer) {
            console.log(`二进制音频数据发送成功: ${data.byteLength}字节`);
          } else if (data instanceof Uint8Array) {
            console.log(`Uint8Array数据发送成功: ${data.length}字节`);
          } else if (typeof data === 'string') {
            if (data === 'ping' || data === 'pong') {
              console.log(`心跳消息 ${data} 发送成功`);
            } else {
              console.log('文本消息发送成功');
            }
          } else {
            console.log('JSON消息发送成功');
          }
        },
        fail: (error) => {
          console.error('消息发送失败:', error);
          if (data instanceof ArrayBuffer) {
            console.error(`二进制音频数据发送失败: ${data.byteLength}字节`, error);
          }
        }
      });
      
      return true;
    } catch (error) {
      console.error('发送消息异常:', error);
      if (data instanceof ArrayBuffer) {
        console.error(`二进制音频数据发送异常: ${data.byteLength}字节`, error);
      }
      return false;
    }
  }

  /**
   * 断开连接
   */
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

  /**
   * 尝试重连
   */
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

  /**
   * 停止重连
   */
  stopReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * 开始心跳检测
   */
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

  /**
   * 停止心跳检测
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 处理连接错误
   */
  handleConnectionError(error) {
    this.isConnected = false;
    this.onError(error);
    this.attemptReconnect();
  }

  /**
   * 获取连接状态
   */
  getConnectionState() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      url: this.url
    };
  }

  /**
   * 是否已连接
   */
  isConnected() {
    return this.isConnected;
  }

  /**
   * 重新连接
   */
  reconnect() {
    console.log('重新连接WebSocket');
    this.disconnect();
    this.reconnectAttempts = 0;
    setTimeout(() => {
      this.connect();
    }, 1000);
  }
}

// 兼容微信小程序的模块导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebSocketManager;
} else if (typeof define === 'function' && define.amd) {
  define(function() { return WebSocketManager; });
} else {
  // 微信小程序环境
  if (typeof WebSocketManager !== 'undefined') {
    // 全局导出，兼容小程序环境
    if (typeof global !== 'undefined') {
      global.WebSocketManager = WebSocketManager;
    }
    if (typeof window !== 'undefined') {
      window.WebSocketManager = WebSocketManager;
    }
  }
}