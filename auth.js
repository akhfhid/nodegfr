const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await prisma.user.findUnique({ where: { id } });
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://autofill.site/auth/google/callback"
},
    async (accessToken, refreshToken, profile, done) => {
        try {
            // Check if user exists
            let user = await prisma.user.findUnique({
                where: { googleId: profile.id }
            });

            const adminEmail = 'autofill.site@gmail.com';
            const role = profile.emails[0].value === adminEmail ? 'ADMIN' : 'USER';

            if (!user) {
                // Create new user
                user = await prisma.user.create({
                    data: {
                        googleId: profile.id,
                        email: profile.emails[0].value,
                        name: profile.displayName,
                        avatar: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null,
                        role: role
                    }
                });
            } else {
                // Update existing user
                // FORCE Update role based on email to ensure security
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        name: profile.displayName,
                        avatar: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : user.avatar,
                        role: role
                    }
                });
            }

            return done(null, user);
        } catch (err) {
            return done(err, null);
        }
    }
));

module.exports = passport;
