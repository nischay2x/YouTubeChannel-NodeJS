const express = require("express");
const app = express();
const google = require("googleapis").google;
const jwt = require("jsonwebtoken");

const OAuth2 = google.auth.OAuth2

const CONFIG = require("./config");

const cookieParser = require("cookie-parser");
app.use(cookieParser());

app.set("view engine", "ejs");
app.set("views", __dirname + '/ejs');

app.get("/", (req, res) => {
    if (req.cookies.jwt && jwt.verify(req.cookies.jwt, CONFIG.jwtSecret)) {
        return res.redirect('/my-channel')
    }
    const oauth2Client = new OAuth2(
        CONFIG.authCred.clientId,
        CONFIG.authCred.clientSecret,
        CONFIG.authCred.redirectUris
    );

    const loginLink = oauth2Client.generateAuthUrl({
        access_type: "offline", 
        scope: CONFIG.authCred.scopes 
    });
    return res.render("index", { loginLink });
});

app.get("/callback", (req, res) => {
    const oauth2Client = new OAuth2(
        CONFIG.authCred.clientId,
        CONFIG.authCred.clientSecret,
        CONFIG.authCred.redirectUris
    );

    if (req.query.error) {
        return res.redirect("/");
    } else {
        oauth2Client.getToken(req.query.code, (err, token) => {
            if (err) return res.redirect("/");

            res.cookie("jwt", jwt.sign(token, CONFIG.jwtSecret));
            return res.redirect("/home");
        });
    }
});

app.get('/home', (req, res) => {
    if (!req.cookies.jwt) {
        return res.redirect("/");
    }
    res.render('home')
})

app.get("/my-channel", async (req, res) => {
    if (!req.cookies.jwt) {
        return res.redirect("/");
    }

    const oauth2Client = new OAuth2(
        CONFIG.authCred.clientId,
        CONFIG.authCred.clientSecret,
        CONFIG.authCred.redirectUris
    );

    oauth2Client.credentials = jwt.verify(req.cookies.jwt, CONFIG.jwtSecret);

    const youtube = google.youtube("v3");

    try {
        const channelResponse = await youtube.channels.list({
            auth: oauth2Client,
            mine: true,
            part: 'id, snippet, contentDetails, statistics',
            maxResults: 1
        })
        if(!channelResponse.data.pageInfo.totalResults){
           return res.render('no-channel', {msg : "You Don't have a Channel"})
        } else{
            const channel = channelResponse.data.items[0]
            const uploadId = channel.contentDetails.relatedPlaylists.uploads
            
            const playlistItemResponse = await youtube.playlistItems.list({
                auth: oauth2Client,
                playlistId: uploadId,
                part: 'snippet, contentDetails, id',
                maxResults: 50
            })
            const uploads = playlistItemResponse.data.items
            res.render('channel', { channel, uploads })
        }
    } catch (error) {
        res.status(500).json({ msg: error.message })
    }
});

app.get("/search-channel", async (req, res) => {
    if (!req.cookies.jwt) {
        return res.redirect("/");
    }

    const oauth2Client = new OAuth2(
        CONFIG.authCred.clientId,
        CONFIG.authCred.clientSecret,
        CONFIG.authCred.redirectUris
    );

    oauth2Client.credentials = jwt.verify(req.cookies.jwt, CONFIG.jwtSecret);

    const youtube = google.youtube("v3");

    try {
        const channelResponse = await youtube.search.list({
            auth: oauth2Client,
            q : req.query.username,
            part: 'snippet',
            maxResults: 50,
            type : 'channel'
        })
        if(!channelResponse.data.pageInfo.totalResults){
            res.render('no-channel', {msg : "Your Query returned no Results."})
        } else {
            const channels = channelResponse.data.items
            res.render('channel-list', { channels, query : req.query.username })
        }
    } catch (error) {
        res.status(500).json({ msg: error.message })
    }
});

app.get('/logout', (req, res) => {
    if(req.cookies.jwt){
        const oauth2Client = new OAuth2(
            CONFIG.authCred.clientId,
            CONFIG.authCred.clientSecret,
            CONFIG.authCred.redirectUris
        );
        const {access_token} = jwt.verify(req.cookies.jwt, CONFIG.jwtSecret)
        oauth2Client.revokeToken(access_token, (err, body) => {
            if(err) res.status(403).send({msg : body})
            else {
                res.status(200).clearCookie('jwt').redirect('/') 
            }
        })
    }
})


app.listen(CONFIG.port, () => {
    console.log(`Listening on port ${CONFIG.port}`);
});

