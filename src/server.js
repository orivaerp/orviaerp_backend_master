const dotenv =
   require("dotenv");

/* -------------------------------------------------------------------------- */
/*                            Load ENV                                        */
/* -------------------------------------------------------------------------- */

const envFile =
   `.env.${process.env.NODE_ENV || "development"}`;

dotenv.config({
   path: envFile
});

/* -------------------------------------------------------------------------- */
/*                          Initialize Listeners                              */
/* -------------------------------------------------------------------------- */

require(
   "./listeners"
);

/* -------------------------------------------------------------------------- */
/*                              App & DB                                      */
/* -------------------------------------------------------------------------- */

const http =
   require("http");

const app =
   require("./app");

const { initSocket } =
   require("./common/config/socket");

const connectDB =
   require("./common/config/db");

const PORT =
   process.env.PORT || 5000;

// Socket.IO needs the raw http.Server (not just the Express app) to attach
// its own upgrade handling for WebSocket connections.
const server =
   http.createServer(app);

initSocket(server);

connectDB().then(() => {
   /* -------------------------------------------------------------------------- */
   /*                              Start Server                                  */
   /* -------------------------------------------------------------------------- */
   server.listen(PORT, () => {
      console.log(
         `✅ Server running on port ${PORT}`
      );
   });
})
