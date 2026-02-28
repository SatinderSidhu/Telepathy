import { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from '../../services/socket';
import { useAuth } from '../../context/AuthContext';
import * as mediasoupClient from 'mediasoup-client';

export default function CallScreen({ conversation, conversationId, callType, isIncoming, callerId, onEndCall }) {
  const { user } = useAuth();
  const [callStatus, setCallStatus] = useState(isIncoming ? 'ringing' : 'calling');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callType === 'audio');
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const deviceRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const producersRef = useRef([]);
  const pendingProducersRef = useRef([]);

  const roomId = conversationId;

  const initMediasoup = useCallback(async () => {
    const socket = getSocket();
    if (!socket || !roomId) return;

    try {
      console.log('[Call] initMediasoup: getting router capabilities for', roomId);
      // 1. Get router RTP capabilities
      const { rtpCapabilities } = await new Promise((resolve) => {
        socket.emit('media:getRouterCapabilities', { conversationId: roomId }, resolve);
      });
      console.log('[Call] router rtpCapabilities received');

      // 2. Create mediasoup Device
      const device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities: rtpCapabilities });
      deviceRef.current = device;
      console.log('[Call] mediasoup Device loaded');

      // 3. Tell server our RTP capabilities (await callback to ensure set before consuming)
      await new Promise((resolve) => {
        socket.emit('media:setRtpCapabilities', {
          conversationId: roomId,
          rtpCapabilities: device.rtpCapabilities,
        }, resolve);
      });
      console.log('[Call] RTP capabilities sent to server');

      // 4. Create Send Transport
      const sendTransportData = await new Promise((resolve) => {
        socket.emit('media:createTransport', { conversationId: roomId }, resolve);
      });
      if (sendTransportData.error) throw new Error(sendTransportData.error);
      console.log('[Call] send transport data received');

      const sendTransport = device.createSendTransport(sendTransportData);
      sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        socket.emit('media:connectTransport', {
          conversationId: roomId,
          transportId: sendTransport.id,
          dtlsParameters,
        }, (res) => {
          if (res.error) errback(new Error(res.error));
          else callback();
        });
      });
      sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
        socket.emit('media:produce', {
          conversationId: roomId,
          transportId: sendTransport.id,
          kind,
          rtpParameters,
          appData,
        }, (res) => {
          if (res.error) errback(new Error(res.error));
          else callback({ id: res.id });
        });
      });
      sendTransportRef.current = sendTransport;

      // 5. Create Receive Transport
      const recvTransportData = await new Promise((resolve) => {
        socket.emit('media:createTransport', { conversationId: roomId }, resolve);
      });
      if (recvTransportData.error) throw new Error(recvTransportData.error);
      console.log('[Call] recv transport data received');

      const recvTransport = device.createRecvTransport(recvTransportData);
      recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        socket.emit('media:connectTransport', {
          conversationId: roomId,
          transportId: recvTransport.id,
          dtlsParameters,
        }, (res) => {
          if (res.error) errback(new Error(res.error));
          else callback();
        });
      });
      recvTransportRef.current = recvTransport;

      // 6. Produce local media
      await produceMedia(sendTransport);
      console.log('[Call] local media produced (if available)');

      // 7. Consume existing producers from server
      const existingProducers = await new Promise((resolve) => {
        socket.emit('media:getProducers', { conversationId: roomId }, resolve);
      });
      console.log('[Call] existing producers from server:', existingProducers);
      for (const { producerId, userId } of existingProducers) {
        await consumeProducer(recvTransport, producerId, userId);
      }

      // 8. Consume any producers that arrived while we were setting up
      for (const { producerId, userId } of pendingProducersRef.current) {
        await consumeProducer(recvTransport, producerId, userId);
      }
      pendingProducersRef.current = [];

      setCallStatus('connected');
    } catch (err) {
      console.error('[Call] initMediasoup error:', err);
      setCallStatus('failed');
    }
  }, [roomId, callType]);

  async function produceMedia(transport) {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      });
    } catch (err) {
      console.error('[Call] getUserMedia failed:', err);
      setCallStatus('no-media-permission');
      return;
    }

    localStreamRef.current = stream;
    if (localVideoRef.current) {
      try {
        localVideoRef.current.srcObject = stream;
      } catch (e) {
        console.warn('[Call] could not set local video srcObject:', e);
      }
    }

    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      try {
        const producer = await transport.produce({ track: audioTrack });
        producersRef.current.push(producer);
        console.log('[Call] audio producer created:', producer.id);
      } catch (err) {
        console.error('[Call] failed to produce audio track:', err);
      }
    }

    if (callType === 'video') {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          const producer = await transport.produce({ track: videoTrack });
          producersRef.current.push(producer);
          console.log('[Call] video producer created:', producer.id);
        } catch (err) {
          console.error('[Call] failed to produce video track:', err);
        }
      }
    }
  }

  async function consumeProducer(transport, producerId, userId) {
    const socket = getSocket();
    console.log('[Call] attempting to consume producer', producerId, 'from user', userId);
    const consumerData = await new Promise((resolve) => {
      socket.emit('media:consume', {
        conversationId: roomId,
        transportId: transport.id,
        producerId,
      }, resolve);
    });

    if (consumerData.error) {
      console.error('Consume error:', consumerData.error);
      return;
    }

    const consumer = await transport.consume({
      id: consumerData.id,
      producerId: consumerData.producerId,
      kind: consumerData.kind,
      rtpParameters: consumerData.rtpParameters,
    });

    socket.emit('media:resumeConsumer', {
      conversationId: roomId,
      consumerId: consumer.id,
    });

    setRemoteStreams((prev) => {
      const updated = new Map(prev);
      const existing = updated.get(userId) || new MediaStream();
      existing.addTrack(consumer.track);
      updated.set(userId, existing);
      return updated;
    });
  }

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    if (!isIncoming) {
      startCall();
    }

    socket.on('call:accepted', async () => {
      console.log('[Call] call:accepted received');
      setCallStatus('connecting');
      await initMediasoup();
    });

    socket.on('call:declined', () => {
      setCallStatus('declined');
      setTimeout(onEndCall, 2000);
    });

    socket.on('call:ended', () => {
      cleanup();
      onEndCall();
    });

    socket.on('call:peerLeft', ({ userId }) => {
      setRemoteStreams((prev) => {
        const updated = new Map(prev);
        updated.delete(userId);
        return updated;
      });
    });

    // Queue producers that arrive before recvTransport is ready
    socket.on('media:newProducer', async ({ producerId, userId }) => {
      console.log('[Call] media:newProducer event received:', producerId, userId);
      if (recvTransportRef.current) {
        await consumeProducer(recvTransportRef.current, producerId, userId);
      } else {
        pendingProducersRef.current.push({ producerId, userId });
      }
    });

    socket.on('media:peerLeft', ({ userId }) => {
      setRemoteStreams((prev) => {
        const updated = new Map(prev);
        updated.delete(userId);
        return updated;
      });
    });

    return () => {
      socket.off('call:accepted');
      socket.off('call:declined');
      socket.off('call:ended');
      socket.off('call:peerLeft');
      socket.off('media:newProducer');
      socket.off('media:peerLeft');
      cleanup();
    };
  }, []);

  function startCall() {
    const socket = getSocket();
    const otherMembers = conversation?.members
      ?.filter((m) => m.id !== user.id)
      .map((m) => m.id) || [];

    console.log('[Call] initiating call to', otherMembers);
    socket.emit('call:initiate', {
      conversationId: roomId,
      callType,
      targetUserIds: otherMembers,
    });
  }

  async function acceptCall() {
    setCallStatus('connecting');
    const socket = getSocket();
    socket.emit('call:accept', {
      conversationId: roomId,
      callerId,
    });
    await initMediasoup();
  }

  function declineCall() {
    const socket = getSocket();
    socket.emit('call:decline', {
      conversationId: roomId,
      callerId,
    });
    onEndCall();
  }

  function endCall() {
    const socket = getSocket();
    socket.emit('call:end', { conversationId: roomId });
    cleanup();
    onEndCall();
  }

  function toggleMute() {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }

  function toggleVideo() {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  }

  function cleanup() {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    producersRef.current.forEach((p) => p.close());
    producersRef.current = [];
    if (sendTransportRef.current) {
      sendTransportRef.current.close();
      sendTransportRef.current = null;
    }
    if (recvTransportRef.current) {
      recvTransportRef.current.close();
      recvTransportRef.current = null;
    }
    setRemoteStreams(new Map());
  }

  function getParticipantName(userId) {
    const member = conversation?.members?.find((m) => m.id === userId);
    return member?.username || 'User';
  }

  return (
    <div className="call-screen">
      <div className="call-status">{callStatus}</div>

      <div className="video-grid">
        {Array.from(remoteStreams.entries()).map(([userId, stream]) => (
          <div key={userId} className="video-tile">
            <video
              autoPlay
              playsInline
              ref={(el) => { if (el) el.srcObject = stream; }}
              className="remote-video"
            />
            <span className="video-label">{getParticipantName(userId)}</span>
          </div>
        ))}

        {remoteStreams.size === 0 && callStatus !== 'ringing' && (
          <div className="video-tile placeholder">
            <p>Waiting for others to join...</p>
          </div>
        )}
      </div>

      {callType === 'video' && (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="local-video"
        />
      )}

      <div className="call-controls">
        {callStatus === 'ringing' && isIncoming ? (
          <>
            <button className="btn-accept" onClick={acceptCall}>Accept</button>
            <button className="btn-decline" onClick={declineCall}>Decline</button>
          </>
        ) : (
          <>
            <button
              className={`btn-control ${isMuted ? 'active' : ''}`}
              onClick={toggleMute}
            >
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
            {callType === 'video' && (
              <button
                className={`btn-control ${isVideoOff ? 'active' : ''}`}
                onClick={toggleVideo}
              >
                {isVideoOff ? 'Camera On' : 'Camera Off'}
              </button>
            )}
            <button className="btn-end" onClick={endCall}>End Call</button>
          </>
        )}
      </div>
    </div>
  );
}
