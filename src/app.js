const express =
   require("express");

const cors =
   require("cors");

const session =
   require("express-session");

const { MongoStore } =
   require("connect-mongo");

const passport =
   require("./common/config/passport");

const app =
   express();

/* -------------------------------------------------------------------------- */
/*                             Session Store                                  */
/* -------------------------------------------------------------------------- */

// Falls back to express-session's default in-memory store when MONGO_URI isn't
// set (e.g. the test suite, which connects mongoose directly to an in-memory
// Mongo instead of via this env var) - fine there since tests don't need
// persistence. Mirrors db.js's SOCKS5 proxy options so it works wherever the
// main DB connection does.
let sessionStore;

if (process.env.MONGO_URI) {
   const clientOptions = {};

   if (process.env.USE_PROXY === "true") {
      clientOptions.proxyHost = process.env.PROXY_HOST || "127.0.0.1";
      clientOptions.proxyPort = parseInt(process.env.PROXY_PORT) || 1080;
   }

   sessionStore = MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      clientOptions,
      ttl: 24 * 60 * 60 // seconds, matches the cookie's maxAge below
   });
}

if (process.env.NODE_ENV === "production") {
   app.set("trust proxy", 1);
}

/* -------------------------------------------------------------------------- */
/*                               Middlewares                                  */
/* -------------------------------------------------------------------------- */

app.use(cors({
   origin: [
      "http://localhost:4200"
   ],
   credentials: true,
   methods: ["GET", "POST","PATCH", "PUT", "DELETE", "OPTIONS"],
   allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

app.use(session({
   secret: process.env.SESSION_SECRET,
   resave: false,
   saveUninitialized: false,
   store: sessionStore,
   cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000
   }
}));

app.use(passport.initialize());
app.use(passport.session());

/* -------------------------------------------------------------------------- */
/*                                 Routes                                     */
/* -------------------------------------------------------------------------- */

app.use(

   "/api/v1",

   require(
      "./api/v1/routes/index"
   )
);

/* -------------------------------------------------------------------------- */
/*                            Global Error Handler                            */
/* -------------------------------------------------------------------------- */

app.use(

   require(
      "./api/v1/middlewares/error.middleware"
   )
);

app.get("/health", (req, res) => {
   res.status(200).send("success")
})

module.exports = app;