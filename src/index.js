const http = require('http');
const { createReadStream, readdirSync, createWriteStream, statSync } = require('fs')
const { join } = require('path');
const { v4: uuidv4 } = require('uuid');

const hostname = '0.0.0.0';
const port = process.env.PORT || 3000;
const fullHost = `http://${hostname}:${port}/`;

const server = http.createServer();

const allowedFormats = ['video/mp4', 'video/mov', 'video/avi'];
const idRegexp = /^\/[0-9]{1,20}-[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;
const storage = join(process.cwd(), 'storage');
const extension = '.mp4';

const uploader = (req) => {
    return new Promise((resolve, reject) => {
        const uuid = uuidv4();
        const now = Date.now();
        const fileName = `${now}-${uuid}`
        const filePath = join(storage, fileName + extension);
        const stream = createWriteStream(filePath);

        stream.on('open', () => {
            req.pipe(stream)
        });

        stream.on('close', () => {
            resolve(fileName);
        });

        stream.on('error', (err) => {
            reject(err);
        });
    })
};

const handleError = (res, code, err) => {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = code;
    return res.end(JSON.stringify(err));
}

server.on('request', async (req, res) => {

    const u = new URL(req.url, fullHost);
    const {pathname} = u;
    const isGetMethod = req.method === 'GET';
    const isPostMethod = req.method === 'POST';

    if (isGetMethod && pathname === '/list') {

        try {
            const files = readdirSync(storage);
            const result = files.filter(file => file.endsWith(extension)).map(file => file.replace(extension, ''));

            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 200;
            return res.end(JSON.stringify({
                data: result
            }));

        } catch (err) {
            return handleError(res, 500, err)
        }

    }

    if (isGetMethod && pathname.match(idRegexp)) {

        try {

            const file = join(storage, `${pathname}${extension}`);

            const { size } = await statSync(file);

            const range = req.headers.range;

            if (range) {

                /** Extracting Start and End value from Range Header */
                let [start, end] = range.replace(/bytes=/, "").split("-");
                start = parseInt(start, 10);
                end = end ? parseInt(end, 10) : size - 1;

                if (!isNaN(start) && isNaN(end)) {
                    start = start;
                    end = size - 1;
                }
                if (isNaN(start) && !isNaN(end)) {
                    start = size - end;
                    end = size - 1;
                }

                // Handle unavailable range request
                if (start >= size || end >= size) {
                    // Return the 416 Range Not Satisfiable.
                    res.writeHead(416, {
                        "Content-Range": `bytes */${size}`
                    });
                    return res.end();
                }

                res.writeHead(206, {
                    "Content-Range": `bytes ${start}-${end}/${size}`,
                    "Accept-Ranges": "bytes",
                    "Content-Length": end - start + 1,
                    "Content-Type": "video/mp4"
                });

                const readStream = createReadStream(file, { start: start, end: end });

                return readStream.pipe(res);


            } else {

                const readStream = createReadStream(file);

                readStream.on('open', () => res.setHeader('Content-Type', 'video/mp4'));
                readStream.on('error', err => handleError(res, 404, err))

                return readStream.pipe(res);

            }

        } catch (err) {
            return handleError(res, 500, err)
        }

    }

    if (isPostMethod && pathname === '/upload') {
        try {

            if (!allowedFormats.includes(req.headers['content-type'])) {
                return handleError(res, 400, 'Allowed format is mp4, mov or avi!!!');
            }

            const file = await uploader(req);

            res.setHeader('Content-Type', 'application/json');

            res.statusCode = 200;

            return res.end(JSON.stringify({
                message: 'Video was uploaded successfully!',
                url: file
            }));

        } catch (err) {
            return handleError(res, 400, err);
        }
    }


    if (isGetMethod && pathname === '/') {
        const stream = createReadStream(join(process.cwd(), 'public', 'index.html'))
        return stream.pipe(res)
    }

    if (isGetMethod && pathname === '/tailwind.css') {
        const stream = createReadStream(join(process.cwd(), 'public', 'tailwind.css'))
        return stream.pipe(res)
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: 'Route not found'}));

});

server.listen(port, hostname, () => {
    console.log(`Server running at ${fullHost}`);
});
