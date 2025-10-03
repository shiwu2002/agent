/**
 * 音频数据测试工具
 * 用于验证16位PCM音频数据的正确性和WebSocket二进制传输
 */

class AudioTest {
  constructor() {
    this.testResults = [];
  }

  /**
   * 生成测试用的16位PCM音频数据
   * @param {number} durationMs - 音频时长（毫秒）
   * @param {number} frequency - 音频频率（Hz）
   * @param {number} sampleRate - 采样率（Hz）
   * @returns {ArrayBuffer} 16位PCM音频数据
   */
  generateTestPCMData(durationMs = 1000, frequency = 440, sampleRate = 16000) {
    const sampleCount = Math.floor((durationMs / 1000) * sampleRate);
    const arrayBuffer = new ArrayBuffer(sampleCount * 2); // 16位 = 2字节/样本
    const dataView = new DataView(arrayBuffer);
    
    // 生成正弦波音频数据
    for (let i = 0; i < sampleCount; i++) {
      const time = i / sampleRate;
      const amplitude = Math.sin(2 * Math.PI * frequency * time) * 0.8; // 80%幅度
      const sample = Math.floor(amplitude * 32767); // 转换为16位有符号整数
      dataView.setInt16(i * 2, sample, true); // 小端字节序
    }
    
    console.log(`生成测试PCM数据: 时长=${durationMs}ms, 频率=${frequency}Hz, 采样率=${sampleRate}Hz, 样本数=${sampleCount}, 数据长度=${arrayBuffer.byteLength}字节`);
    return arrayBuffer;
  }

  /**
   * 验证16位PCM音频数据格式
   * @param {ArrayBuffer} pcmData - 要验证的PCM数据
   * @returns {object} 验证结果
   */
  validatePCMData(pcmData) {
    const result = {
      isValid: false,
      byteLength: 0,
      sampleCount: 0,
      durationMs: 0,
      is16BitFormat: false,
      hasValidSamples: false,
      maxAmplitude: 0,
      avgAmplitude: 0,
      zeroSampleRatio: 0,
      error: null
    };

    try {
      if (!pcmData || !(pcmData instanceof ArrayBuffer)) {
        result.error = '无效的数据类型，必须是ArrayBuffer';
        return result;
      }

      result.byteLength = pcmData.byteLength;
      
      if (result.byteLength === 0) {
        result.error = '数据为空';
        return result;
      }

      // 验证16位格式（长度应该是偶数）
      result.is16BitFormat = (result.byteLength % 2 === 0);
      if (!result.is16BitFormat) {
        result.error = '数据长度不是16位PCM格式（长度不是偶数）';
        return result;
      }

      result.sampleCount = result.byteLength / 2;
      result.durationMs = (result.sampleCount / 16000) * 1000; // 假设16kHz采样率

      // 分析音频数据内容
      const dataView = new DataView(pcmData);
      let sumAmplitude = 0;
      let zeroSampleCount = 0;
      let maxAmplitude = 0;

      for (let i = 0; i < result.sampleCount; i++) {
        const sample = dataView.getInt16(i * 2, true);
        const absSample = Math.abs(sample);
        
        sumAmplitude += absSample;
        if (absSample < 10) { // 认为小于10的是零值
          zeroSampleCount++;
        }
        if (absSample > maxAmplitude) {
          maxAmplitude = absSample;
        }
      }

      result.maxAmplitude = maxAmplitude;
      result.avgAmplitude = Math.floor(sumAmplitude / result.sampleCount);
      result.zeroSampleRatio = zeroSampleCount / result.sampleCount;
      
      // 判断是否有有效样本（非零样本比例大于1%）
      result.hasValidSamples = (result.zeroSampleRatio < 0.99);
      
      result.isValid = true;
      
      console.log(`PCM数据验证结果: 有效=${result.isValid}, 长度=${result.byteLength}字节, 样本数=${result.sampleCount}, 时长=${result.durationMs.toFixed(1)}ms, 最大幅度=${result.maxAmplitude}, 平均幅度=${result.avgAmplitude}, 零值比例=${(result.zeroSampleRatio*100).toFixed(1)}%`);
      
    } catch (error) {
      result.error = error.message;
      console.error('PCM数据验证失败:', error);
    }

    return result;
  }

  /**
   * 模拟WebSocket二进制音频数据传输测试
   * @param {WebSocketManager} wsManager - WebSocket管理器实例
   * @param {number} testDurationMs - 测试时长（毫秒）
   */
  async testWebSocketBinaryTransmission(wsManager, testDurationMs = 5000) {
    console.log('开始WebSocket二进制音频传输测试...');
    
    const testResults = {
      totalFrames: 0,
      successfulFrames: 0,
      failedFrames: 0,
      totalBytes: 0,
      averageFrameSize: 0,
      errors: []
    };

    const startTime = Date.now();
    const frameInterval = 100; // 每100ms发送一帧
    
    while (Date.now() - startTime < testDurationMs) {
      try {
        // 生成测试PCM数据（每帧约125ms音频）
        const pcmData = this.generateTestPCMData(125, 440, 16000);
        
        // 验证生成的数据
        const validation = this.validatePCMData(pcmData);
        if (!validation.isValid) {
          throw new Error(`生成的PCM数据无效: ${validation.error}`);
        }

        // 发送二进制数据
        const sendResult = wsManager.send(pcmData);
        
        if (sendResult) {
          testResults.successfulFrames++;
          testResults.totalBytes += pcmData.byteLength;
          console.log(`测试帧发送成功: ${pcmData.byteLength}字节`);
        } else {
          testResults.failedFrames++;
          testResults.errors.push('发送失败');
          console.error('测试帧发送失败');
        }
        
        testResults.totalFrames++;
        
        // 等待下一帧
        await new Promise(resolve => setTimeout(resolve, frameInterval));
        
      } catch (error) {
        testResults.failedFrames++;
        testResults.errors.push(error.message);
        console.error('测试帧处理失败:', error);
      }
    }

    testResults.averageFrameSize = testResults.totalBytes / testResults.successfulFrames;
    
    console.log('WebSocket二进制音频传输测试完成:', testResults);
    return testResults;
  }

  /**
   * 创建音频数据报告
   * @param {ArrayBuffer} pcmData - PCM音频数据
   * @returns {string} 详细的音频数据报告
   */
  createAudioDataReport(pcmData) {
    const validation = this.validatePCMData(pcmData);
    
    if (!validation.isValid) {
      return `音频数据报告 - 无效数据: ${validation.error}`;
    }

    const report = `
=== 16位PCM音频数据报告 ===
基本参数:
  - 数据长度: ${validation.byteLength} 字节
  - 样本数量: ${validation.sampleCount} 个
  - 音频时长: ${validation.durationMs.toFixed(1)} 毫秒
  - 采样率: 16000 Hz
  - 位深度: 16 位
  - 声道数: 1 (单声道)

数据质量:
  - 16位格式验证: ${validation.is16BitFormat ? '通过' : '失败'}
  - 有效样本: ${validation.hasValidSamples ? '是' : '否'}
  - 最大幅度: ${validation.maxAmplitude}
  - 平均幅度: ${validation.avgAmplitude}
  - 零值比例: ${(validation.zeroSampleRatio * 100).toFixed(1)}%

技术规格:
  - 符合WebSocket二进制传输: ${validation.isValid ? '是' : '否'}
  - 符合16位PCM标准: ${validation.is16BitFormat ? '是' : '否'}
  - 适合语音识别: ${(validation.sampleCount >= 100 && validation.hasValidSamples) ? '是' : '否'}
======================
    `;

    return report.trim();
  }
}

// 导出音频测试工具
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioTest;
} else if (typeof define === 'function' && define.amd) {
  define(function() { return AudioTest; });
} else {
  // 微信小程序环境
  if (typeof AudioTest !== 'undefined') {
    if (typeof global !== 'undefined') {
      global.AudioTest = AudioTest;
    }
    if (typeof window !== 'undefined') {
      window.AudioTest = AudioTest;
    }
  }
}