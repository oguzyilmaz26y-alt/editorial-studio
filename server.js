const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public')); // Uygulamanın arayüzü buradan yayınlanacak

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

app.get('/download/:id', (req, res) => {
    const file = path.join(__dirname, `output_${req.params.id}.mp4`);
    if (fs.existsSync(file)) {
        res.download(file, `Editorial_Reels_Pro.mp4`, () => {
            setTimeout(() => {
                try { fs.unlinkSync(file); } catch(e){}
                try { fs.unlinkSync(path.join(__dirname, `audio_${req.params.id}.mp3`)); } catch(e){}
            }, 10000); 
        });
    } else {
        res.status(404).send('Video bulunamadı.');
    }
});

io.on('connection', (socket) => {
    let passThrough;
    const outputPath = path.join(__dirname, `output_${socket.id}.mp4`);
    const audioPath = path.join(__dirname, `audio_${socket.id}.mp3`);

    socket.on('audio-upload', (data, callback) => {
        fs.writeFileSync(audioPath, data.buffer);
        if(callback) callback();
    });

    socket.on('start-render', (data) => {
        const { fps } = data;
        const { PassThrough } = require('stream');
        passThrough = new PassThrough();

        ffmpeg().input(passThrough).inputFormat('image2pipe').inputOptions([`-framerate ${fps}`]).input(audioPath)
            .outputOptions(['-c:v libx264', '-pix_fmt yuv420p', '-c:a aac', '-b:a 192k', '-shortest'])
            .output(outputPath)
            .on('end', () => socket.emit('render-complete', { id: socket.id }))
            .on('error', (err) => socket.emit('render-error', err.message))
            .run();
    });

    socket.on('frame', (data, callback) => {
        if (passThrough) passThrough.write(Buffer.from(data.image.split(',')[1], 'base64'));
        if(callback) callback(); 
    });

    socket.on('finish-frames', () => { if (passThrough) passThrough.end(); });
});

// Render.com kendi PORT'unu atar
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sunucu ${PORT} portunda hazır.`));
