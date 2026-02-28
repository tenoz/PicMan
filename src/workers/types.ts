/**
 * Worker 通信类型定义
 * 定义 Worker 和主线程之间的通信协议
 */

import type { ProcessingConfig } from '../../types';

/** 消息类型枚举 */
export enum WorkerMessageType {
  /** 处理图片 */
  PROCESS_IMAGE = 'PROCESS_IMAGE',
  /** 取消处理 */
  CANCEL = 'CANCEL',
  /** 心跳检测 */
  PING = 'PING',
}

/** 处理图片的具体参数 */
export interface ProcessImagePayload {
  /** 任务ID */
  taskId: string;
  /** 图片文件数据 (ArrayBuffer 或 DataURL) */
  imageData: ArrayBuffer | string;
  /** 文件名 */
  filename: string;
  /** MIME类型 */
  mimeType: string;
  /** 原始图片尺寸 */
  originalDimensions: {
    width: number;
    height: number;
  };
  /** 处理配置 */
  config: ProcessingConfig;
}

/** Worker 请求消息 */
export interface WorkerRequest {
  /** 任务ID */
  taskId: string;
  /** 消息类型 */
  type: WorkerMessageType;
  /** 处理参数 (仅在 PROCESS_IMAGE 时需要) */
  payload?: ProcessImagePayload;
}

/** Worker 响应结果 */
export interface WorkerResponseData {
  /** 处理后的图片 Blob */
  blob: Blob;
  /** 输出宽度 */
  width: number;
  /** 输出高度 */
  height: number;
  /** 处理后的文件大小 */
  processedSize: number;
  /** 是否跳过（处理后体积增大） */
  isSkipped: boolean;
}

/** Worker 响应消息 */
export interface WorkerResponse {
  /** 任务ID */
  taskId: string;
  /** 是否成功 */
  success: boolean;
  /** 结果数据 (成功时) */
  data?: WorkerResponseData;
  /** 错误信息 (失败时) */
  error?: string;
}

/** Worker 进度更新 */
export interface WorkerProgress {
  /** 任务ID */
  taskId: string;
  /** 进度百分比 (0-100) */
  progress: number;
  /** 状态消息 */
  message: string;
  /** 当前阶段 */
  phase?: 'loading' | 'processing' | 'encoding' | 'watermark';
}

/** Worker 消息联合类型 */
export type WorkerMessage = 
  | (WorkerRequest & { kind: 'request' })
  | (WorkerResponse & { kind: 'response' })
  | (WorkerProgress & { kind: 'progress' });

/** 主线程发送给 Worker 的消息 */
export type MainToWorkerMessage = WorkerRequest;

/** Worker 发送给主线程的消息 */
export type WorkerToMainMessage = WorkerResponse | WorkerProgress;
