import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  verifyKey,
} from "discord-interactions";

export const config = { api: { bodyParser: false } };
const EPHEMERAL = InteractionResponseFlags.EPHEMERAL;

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function reply(content) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: EPHEMERAL },
  };
}

async function translateText(text, target) {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text.slice(0, 4500));
  url.searchParams.set("langpair", target === "ar" ? "autodetect|ar" : "autodetect|en");
  const response = await fetch(url);
  if (!response.ok) throw new Error("Translation service is temporarily unavailable.");
  const data = await response.json();
  const translated = data?.responseData?.translatedText;
  if (!translated || data?.responseStatus !== 200) {
    throw new Error("The translation service could not translate that message.");
  }
  return translated;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");
  try {
    const signature = req.headers["x-signature-ed25519"];
    const timestamp = req.headers["x-signature-timestamp"];
    if (!signature || !timestamp || !process.env.DISCORD_PUBLIC_KEY) {
      return res.status(401).send("Missing Discord signature configuration");
    }

    const rawBody = await getRawBody(req);
    const isValid = await verifyKey(rawBody, signature, timestamp, process.env.DISCORD_PUBLIC_KEY);
    if (!isValid) return res.status(401).send("Invalid signature");

    const interaction = JSON.parse(rawBody.toString("utf8"));
    if (interaction.type === InteractionType.PING) {
      return res.status(200).json({ type: InteractionResponseType.PONG });
    }
    if (interaction.type !== InteractionType.APPLICATION_COMMAND) {
      return res.status(400).send("Unsupported interaction type");
    }

    // Message context-menu commands include the selected message in resolved.messages.
    const commandName = interaction.data?.name;
    const targets = {
      "Translate to Arabic": "ar",
      "Translate to English": "en",
    };
    const target = targets[commandName];
    if (!target || interaction.data?.type !== 3) {
      return res.status(200).json(reply("Please use the message menu: Apps → Translate to Arabic or Translate to English."));
    }

    const targetId = interaction.data?.target_id;
    const message = targetId ? interaction.data?.resolved?.messages?.[targetId] : null;
    const sourceText = (message?.content ?? "").trim();
    if (!sourceText) {
      return res.status(200).json(reply("That message has no text to translate. Image and attachment text are not supported yet."));
    }

    const translated = await translateText(sourceText, target);
    return res.status(200).json(reply(translated.slice(0, 1990)));
  } catch (error) {
    console.error("Interaction error:", error);
    return res.status(200).json(reply("Sorry, translation failed. Please try again in a moment."));
  }
}
