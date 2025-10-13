// utils/voiceWebsocket.js
// 专门用于语音通话的WebSocket管理器

class VoiceWebSocketManager {
  constructor(options = {}) {
    this.url = options.url || 'ws://localhost:8080/ws/voice';
    this.onOpen = options.onOpen || (() => {});
    this.onMessage = options.onMessage || (() => {});
    this.onClose = options.onClose || (() => {});
    this.onError = options.onError || (() => {});
    this.onAudioData = options.onAudioData || (() => {});
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
        console.log('语音WebSocket连接已建立');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.onOpen(event);
      });

      this.socket.onMessage((event) => {
        // 处理二进制音频数据
        if (event.data instanceof ArrayBuffer) {
          this.onAudioData(event.data);
        } else {
          // 处理文本消息
          this.onMessage(event);
        }
      });

      this.socket.onError((error) => {
        console.error('语音WebSocket发生错误:', error);
        this.connected = false;
        this.onError(error);
      });

      this.socket.onClose((event) => {
        console.log('语音WebSocket连接已关闭');
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
      console.error('语音WebSocket连接失败:', error);
      this.connected = false;
      this.onError(error);
    }
  }

  /**
   * 发送消息
   * @param {string|Object|ArrayBuffer} data 要发送的数据
   */
  send(data) {
    if (!this.connected) {
      console.warn('语音WebSocket未连接，无法发送消息');
      return false;
    }

    try {
      if (typeof data === 'string') {
        this.socket.send({ data: data });
      } else if (data instanceof ArrayBuffer) {
        // 发送二进制数据
        this.socket.send({ data: data });
      } else {
        // 发送JSON对象
        const message = JSON.stringify(data);
        this.socket.send({ data: message });
      }
      return true;
    } catch (error) {
      console.error('发送消息失败:', error);
      return false;
    }
  }

  /**
   * 发送控制命令
   * @param {string} command 控制命令
   */
  sendControlCommand(command) {
    const message = {
      type: 'CONTROL',
      content: command
    };
    return this.send(message);
  }

  /**
   * 发送PING心跳消息
   */
  sendPing() {
    const message = {
      type: 'PING',
      content: ''
    };
    return this.send(message);
  }

  /**
   * 发送PONG心跳响应
   */
  sendPong() {
    const message = {
      type: 'PONG',
      content: ''
    };
    return this.send(message);
  }

  /**
   * 发送文本消息
   * @param {string} text 文本内容
   */
  sendTextMessage(text) {
    const message = {
      type: 'TEXT',
      content: text
    };
    return this.send(message);
  }

  /**
   * 发送错误消息
   * @param {string} error 错误内容
   */
  sendErrorMessage(error) {
    const message = {
      type: 'ERROR',
      content: error
    };
    return this.send(message);
  }

  /**
   * 发送音频数据
   * @param {ArrayBuffer} audioData 音频数据
   */
  sendAudioData(audioData) {
    return this.send(audioData);
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

module.exports = VoiceWebSocketManager;