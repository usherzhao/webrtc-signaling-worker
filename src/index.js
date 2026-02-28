// =====================================================================
// 1. Worker 入口点 (处理全局路由，将连接转发给 DO)
// =====================================================================
export default {
	async fetch(request, env, ctx) {
		const upgradeHeader = request.headers.get('Upgrade');
		if (!upgradeHeader || upgradeHeader !== 'websocket') {
			return new Response('Expected Upgrade: websocket', { status: 426 });
		}

		// 为了兼容原有的单服务器架构，我们使用一个固定的名称来创建一个全局唯一的 DO 实例
		// 如果你未来想做成按房间号分配 DO (无限扩展)，可以在这里动态解析房间号
		const id = env.SIGNALING_DO.idFromName("global-signaling-node");
		const stub = env.SIGNALING_DO.get(id);

		// 将请求转发给 Durable Object
		return stub.fetch(request);
	}
};

// =====================================================================
// 2. Durable Object 类 (充当有状态的信令服务器)
// =====================================================================
export class SignalingDO {
	constructor(state, env) {
		this.state = state;
		// 在 DO 的内存中维护状态
		this.clients = new Map(); // clientId -> WebSocket
		this.rooms = new Map();   // roomId -> { host: clientId, viewers: Set, created: timestamp }

		console.log("🚀 Durable Object 信令服务器节点已启动");
	}

	// 接收转发过来的 HTTP(WebSocket) 请求
	async fetch(request) {
		const { 0: client, 1: server } = new WebSocketPair();

		// 接受连接
		server.accept();

		const clientId = this.generateId();
		this.clients.set(clientId, server);

		console.log(`📱 新客户端连接: ${clientId} (当前 DO 连接数: ${this.clients.size})`);

		// 发送连接确认
		server.send(JSON.stringify({
			type: 'connected',
			clientId: clientId
		}));

		// 监听消息
		server.addEventListener('message', event => {
			try {
				const data = JSON.parse(event.data);
				this.handleMessage(clientId, data);
			} catch (error) {
				console.error('❌ 消息解析错误:', error);
			}
		});

		// 监听断开
		server.addEventListener('close', () => {
			this.handleDisconnect(clientId);
		});

		server.addEventListener('error', (error) => {
			console.error(`❌ 客户端 ${clientId} 错误:`, error);
			this.handleDisconnect(clientId);
		});

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	// ================= 处理逻辑函数 (与你原 Node.js 逻辑一致) =================

	handleMessage(clientId, data) {
		console.log(`📨 收到消息 [${clientId}]:`, data.type);

		switch (data.type) {
			case 'create-room':
				this.createRoom(clientId, data.roomId);
				break;
			case 'join-room':
				this.joinRoom(clientId, data.roomId);
				break;
			case 'offer':
				this.forwardToRoom(clientId, data, 'offer');
				break;
			case 'answer':
				this.forwardToRoom(clientId, data, 'answer');
				break;
			case 'ice-candidate':
				this.forwardToRoom(clientId, data, 'ice-candidate');
				break;
			case 'viewer-connected':
				this.notifyHost(clientId, data);
				break;
			default:
				console.log('❓ 未知消息类型:', data.type);
		}
	}

	createRoom(hostId, roomId) {
		if (this.rooms.has(roomId)) {
			const host = this.clients.get(hostId);
			if (host) {
				host.send(JSON.stringify({ type: 'error', message: '房间ID已存在' }));
			}
			return;
		}

		this.rooms.set(roomId, {
			host: hostId,
			viewers: new Set(),
			created: Date.now()
		});

		const host = this.clients.get(hostId);
		if (host) {
			host.send(JSON.stringify({ type: 'room-created', roomId: roomId }));
		}
		console.log(`🏠 房间已创建: ${roomId} (主机: ${hostId})`);
	}

	joinRoom(viewerId, roomId) {
		const room = this.rooms.get(roomId);
		if (!room) {
			const viewer = this.clients.get(viewerId);
			if (viewer) viewer.send(JSON.stringify({ type: 'error', message: '房间不存在' }));
			return;
		}

		room.viewers.add(viewerId);

		const viewer = this.clients.get(viewerId);
		if (viewer) {
			viewer.send(JSON.stringify({
				type: 'room-joined',
				roomId: roomId,
				hostId: room.host
			}));
		}
		console.log(`👁️ 观看者加入房间: ${roomId} (观看者: ${viewerId})`);
	}

	forwardToRoom(senderId, data, messageType) {
		let targetRoom = null;
		let isHost = false;

		for (const [roomId, room] of this.rooms.entries()) {
			if (room.host === senderId) {
				targetRoom = room;
				isHost = true;
				break;
			} else if (room.viewers.has(senderId)) {
				targetRoom = room;
				isHost = false;
				break;
			}
		}

		if (!targetRoom) {
			console.log(`❌ 未找到发送者 ${senderId} 所在的房间`);
			return;
		}

		if (isHost) {
			// 主机发给所有观看者
			targetRoom.viewers.forEach(viewerId => {
				const viewer = this.clients.get(viewerId);
				if (viewer) {
					viewer.send(JSON.stringify({ type: messageType, ...data, from: senderId }));
				}
			});
		} else {
			// 观看者发给主机
			const host = this.clients.get(targetRoom.host);
			if (host) {
				host.send(JSON.stringify({ type: messageType, ...data, from: senderId }));
			}
		}
	}

	notifyHost(viewerId, data) {
		for (const [roomId, room] of this.rooms.entries()) {
			if (room.viewers.has(viewerId)) {
				const host = this.clients.get(room.host);
				if (host) {
					host.send(JSON.stringify({ type: 'viewer-connected', viewerId: viewerId }));
				}
				break;
			}
		}
	}

	handleDisconnect(clientId) {
		console.log(`📱 客户端断开: ${clientId}`);
		this.clients.delete(clientId);

		for (const [roomId, room] of this.rooms.entries()) {
			if (room.host === clientId) {
				room.viewers.forEach(viewerId => {
					const viewer = this.clients.get(viewerId);
					if (viewer) {
						viewer.send(JSON.stringify({ type: 'host-disconnected' }));
					}
				});
				this.rooms.delete(roomId);
				console.log(`🏠 房间已关闭: ${roomId}`);
			} else if (room.viewers.has(clientId)) {
				room.viewers.delete(clientId);
				console.log(`👁️ 观看者离开房间: ${roomId}`);
			}
		}
	}

	generateId() {
		return Math.random().toString(36).substr(2, 9).toUpperCase();
	}
}
