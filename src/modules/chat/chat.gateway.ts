import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto';

interface AuthenticatedSocket extends Socket {
  userId: string;
}

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers: Map<string, Set<string>> = new Map();

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });

      client.userId = payload.sub;

      // Track connected sockets for this user
      if (!this.connectedUsers.has(client.userId)) {
        this.connectedUsers.set(client.userId, new Set());
      }
      this.connectedUsers.get(client.userId)!.add(client.id);

      // Join user's personal room for direct notifications
      client.join(`user:${client.userId}`);

      // Emit connection success
      client.emit('connected', { userId: client.userId });

      console.log(`User ${client.userId} connected with socket ${client.id}`);
    } catch (error) {
      console.error('WebSocket authentication failed:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      const userSockets = this.connectedUsers.get(client.userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.connectedUsers.delete(client.userId);
        }
      }
      console.log(`User ${client.userId} disconnected`);
    }
  }

  private extractToken(client: Socket): string | null {
    // Check Authorization header
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check query parameter
    const token = client.handshake.query.token;
    if (token && typeof token === 'string') {
      return token;
    }

    // Check auth object
    const auth = client.handshake.auth;
    if (auth && auth.token) {
      return auth.token;
    }

    return null;
  }

  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    try {
      // Verify user has access to this conversation
      await this.chatService.getConversationById(
        data.conversationId,
        client.userId,
      );

      client.join(`conversation:${data.conversationId}`);

      return { success: true, conversationId: data.conversationId };
    } catch (error) {
      throw new WsException(error.message || 'Failed to join conversation');
    }
  }

  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.leave(`conversation:${data.conversationId}`);
    return { success: true };
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: SendMessageDto,
  ) {
    try {
      const message = await this.chatService.sendMessage(client.userId, data);

      // Get conversation to find recipient
      const conversation = await this.chatService.getConversationById(
        data.conversationId,
        client.userId,
      );

      const recipientId =
        conversation.participant1Id === client.userId
          ? conversation.participant2Id
          : conversation.participant1Id;

      // Emit to the conversation room
      this.server
        .to(`conversation:${data.conversationId}`)
        .emit('new_message', message);

      // Also emit to recipient's personal room for notifications
      this.server.to(`user:${recipientId}`).emit('message_notification', {
        conversationId: data.conversationId,
        message,
        sender: {
          id: client.userId,
        },
      });

      return { success: true, message };
    } catch (error) {
      throw new WsException(error.message || 'Failed to send message');
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    // Broadcast to others in the conversation
    client.to(`conversation:${data.conversationId}`).emit('user_typing', {
      conversationId: data.conversationId,
      userId: client.userId,
    });

    return { success: true };
  }

  @SubscribeMessage('stop_typing')
  handleStopTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.to(`conversation:${data.conversationId}`).emit('user_stop_typing', {
      conversationId: data.conversationId,
      userId: client.userId,
    });

    return { success: true };
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    try {
      await this.chatService.markMessagesAsRead(
        data.conversationId,
        client.userId,
      );

      // Notify sender that messages were read
      const conversation = await this.chatService.getConversationById(
        data.conversationId,
        client.userId,
      );

      const otherParticipantId =
        conversation.participant1Id === client.userId
          ? conversation.participant2Id
          : conversation.participant1Id;

      this.server.to(`user:${otherParticipantId}`).emit('messages_read', {
        conversationId: data.conversationId,
        readBy: client.userId,
      });

      return { success: true };
    } catch (error) {
      throw new WsException(error.message || 'Failed to mark messages as read');
    }
  }

  // Utility method to send notification to specific user
  sendToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  // Check if user is online
  isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }
}
