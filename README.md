### Deploy by Cloudflare and Github

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/usherzhao/webrtc-signaling-worker)
# WebRTC 信令服务器

一个基于 Cloudflare Workers Durable Objects 构建的 WebRTC 信令服务器，用于支持实时点对点通信。

## 项目概述

该项目实现了 WebRTC 技术栈中的信令服务器功能，使用 Cloudflare Workers 平台的 Durable Objects 来提供有状态的服务。它支持创建房间、用户加入、WebRTC 信令消息传递等功能，以建立点对点连接。

## 核心特性

- **Durable Objects**: 利用 Cloudflare Durable Objects 提供有状态服务
- **房间系统**: 支持创建和加入房间，区分主机和观看者角色
- **信令消息转发**: 实现 offer/answer/ice-candidate 消息在房间内转发
- **实时连接管理**: 自动处理客户端连接和断开事件
- **房间生命周期管理**: 自动清理房间和通知相关用户

## 环境要求

- Node.js (v18 或更高版本)
- npm 或 yarn 包管理器
- Cloudflare 账户用于部署

## 安装

1. 克隆仓库
2. 安装依赖：
   ```bash
   npm install
   ```

## 使用方法

### 开发模式

运行开发模式：
```bash
npm run dev
```

### 测试

运行测试：
```bash
npm run test
```

### 部署

部署到 Cloudflare：
```bash
npm run deploy
```

## API 接口

### 客户端连接
客户端通过 WebSocket 协议连接到服务器，连接后会收到 `clientId`。

### 消息类型

- `create-room`: 创建房间
  ```json
  {
    "type": "create-room",
    "roomId": "房间ID"
  }
  ```

- `join-room`: 加入房间
  ```json
  {
    "type": "join-room",
    "roomId": "房间ID"
  }
  ```

- `offer`: WebRTC offer 消息
  ```json
  {
    "type": "offer",
    "sdp": "SDP 描述"
  }
  ```

- `answer`: WebRTC answer 消息
  ```json
  {
    "type": "answer",
    "sdp": "SDP 描述"
  }
  ```

- `ice-candidate`: ICE 候选信息
  ```json
  {
    "type": "ice-candidate",
    "candidate": "候选信息"
  }
  ```

## 项目结构

- `src/index.js` - 主应用程序入口点，包含 Worker 和 Durable Object 实现
- `test/index.spec.js` - 测试规范
- `public/index.html` - 公共 HTML 文件
- `wrangler.toml` - Cloudflare Workers 配置文件
- `vitest.config.js` - Vitest 配置文件

## 架构设计

项目采用以下架构模式：
1. **Worker 层**: 处理 HTTP 请求并将其转发到 Durable Object
2. **Durable Object 层**: 维护有状态的房间和连接信息
3. **WebSocket 连接**: 处理实时双向通信

## 使用的技术

- Cloudflare Workers
- Durable Objects
- WebRTC
- WebSockets
- Vitest (测试框架)
- Wrangler CLI

## 配置

应用程序通过 `wrangler.toml` 文件进行配置，包括 Durable Objects 绑定和迁移设置。

## 贡献

欢迎贡献！请随时提交拉取请求。
