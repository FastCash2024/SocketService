import express from "express";
import http from "http";
import { Server } from "socket.io";
import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*", // Permitir conexiones desde cualquier origen
    },    
    path: "/api/socket", // 👈 importante
});

// Crear clientes Redis para suscripción y publicación
const sub = new Redis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: process.env.REDIS_PORT || 6379,
});
const pub = new Redis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: process.env.REDIS_PORT || 6379,
});

// Mapa para llevar el registro de los usuarios conectados: userId -> socketId
const userSockets = new Map();

// Función para emitir la lista de usuarios en línea a todos los clientes
// const broadcastOnlineUsers = async () => {
//     // Aquí usamos los userIds registrados en el mapa
//     const onlineUsers = Array.from(userSockets.keys());
//     console.log("onlineUsers", onlineUsers)
//     io.emit("onlineUsers", onlineUsers);
// };



const broadcastOnlineUsers = async () => {
    const onlineUsers = [];
  
    // Recorre los userIds del mapa local
    for (const userId of userSockets.keys()) {
      const userDataStr = await pub.get(`userStatus:${userId}`);
      if (userDataStr) {
        try {
          const userData = JSON.parse(userDataStr);
          onlineUsers.push(userData);
        } catch (err) {
          console.error(`❌ Error parseando userStatus de ${userId}:`, err);
        }
      }
    }
  
    console.log("🔵 Usuarios online:", onlineUsers);
    io.emit("onlineUsers", onlineUsers);
  };


// Manejo de conexiones de WebSocket
io.on("connection", (socket) => {
    console.log("🔹 Cliente conectado:", socket.id);

    // Al registrar un usuario, se guarda en el mapa y se marca como online en Redis
    //   socket.on("register", async (userId) => {
    //     userSockets.set(userId, socket.id);
    //     await pub.set(`userStatus:${userId}`, "online", "EX", 86400);
    //     console.log(`Usuario ${userId} registrado y marcado online`);
    //     broadcastOnlineUsers();
    //   });
    socket.on("register", async (userData) => {
        const { id, diuc } = userData;

        // Asocia userId con el socket
        userSockets.set(id, socket.id);

        // Guardar el estado online con más info (como diuc)
        await pub.set(
            `userStatus:${id}`,
            JSON.stringify({
                online: true,
                ...userData,
                socketId: socket.id,
                timestamp: Date.now()
            }),
            "EX",
            86400 // 1 día de expiración
        );

        console.log(`✅ Usuario ${id} registrado con DIUC "${diuc}"`);

        // Emitir a todos los conectados la lista de usuarios online
        broadcastOnlineUsers();
    });

    // Al desconectarse, se elimina el usuario del mapa y se marca como offline en Redis
    socket.on("disconnect", async () => {
        let disconnectedUserId = null;
        userSockets.forEach((sId, userId) => {
            if (sId === socket.id) {
                disconnectedUserId = userId;
            }
        });
        if (disconnectedUserId) {
            userSockets.delete(disconnectedUserId);
            await pub.del(`userStatus:${disconnectedUserId}`);
            console.log(`Usuario ${disconnectedUserId} desconectado y marcado offline`);
            broadcastOnlineUsers();
        }
    });
});

// Suscribirse a los eventos "login" y "logout" en Redis
sub.subscribe("login", "logout");
sub.on("message", async (channel, message) => {
    const data = JSON.parse(message);

    if (channel === "login") {
        // Cuando se recibe un evento "login", se marca al usuario como online
        await pub.set(`userStatus:${data.userId}`, "online", "EX", 86400);
        console.log(`Evento login recibido para usuario ${data.userId}`);
    }

    if (channel === "logout") {
        // Cuando se recibe un evento "logout", se notifica al cliente y se elimina del mapa
        const socketId = userSockets.get(data.userId);
        if (socketId) {
            io.to(socketId).emit("logout");
            console.log(`Notificando logout al usuario ${data.userId}`);
            userSockets.delete(data.userId);
        }
        await pub.del(`userStatus:${data.userId}`);
    }

    // Después de cualquier evento, actualizar la lista de usuarios en línea
    broadcastOnlineUsers();
});

// Iniciar el servidor WebSocket en el puerto configurado
const PORT = process.env.WS_PORT || 4000;
server.listen(PORT, () => {
    console.log(`✅ Servidor WebSocket corriendo en el puerto ${PORT}`);
});









// import express from "express";
// import http from "http";
// import { Server } from "socket.io";
// import Redis from "ioredis";
// import dotenv from "dotenv";

// dotenv.config();

// const app = express();
// const server = http.createServer(app);

// const io = new Server(server, {
//   cors: {
//     origin: "*",
//   },
// });

// // Configuración de Redis para Pub/Sub
// const sub = new Redis({
//   host: process.env.REDIS_HOST || "127.0.0.1",
//   port: process.env.REDIS_PORT || 6379,
// });

// const userSockets = new Map(); // Relación userId -> socketId

// // Escuchar conexiones de WebSocket
// io.on("connection", (socket) => {
//   console.log("🔹 Nuevo cliente conectado");

//   // Registrar el usuario con su socket ID
//   socket.on("register", (userId) => {
//     userSockets.set(userId, socket.id);
//   });

//   // Eliminar el usuario cuando se desconecta
//   socket.on("disconnect", () => {
//     userSockets.forEach((socketId, userId) => {
//       if (socketId === socket.id) {
//         userSockets.delete(userId);
//       }
//     });
//   });
// });

// // 🔹 Suscribirse al canal "logout" en Redis
// sub.subscribe("logout");

// sub.on("message", (channel, message) => {
//   if (channel === "logout") {
//     const { userId } = JSON.parse(message);
//     const socketId = userSockets.get(userId);
//     if (socketId) {
//       io.to(socketId).emit("logout"); // 🔹 Notifica a la sesión anterior que debe cerrar
//       console.log(`🔴 Cerrando sesión de usuario: ${userId}`);
//     }
//   }
// });

// // Iniciar el servidor WebSocket
// const PORT = process.env.WS_PORT || 4000;
// server.listen(PORT, () => {
//   console.log(`✅ Servidor WebSocket corriendo en el puerto ${PORT}`);
// });






