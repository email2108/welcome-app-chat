import { Server } from 'socket.io';

interface ChatMessage {
  text: string;
  senderId: string;
  timestamp: string;
  roomId?: string;
  senderName?: string;
}

interface User {
  id: string;
  name: string;
  room: string;
}

export const setupSocket = (io: Server) => {
  const users = new Map<string, User>();
  const rooms = new Map<string, Set<string>>();

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Send welcome message
    socket.emit('message', {
      text: 'Welcome to the Chat App! You can now send and receive messages in real-time.',
      senderId: 'system',
      timestamp: new Date().toISOString(),
    });

    // Handle user joining a room
    socket.on('join-room', (data: { roomId: string; userName: string }) => {
      const { roomId, userName } = data;
      
      // Leave previous room if any
      const previousUser = users.get(socket.id);
      if (previousUser && previousUser.room) {
        socket.leave(previousUser.room);
        const roomUsers = rooms.get(previousUser.room);
        if (roomUsers) {
          roomUsers.delete(socket.id);
          if (roomUsers.size === 0) {
            rooms.delete(previousUser.room);
          }
        }
      }

      // Join new room
      socket.join(roomId);
      
      // Update user info
      users.set(socket.id, {
        id: socket.id,
        name: userName || 'Anonymous',
        room: roomId
      });

      // Add user to room
      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }
      rooms.get(roomId)?.add(socket.id);

      // Notify room about new user
      socket.to(roomId).emit('message', {
        text: `${userName || 'Anonymous'} joined the chat`,
        senderId: 'system',
        timestamp: new Date().toISOString(),
        roomId
      });

      // Confirm join to user
      socket.emit('room-joined', { roomId, success: true });
      console.log(`User ${socket.id} joined room ${roomId}`);
    });

    // Handle messages
    socket.on('message', (msg: ChatMessage) => {
      const user = users.get(socket.id);
      
      if (user) {
        // Broadcast message to room (excluding sender)
        socket.to(user.room).emit('message', {
          text: msg.text,
          senderId: msg.senderId,
          timestamp: msg.timestamp,
          roomId: user.room,
          senderName: user.name
        });

        // Send echo back to sender
        socket.emit('message', {
          text: msg.text,
          senderId: msg.senderId,
          timestamp: msg.timestamp,
          roomId: user.room,
          senderName: user.name
        });

        console.log(`Message from ${user.name} in room ${user.room}: ${msg.text}`);
      } else {
        // Fallback for users not in a room (original echo behavior)
        socket.emit('message', {
          text: `Echo: ${msg.text}`,
          senderId: 'system',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Handle typing indicators
    socket.on('typing', (data: { isTyping: boolean; roomId: string }) => {
      const user = users.get(socket.id);
      if (user) {
        socket.to(data.roomId).emit('user-typing', {
          userId: socket.id,
          userName: user.name,
          isTyping: data.isTyping
        });
      }
    });

    // Handle private messages
    socket.on('private-message', (data: { targetUserId: string; text: string }) => {
      const sender = users.get(socket.id);
      const targetUser = users.get(data.targetUserId);
      
      if (sender && targetUser) {
        io.to(data.targetUserId).emit('message', {
          text: data.text,
          senderId: socket.id,
          timestamp: new Date().toISOString(),
          senderName: sender.name,
          isPrivate: true
        });
        
        // Send confirmation to sender
        socket.emit('message', {
          text: `Private message sent to ${targetUser.name}: ${data.text}`,
          senderId: 'system',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Handle get room users
    socket.on('get-room-users', (roomId: string) => {
      const roomUsers = rooms.get(roomId);
      if (roomUsers) {
        const userList = Array.from(roomUsers).map(userId => {
          const user = users.get(userId);
          return user ? { id: userId, name: user.name } : { id: userId, name: 'Unknown' };
        });
        socket.emit('room-users', { roomId, users: userList });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      
      const user = users.get(socket.id);
      if (user) {
        // Notify room about user leaving
        socket.to(user.room).emit('message', {
          text: `${user.name} left the chat`,
          senderId: 'system',
          timestamp: new Date().toISOString(),
          roomId: user.room
        });

        // Remove user from room
        const roomUsers = rooms.get(user.room);
        if (roomUsers) {
          roomUsers.delete(socket.id);
          if (roomUsers.size === 0) {
            rooms.delete(user.room);
          }
        }

        // Remove user
        users.delete(socket.id);
      }
    });
  });

  // Utility function to get server stats
  io.of('/').adapter.on('create-room', (room) => {
    console.log(`Room created: ${room}`);
  });

  io.of('/').adapter.on('join-room', (room, id) => {
    console.log(`Socket ${id} joined room ${room}`);
  });

  io.of('/').adapter.on('leave-room', (room, id) => {
    console.log(`Socket ${id} left room ${room}`);
  });
};