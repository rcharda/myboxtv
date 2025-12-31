const fetch = require('node-fetch');

exports.handler = async (event) => {
    const url = event.queryStringParameters.url;
    if (!url) return { statusCode: 400, body: 'URL manquante' };

    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        const contentType = response.headers.get('content-type');
        const buffer = await response.buffer();

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': contentType,
                'Cache-Control': 'no-cache'
            },
            body: buffer.toString('base64'),
            isBase64Encoded: true
        };
    } catch (error) {
        return { statusCode: 500, body: error.message };
    }
};
