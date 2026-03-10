const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcrypt");
const pool = require("./db");

passport.use(
  new LocalStrategy(
    { usernameField: "email" },
    async (email, password, done) => {
      try {

        const result = await pool.query(
          "SELECT * FROM users WHERE email=$1",
          [email]
        );

        if (result.rows.length === 0) {
          return done(null, false, { message: "User not found" });
        }

        const user = result.rows[0];

        const match = await bcrypt.compare(password, user.password);

        if (!match) {
          return done(null, false, { message: "Wrong password" });
        }

        return done(null, user);

      } catch (err) {
        return done(err);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {

  const result = await pool.query(
    "SELECT * FROM users WHERE id=$1",
    [id]
  );

  done(null, result.rows[0]);
});

module.exports = passport;