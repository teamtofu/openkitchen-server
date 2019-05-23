require('dotenv').config();

const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const fetch = require('node-fetch');
const cors = require('cors');
const cheerio = require('cheerio');
const sharp = require('sharp');
const compression = require('compression');
const path = require('path');
const microdata = require('microdata-node');
const robotsParser = require('robots-parser');

const port = process.env.PORT || 80;
server.listen(port, () => {
    console.log('Open Kitchen running on port:', port);
});

app.disable('x-powered-by');
app.use(compression({}));
if (process.env.NODE_ENV === 'development') app.use(cors());

app.use(express.static(path.join(__dirname, './static')));

app.get('/api/photoProxy', async (req, res) => {
    try {

        let stream = (await fetch(req.query.url)).body;

        let resizer = sharp().resize({
            width: 1920,
            height: 192,
            withoutEnlargement: true,
            fastShrinkOnLoad: true
        }).jpeg({quality: 80});

        res.set('Cache-Control', 'public, max-age=31536000');
        res.set('Content-Type', 'image/jpeg');

        stream.pipe(resizer).pipe(res);
    } catch (e) {
        console.error(e);
        res.sendStatus(404);
    }
})

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, './static/index.html'));
});

const ua = 'Mozilla/5.0 (compatible; OpenKitchenBot/1.0; +https://github.com/teamtofu/openkitchen-server)';

io.on('connection', (socket) => {
    socket.on('recipeUrl', async (msg) => {
        try {
            let url = new URL(msg);

            const robotsTxt = await fetch(url.origin + '/robots.txt', {
                headers: {
                    'User-Agent': ua
                }
            }).then(a => (a.text()));

            const rp = robotsParser(url.origin, robotsTxt);

            if (!rp.isAllowed(msg, 'OpenKitchenBot/1.0')) throw new Error('Fetching blocked by robots.txt');

            const $ = cheerio.load(await fetch(msg, {
                headers: {
                    'User-Agent': ua
                }
            }).then(a => (a.text())));

            let md = microdata.toJson($.html(), {
                base: url.origin
            });

            for (let i in md.items) {
                if (md.items[i].type.indexOf('http://schema.org/Recipe') !== -1) {
                    let markup = md.items[i].properties;
                    markup['@type'] = 'recipe';
                    if (Array.isArray(markup.name)) markup.name = markup.name[0];
                    if (Array.isArray(markup.description)) markup.description = markup.description[0];
                    socket.emit('recipe', markup);
                    return;
                } 
            }

            $('script[type="application/ld+json"]').each((i, el) => {
                try {
                    let markup = JSON.parse(el.children[0].data);
                    
                    if (markup['@type'] === 'Recipe') {
                        socket.emit('recipe', markup);
                    } else if (Array.isArray(markup['@graph'])) {
                        for (let i in markup['@graph']) {
                            if (markup['@graph'][i]['@type'] === 'Recipe') {
                                socket.emit('recipe', markup['@graph'][i]);
                                break;
                            }
                        }
                    }
                } catch (e) {
                    console.error(e);
                }
            });
            socket.emit('recipeStatus', false);
        } catch (e) {
            console.error(e);
            socket.emit('recipeStatus', true);
        }
    });

    socket.on('syncRequest', (reqSock) => {
        io.to(String(reqSock)).emit('syncRequest', socket.id);
    });

    socket.on('syncData', (reqSock, data) => {
        io.to(String(reqSock)).emit('syncData', data);
    });
});