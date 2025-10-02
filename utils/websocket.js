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
      console.log('收到WebSocket消息:', message);
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
   * 发送消息
   */
  send(data) {
    if (!this.isConnected || !this.socket) {
      console.error('WebSocket未连接，无法发送消息');
      return false;
    }

    try {
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
      
      return true;
    } catch (error) {
      console.error('发送消息异常:', error);
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

module.exports = WebSocketManager;