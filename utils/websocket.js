// utils/websocket.js
// WebSocket工具类，用于处理文本聊天类型的WebSocket连接

class WebSocketManager {
  constructor(options = {}) {
    this.url = options.url || 'ws://localhost:8080/ws/chat';
    this.onOpen = options.onOpen || (() => {});
    this.onMessage = options.onMessage || (() => {});
    this.onClose = options.onClose || (() => {});
    this.onError = options.onError || (() => {});
    this.reconnectInterval = options.reconnectInterval || 5000;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
    
    this.socket = null;
    this.connected = false;
    this.reconnectAttempts = 0;
  }

  /**
   * 建立WebSocket连接
   */
  connect() {
    // 如果已有连接，先关闭
    if (this.socket) {
      this.disconnect();
    }

    try {
      // 微信小程序中需要使用wx.connectSocket
      this.socket = wx.connectSocket({
        url: this.url,
        header: {
          'content-type': 'application/json'
        }
      });
      
      this.socket.onOpen((event) => {
        console.log('WebSocket连接已建立');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.onOpen(event);
      });

      this.socket.onMessage((event) => {
        this.onMessage(event);
      });

      this.socket.onError((error) => {
        console.error('WebSocket发生错误:', error);
        this.connected = false;
        this.onError(error);
      });

      this.socket.onClose((event) => {
        console.log('WebSocket连接已关闭');
        this.connected = false;
        
        // 尝试重连
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`尝试重新连接 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
          setTimeout(() => {
            this.connect();
          }, this.reconnectInterval);
        }
        
        this.onClose(event);
      });
    } catch (error) {
      console.error('WebSocket连接失败:', error);
      this.connected = false;
      this.onError(error);
    }
  }

  /**
   * 发送消息
   * @param {string|Object} data 要发送的数据
   */
  send(data) {
    if (!this.connected) {
      console.warn('WebSocket未连接，无法发送消息');
      return false;
    }

    try {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      this.socket.send({ data: message });
      return true;
    } catch (error) {
      console.error('发送消息失败:', error);
      return false;
    }
  }

  /**
   * 断开WebSocket连接
   */
  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    
    this.connected = false;
  }

  /**
   * 检查连接状态
   * @returns {boolean} 是否已连接
   */
  isConnected() {
    return this.connected;
  }
}

module.exports = WebSocketManager;