/**
 * WebRTC P2P Connection Manager
 * Handles peer connection, data channels, and signaling
 */

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed';

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'peer_joined' | 'peer_disconnected' | 'connected';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  role?: 'host' | 'guest';
  game_seed?: number;
}

export interface WebRTCCallbacks {
  onStateChange: (state: ConnectionState) => void;
  onMessage: (data: unknown) => void;
  onGameSeed: (seed: number) => void;
  onPeerDisconnected?: () => void;  // Called when peer disconnects (game ends)
}

// Free public STUN servers
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
};

export class WebRTCConnection {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private ws: WebSocket | null = null;
  private callbacks: WebRTCCallbacks;
  private isHost: boolean = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private hasNotifiedDisconnect: boolean = false; // Prevent duplicate disconnect notifications
  private isConnected: boolean = false; // Track if we ever successfully connected

  constructor(callbacks: WebRTCCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Connect to signaling server and establish P2P connection
   */
  async connect(serverUrl: string, roomId: string): Promise<void> {
    this.callbacks.onStateChange('connecting');

    // Connect to signaling WebSocket
    const wsUrl = `${serverUrl.replace('http', 'ws')}/ws/${roomId}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[WS] Connected to signaling server');
    };

    this.ws.onmessage = async (event) => {
      const message: SignalingMessage = JSON.parse(event.data);
      await this.handleSignalingMessage(message);
    };

    this.ws.onerror = (error) => {
      console.error('[WS] Error:', error);
      this.callbacks.onStateChange('failed');
    };

    this.ws.onclose = () => {
      console.log('[WS] Disconnected from signaling server');
      // If WebSocket closes while we were connected, it means signaling died
      // The DataChannel might still work for a bit, but notify anyway
      // (notifyDisconnect is idempotent, so this is safe)
      if (this.isConnected) {
        this.notifyDisconnect();
      }
    };
  }

  private async handleSignalingMessage(message: SignalingMessage): Promise<void> {
    console.log('[Signal]', message.type);

    switch (message.type) {
      case 'connected':
        this.isHost = message.role === 'host';
        if (message.game_seed) {
          this.callbacks.onGameSeed(message.game_seed);
        }
        if (this.isHost) {
          console.log('[P2P] Waiting for peer to join...');
        }
        break;

      case 'peer_joined':
        if (message.game_seed) {
          this.callbacks.onGameSeed(message.game_seed);
        }
        // Host initiates P2P connection
        await this.createPeerConnection();
        await this.createOffer();
        break;

      case 'offer':
        await this.createPeerConnection();
        await this.handleOffer(message.sdp!);
        break;

      case 'answer':
        await this.handleAnswer(message.sdp!);
        break;

      case 'ice-candidate':
        await this.handleIceCandidate(message.candidate!);
        break;

      case 'peer_disconnected':
        // Peer has disconnected - game ends
        console.log('[P2P] Peer disconnected (via signaling server)');
        this.notifyDisconnect();
        break;
    }
  }

  private async createPeerConnection(): Promise<void> {
    this.pc = new RTCPeerConnection(ICE_SERVERS);

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignaling({
          type: 'ice-candidate',
          candidate: event.candidate.toJSON()
        });
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      console.log('[P2P] Connection state:', state);
      if (state === 'connected') {
        this.callbacks.onStateChange('connected');
      } else if (state === 'failed') {
        this.callbacks.onStateChange('failed');
        // Connection failed - notify if we were connected
        if (this.isConnected) {
          this.notifyDisconnect();
        }
      } else if (state === 'disconnected' || state === 'closed') {
        // Peer connection lost - notify if we were connected
        if (this.isConnected) {
          this.notifyDisconnect();
        }
        this.callbacks.onStateChange('disconnected');
      }
    };

    if (this.isHost) {
      // Host creates data channel
      this.dataChannel = this.pc.createDataChannel('game', {
        ordered: true
      });
      this.setupDataChannel();
    } else {
      // Guest receives data channel
      this.pc.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this.setupDataChannel();
      };
    }
  }

  private setupDataChannel(): void {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      console.log('[DataChannel] Open');
      this.isConnected = true;
      this.callbacks.onStateChange('connected');
    };

    this.dataChannel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.callbacks.onMessage(data);
      } catch {
        console.error('[DataChannel] Failed to parse message');
      }
    };

    this.dataChannel.onclose = () => {
      console.log('[DataChannel] Closed');
      // When data channel closes, the connection is lost - notify about peer disconnect
      // Only notify if we were previously connected (not during setup failures)
      if (this.isConnected) {
        this.notifyDisconnect();
      }
      this.callbacks.onStateChange('disconnected');
    };

    this.dataChannel.onerror = (error) => {
      console.error('[DataChannel] Error:', error);
    };
  }

  private async createOffer(): Promise<void> {
    if (!this.pc) return;

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    this.sendSignaling({
      type: 'offer',
      sdp: offer.sdp
    });
  }

  private async handleOffer(sdp: string): Promise<void> {
    if (!this.pc) return;

    await this.pc.setRemoteDescription({ type: 'offer', sdp });

    // Process any pending ICE candidates
    for (const candidate of this.pendingCandidates) {
      await this.pc.addIceCandidate(candidate);
    }
    this.pendingCandidates = [];

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    this.sendSignaling({
      type: 'answer',
      sdp: answer.sdp
    });
  }

  private async handleAnswer(sdp: string): Promise<void> {
    if (!this.pc) return;

    await this.pc.setRemoteDescription({ type: 'answer', sdp });

    // Process any pending ICE candidates
    for (const candidate of this.pendingCandidates) {
      await this.pc.addIceCandidate(candidate);
    }
    this.pendingCandidates = [];
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc || !this.pc.remoteDescription) {
      // Queue candidate if remote description not set yet
      this.pendingCandidates.push(candidate);
      return;
    }

    await this.pc.addIceCandidate(candidate);
  }

  private sendSignaling(message: SignalingMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Notify about peer disconnect exactly once
   * This prevents duplicate notifications from multiple disconnect sources
   */
  private notifyDisconnect(): void {
    if (this.hasNotifiedDisconnect) {
      console.log('[P2P] Disconnect already notified, skipping duplicate');
      return;
    }
    this.hasNotifiedDisconnect = true;
    console.log('[P2P] Notifying peer disconnect');
    this.callbacks.onPeerDisconnected?.();
  }

  /**
   * Send game data to peer
   */
  send(data: unknown): void {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(data));
    }
  }

  /**
   * Close all connections
   * This is for intentional disconnection (user action), not peer failure
   */
  disconnect(): void {
    // Don't notify on intentional disconnect
    this.hasNotifiedDisconnect = true;
    this.dataChannel?.close();
    this.pc?.close();
    this.ws?.close();
    this.dataChannel = null;
    this.pc = null;
    this.ws = null;
    this.isConnected = false;
  }
}

