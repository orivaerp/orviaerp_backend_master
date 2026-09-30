const express =
   require("express");

const cors =
   require("cors");

const sessionMiddleware =
   require("./common/config/session");

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

app.use(sessionMiddleware);

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