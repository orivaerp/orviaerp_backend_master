const mongoose = require("mongoose");

const connectDB = async () => {

   try {

      const connectionOptions = {};

      if (process.env.USE_PROXY === "true") {
         connectionOptions.proxyHost = process.env.PROXY_HOST || "127.0.0.1";
         connectionOptions.proxyPort = parseInt(process.env.PROXY_PORT) || 1080;
          console.log("🔍 Proxy Options being used:", connectionOptions);
         console.log("Connecting via SOCKS5 proxy...");
      }

      await mongoose.connect(
         process.env.MONGO_URI,
         connectionOptions
      );

      console.log(
         "MongoDB Connected"
      );

   } catch (error) {

      console.log("=== DETAILED ERRORS ===");
   if (error.reason && error.reason.servers) {
      for (const [host, desc] of error.reason.servers) {
         console.log(host, "->", desc.error ? desc.error.message : desc.type);
      }
   }
   process.exit(1);
   }
};

module.exports = connectDB;