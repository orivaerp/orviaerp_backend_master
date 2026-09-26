const express =
   require("express");

const cors =
   require("cors");

const session =
   require("express-session");

const passport =
   require("./common/config/passport");

const app =
   express();

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
   cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000
   }
   // NOTE: defaults to the in-memory session store, which is fine for a single
   // dev instance but not for production/multi-instance. Swap in a persistent
   // store (e.g. connect-mongo) before deploying.
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