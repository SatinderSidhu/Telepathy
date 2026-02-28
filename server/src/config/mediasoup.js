const os = require('os');

module.exports = {
  // Worker settings
  worker: {
    rtcMinPort: 40000,
    rtcMaxPort: 49999,
    logLevel: 'warn',
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
  },

  // Number of workers (one per CPU core)
  numWorkers: Math.min(os.cpus().length, 4),

  // Router media codecs
  router: {
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000,
        },
      },
      {
        kind: 'video',
        mimeType: 'video/H264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '42e01f',
          'level-asymmetry-allowed': 1,
        },
      },
    ],
  },

  // WebRTC transport settings
  webRtcTransport: {
    listenInfos: [
      {
        protocol: 'udp',
        ip: '0.0.0.0',
        announcedAddress: process.env.MEDIASOUP_ANNOUNCED_IP || null,
      },
      {
        protocol: 'tcp',
        ip: '0.0.0.0',
        announcedAddress: process.env.MEDIASOUP_ANNOUNCED_IP || null,
      },
    ],
    initialAvailableOutgoingBitrate: 1000000,
    maxIncomingBitrate: 1500000,
  },
};
