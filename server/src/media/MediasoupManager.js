const mediasoup = require('mediasoup');
const config = require('../config/mediasoup');

class MediasoupManager {
  constructor() {
    this.workers = [];
    this.nextWorkerIndex = 0;
    // Map of conversationId -> { router, peers: Map<userId, { transports, producers, consumers }> }
    this.rooms = new Map();
  }

  async init() {
    for (let i = 0; i < config.numWorkers; i++) {
      const worker = await mediasoup.createWorker(config.worker);
      worker.on('died', () => {
        console.error(`mediasoup worker died, pid: ${worker.pid}`);
        process.exit(1);
      });
      this.workers.push(worker);
    }
    console.log(`mediasoup: ${this.workers.length} workers created`);
  }

  getNextWorker() {
    const worker = this.workers[this.nextWorkerIndex];
    this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
    return worker;
  }

  async getOrCreateRoom(roomId) {
    if (this.rooms.has(roomId)) {
      return this.rooms.get(roomId);
    }

    const worker = this.getNextWorker();
    const router = await worker.createRouter({ mediaCodecs: config.router.mediaCodecs });

    const room = {
      router,
      peers: new Map(),
    };
    this.rooms.set(roomId, room);
    return room;
  }

  async createWebRtcTransport(roomId, userId) {
    const room = await this.getOrCreateRoom(roomId);

    const transport = await room.router.createWebRtcTransport(config.webRtcTransport);

    // Initialize peer if not exists
    if (!room.peers.has(userId)) {
      room.peers.set(userId, {
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
      });
    }

    const peer = room.peers.get(userId);
    peer.transports.set(transport.id, transport);

    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'closed') {
        transport.close();
      }
    });

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(roomId, userId, transportId, dtlsParameters) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');

    const peer = room.peers.get(userId);
    if (!peer) throw new Error('Peer not found');

    const transport = peer.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');

    await transport.connect({ dtlsParameters });
  }

  async produce(roomId, userId, transportId, kind, rtpParameters, appData = {}) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');

    const peer = room.peers.get(userId);
    if (!peer) throw new Error('Peer not found');

    const transport = peer.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');

    const producer = await transport.produce({ kind, rtpParameters, appData });

    producer.on('transportclose', () => {
      producer.close();
    });

    peer.producers.set(producer.id, producer);

    return { id: producer.id };
  }

  async consume(roomId, userId, transportId, producerId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');

    const peer = room.peers.get(userId);
    if (!peer) throw new Error('Peer not found');

    const transport = peer.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');

    if (!room.router.canConsume({ producerId, rtpCapabilities: peer.rtpCapabilities })) {
      throw new Error('Cannot consume');
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities: peer.rtpCapabilities,
      paused: true, // Start paused, client will resume
    });

    consumer.on('transportclose', () => {
      consumer.close();
    });

    consumer.on('producerclose', () => {
      consumer.close();
      peer.consumers.delete(consumer.id);
    });

    peer.consumers.set(consumer.id, consumer);

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    };
  }

  async resumeConsumer(roomId, userId, consumerId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const peer = room.peers.get(userId);
    if (!peer) return;

    const consumer = peer.consumers.get(consumerId);
    if (consumer) {
      await consumer.resume();
    }
  }

  getRouterRtpCapabilities(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return room.router.rtpCapabilities;
  }

  setRtpCapabilities(roomId, userId, rtpCapabilities) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (!room.peers.has(userId)) {
      room.peers.set(userId, {
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
      });
    }
    room.peers.get(userId).rtpCapabilities = rtpCapabilities;
  }

  getProducers(roomId, excludeUserId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    const producers = [];
    for (const [userId, peer] of room.peers) {
      if (userId === excludeUserId) continue;
      for (const [producerId, producer] of peer.producers) {
        producers.push({
          producerId,
          userId,
          kind: producer.kind,
        });
      }
    }
    return producers;
  }

  getPeersInRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.peers.keys());
  }

  removePeer(roomId, userId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const peer = room.peers.get(userId);
    if (!peer) return;

    // Close all transports (this also closes producers and consumers)
    for (const transport of peer.transports.values()) {
      transport.close();
    }

    room.peers.delete(userId);

    // If room is empty, close the router and remove
    if (room.peers.size === 0) {
      room.router.close();
      this.rooms.delete(roomId);
    }
  }
}

module.exports = new MediasoupManager();
