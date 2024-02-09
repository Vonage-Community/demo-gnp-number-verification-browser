import express from 'express';
import { NumberVerificationClient, NumberVerificationResponse } from '@vonage/network-number-verification';
import { v4 as uuidv4 } from 'uuid';
import {readFileSync} from 'fs';

const app = express();
const port = process.env.VCR_PORT || 3000;
const VONAGE_APPLICATION_ID = process.env.VONAGE_APPLICATION_ID;
const VONAGE_APPLICATION_PRIVATE_KEY = process.env.VONAGE_APPLICATION_PRIVATE_KEY;
const REDIRECT_URL = process.env.REDIRECT_URL;

const privateKeyBuff = readFileSync(VONAGE_APPLICATION_PRIVATE_KEY);
const privateKey = privateKeyBuff.toString('utf-8');

// In memory storage for verification requests
const verificationRequests = {};

// If the client doesnt send a state, generate one
const generateVerificationState = () => uuidv4();


app.use(express.json());

app.get('/_/health', async (_, res) => {
  res.sendStatus(200);
});

app.get('/prepStep1', async (req, res) => {
  const number = req.query.number;
  const state = req.query.state || generateVerificationState();

  const verificationRequest = {
    state: state,
    number: number,
    headers: req.headers,
    client: new NumberVerificationClient({
      applicationId: VONAGE_APPLICATION_ID,
      privateKey: privateKey,
      redirectUri: REDIRECT_URL || `https://localhost:${port}/step2`
    })
  };

  Object.assign(state, verificationRequest);

  const redirectUrl = client.buildOIDCURL(
    verificationRequest.client.state,
  );

  console.log(redirectUrl);

  res.json({ redirectUrl: redirectUrl });
});

app.get('/step2', async (req, res) => {
  const { code, state } = req.query;

  const verificationRequest = verificationRequests[state];

  if (!verificationRequest) {
    res.status(401).send("Server error - request doesnt exist");
    return;
  }

  if (verificationRequest.state !== state) {
    res.status(403).send("State is incorrect!");
    return;
  }

  // Exchange the code for a token
  const {access_token, expires_at} = await verificationRequest.client.exchangeCodeForToken(code);

  setTimeout(() => {
    delete verificationRequests[state];
  }, expires_at);

  // Set the token in a cookie but you can store it in the browser however you want
  res.cookie('state', state, { maxAge: expires_at });
  res.json({ access_token: access_token, expires_at: expires_at, state: state});
});

app.post('/verify-number', async (req, res) => {
  const { state } = req.cookie();
  const { number } = req.body;

  const verificationRequest = verificationRequests[state];

  if (!verificationRequest) {
    res.status(401).send("Server error - request doesnt exist");
    return;
  }

  const resp = await verificationRequest.client.verifyNumber(number);

  res.json(resp);
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`)
});
