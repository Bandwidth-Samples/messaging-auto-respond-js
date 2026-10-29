import { MessagesApi, Configuration } from 'bandwidth-sdk';
import express from 'express';

const BW_ACCOUNT_ID = process.env.BW_ACCOUNT_ID;
const BW_CLIENT_ID = process.env.BW_CLIENT_ID;
const BW_CLIENT_SECRET = process.env.BW_CLIENT_SECRET;
const BW_MESSAGING_APPLICATION_ID = process.env.BW_MESSAGING_APPLICATION_ID;
const BW_NUMBER = process.env.BW_NUMBER;
const LOCAL_PORT = process.env.LOCAL_PORT;

if([
    BW_ACCOUNT_ID,
    BW_CLIENT_ID,
    BW_CLIENT_SECRET,
    BW_MESSAGING_APPLICATION_ID,
    BW_NUMBER,
    LOCAL_PORT
].some(item => item === undefined) || !Number.isInteger(Number(LOCAL_PORT))) {
    throw new Error('Please set the environment variables defined in the README');
}

const config = new Configuration({
    clientId: BW_CLIENT_ID,
    clientSecret: BW_CLIENT_SECRET
});

const STATUS_MESSAGES = {
    'message-sending': 'message-sending type is only for MMS.',
    'message-delivered': "Your message has been handed off to the Bandwidth's MMSC network, but has not been confirmed at the downstream carrier.",
    'message-failed': 'For MMS and Group Messages, you will only receive this callback if you have enabled delivery receipts on MMS.'
};

const REPLIES = {
    stop: "STOP: OK, you'll no longer receive messages from us.",
    quit: "QUIT: OK, you'll no longer receive messages from us.",
    help: 'Valid words are: STOP, QUIT, HELP, and INFO. Reply STOP or QUIT to opt out.',
    info: 'INFO: This is the test responder service. Reply STOP or QUIT to opt out.'
};
const DEFAULT_REPLY = 'Please respond with a valid word. Reply HELP for help.';

const app = express();
app.use(express.json());

const isCallbackList = (body) => Array.isArray(body) && body.every(callback => typeof callback === 'object' && callback !== null);

const autoReply = (text) => {
    const keyword = (text ?? '').trim().toLowerCase();
    return Object.hasOwn(REPLIES, keyword) ? REPLIES[keyword] : DEFAULT_REPLY;
};

const sendReply = async (to, text) => {
    const body = {
        applicationId: BW_MESSAGING_APPLICATION_ID,
        to: [to],
        from: BW_NUMBER,
        text: text
    };

    try {
        const messagesApi = new MessagesApi(config);
        const { data } = await messagesApi.createMessage(BW_ACCOUNT_ID, body);
        console.log(`Sent reply ${data.id}\nTo: ${to}\nText: ${text}`);
    } catch (err) {
        console.error('Failed to send reply:', err.message);
    }
};

app.post('/callbacks/outbound/messaging/status', async (req, res) => {
    const callbacks = req.body;
    if (!isCallbackList(callbacks) || !callbacks.every(callback => Object.hasOwn(STATUS_MESSAGES, callback.type))) {
        return res.sendStatus(400);
    }

    callbacks.forEach(callback => console.log(STATUS_MESSAGES[callback.type]));
    res.sendStatus(204);
});

app.post('/callbacks/inbound/messaging', async (req, res) => {
    const callbacks = req.body;
    if (!isCallbackList(callbacks) || !callbacks.every(callback => callback.type === 'message-received')) {
        return res.sendStatus(400);
    }

    for (const callback of callbacks) {
        const message = callback.message;
        console.log(`${callback.description}\nTo: ${message.to[0]}\nFrom: ${message.from}\nText: ${message.text}`);
        await sendReply(message.from, autoReply(message.text));
    }
    res.sendStatus(204);
});

app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
        return res.sendStatus(400);
    }
    next(err);
});

app.listen(LOCAL_PORT);
