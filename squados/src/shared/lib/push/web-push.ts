import webpush from 'web-push';

let configured = false;

function configure() {
  if (configured) return;
  const email = process.env.VAPID_EMAIL;
  const pub   = process.env.VAPID_PUBLIC_KEY;
  const priv  = process.env.VAPID_PRIVATE_KEY;
  if (!email || !pub || !priv) return;
  webpush.setVapidDetails(email, pub, priv);
  configured = true;
}

export async function sendPushNotification(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: { title: string; body: string; url?: string }
): Promise<void> {
  configure();
  await webpush.sendNotification(
    { endpoint, keys: { p256dh, auth } },
    JSON.stringify(payload),
    { TTL: 60 }
  );
}
