import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  verifyKey,
} from "discord-interactions";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const signature = req.headers["x-signature-ed25519"];
    const timestamp = req.headers["x-signature-timestamp"];

    if (!signature || !timestamp) {
      return res.status(401).send("Missing Discord signature");
    }

    const rawBody = await getRawBody(req);

    const isValid = await verifyKey(
      rawBody,
      signature,
      timestamp,
      process.env.DISCORD_PUBLIC_KEY
    );

    if (!isValid) {
      return res.status(401).send("Invalid signature");
    }

    const interaction = JSON.parse(rawBody.toString("utf8"));

    if (interaction.type === InteractionType.PING) {
      return res.status(200).json({
        type: InteractionResponseType.PONG,
      });
    }

    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "Discord connection successful! Translation setup is next.",
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
    }

    return res.status(400).send("Unsupported interaction type");
  } catch (error) {
    console.error("Interaction error:", error);
    return res.status(500).send("Internal server error");
  }
}
