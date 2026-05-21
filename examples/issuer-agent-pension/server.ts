import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import QRCode from 'qrcode';

import {
  getPensionClaimsBySlug,
  isPensionCredentialSlug,
  listPensionCredentialOptions,
} from './credential-catalog.ts';
import { renderDemoPage } from './demo-page.ts';
import {
  createAuthboundClient,
  createPensionCredentialOffer,
  createPensionVerificationRequest,
  getPensionVerificationResult,
  getPensionVerificationStatus,
} from './pension-flow.ts';
import {
  getVerificationClientToken,
  storeVerificationSession,
  toErrorPayload,
} from './utils.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3333);
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_request, response) => {
  response.type('html').send(renderDemoPage());
});

app.get('/credentials', (_request, response) => {
  response.json(listPensionCredentialOptions());
});

app.post('/offer', async (request, response) => {
  try {
    const slug = typeof request.body?.slug === 'string' ? request.body.slug : '';
    if (!isPensionCredentialSlug(slug)) {
      response.status(400).json({
        error: 'unknown_slug',
        message: 'Unknown pension credential slug',
        slugs: listPensionCredentialOptions().map((entry) => entry.slug),
      });
      return;
    }

    const client = createAuthboundClient();
    const claims = getPensionClaimsBySlug(slug);
    const offer = await createPensionCredentialOffer(client, claims);
    const qrSvg = await QRCode.toString(offer.credentialOfferUri, {
      type: 'svg',
      margin: 1,
      width: 256,
    });

    response.status(201).json({
      slug,
      typeCode: claims.Pension.typeCode,
      id: offer.id,
      status: offer.status,
      offerUri: offer.credentialOfferUri,
      offerQrUri: offer.offerQrUri,
      qrSvg,
    });
  } catch (error) {
    console.error(error);
    response.status(500).json(toErrorPayload(error));
  }
});

app.post('/verify', async (_request, response) => {
  try {
    const client = createAuthboundClient();
    const verification = await createPensionVerificationRequest(client);

    if (!verification.clientToken) {
      response.status(502).json({
        error: 'missing_client_token',
        message: 'Verification was created without a client token',
      });
      return;
    }

    storeVerificationSession(verification.verificationId, verification.clientToken);

    let qrSvg: string | undefined;
    const authorizationRequestUrl = verification.authorizationRequestUrl;
    if (authorizationRequestUrl) {
      qrSvg = await QRCode.toString(authorizationRequestUrl, {
        type: 'svg',
        margin: 1,
        width: 256,
      });
    }

    response.status(201).json({
      verificationId: verification.verificationId,
      status: verification.status,
      authorizationRequestUrl,
      qrSvg,
    });
  } catch (error) {
    console.error(error);
    response.status(500).json(toErrorPayload(error));
  }
});

app.get('/status', async (request, response) => {
  try {
    const verificationId =
      typeof request.query.id === 'string' ? request.query.id : undefined;
    if (!verificationId) {
      response.status(400).json({ error: 'missing_id', message: 'Query id is required' });
      return;
    }

    const clientToken = getVerificationClientToken(verificationId);
    if (!clientToken) {
      response.status(404).json({
        error: 'session_not_found',
        message: 'Verification session expired or unknown. Start verification again.',
      });
      return;
    }

    const client = createAuthboundClient();
    const status = await getPensionVerificationStatus(client, verificationId, clientToken);
    response.json(status);
  } catch (error) {
    console.error(error);
    response.status(500).json(toErrorPayload(error));
  }
});

app.get('/result', async (request, response) => {
  try {
    const verificationId =
      typeof request.query.id === 'string' ? request.query.id : undefined;
    if (!verificationId) {
      response.status(400).json({ error: 'missing_id', message: 'Query id is required' });
      return;
    }

    const client = createAuthboundClient();
    const result = await getPensionVerificationResult(client, verificationId);
    response.json(result);
  } catch (error) {
    console.error(error);
    response.status(500).json(toErrorPayload(error));
  }
});

app.listen(PORT, () => {
  console.log(`Pension issuer example running at http://127.0.0.1:${PORT}`);
});
