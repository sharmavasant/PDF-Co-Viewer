// server.js
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const path = require("path");

app.use(express.static("public"));

// Room structure
class Room {
  constructor(adminId) {
    this.adminId = adminId;
    this.currentPage = 1;
    this.users = new Set();
    this.pdfData = null; // Store PDF data
  }
}

// Store room information
const rooms = new Map();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Join room
  socket.on("joinRoom", ({ roomId, isAdmin }) => {
    socket.join(roomId);

    // Create room if doesn't exist
    if (!rooms.has(roomId)) {
      if (isAdmin) {
        rooms.set(roomId, new Room(socket.id));
      } else {
        socket.emit("error", { message: "Room does not exist" });
        return;
      }
    }

    const room = rooms.get(roomId);
    room.users.add(socket.id);

    // Send current state to new user
    socket.emit("pageSync", {
      page: room.currentPage,
      pdfData: room.pdfData,
    });

    // Notify others about new user
    io.to(roomId).emit("userCount", { count: room.users.size });
  });

  // Handle PDF upload
  socket.on("pdfUpload", ({ roomId, pdfData }) => {
    const room = rooms.get(roomId);
    if (!room || room.adminId !== socket.id) return;

    room.pdfData = pdfData;
    socket.to(roomId).emit("pdfSync", { pdfData });
  });

  // Handle page change
  socket.on("changePage", ({ roomId, page }) => {
    const room = rooms.get(roomId);
    if (!room || room.adminId !== socket.id) return;

    room.currentPage = page;
    socket.to(roomId).emit("pageSync", { page });
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    for (const [roomId, room] of rooms.entries()) {
      if (room.users.has(socket.id)) {
        room.users.delete(socket.id);
        io.to(roomId).emit("userCount", { count: room.users.size });

        // Clean up empty rooms
        if (room.users.size === 0) {
          rooms.delete(roomId);
        }
        // Reassign admin if admin left and others remain
        else if (room.adminId === socket.id && room.users.size > 0) {
          room.adminId = Array.from(room.users)[0];
          io.to(roomId).emit("adminChange", { newAdminId: room.adminId });
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
